import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config, isProduction } from "../config.js";
import { AppError } from "../utils/errors.js";
import type { Database, SerialNumber } from "../types.js";
import {
  createBlankDatabase,
  createSeedDatabase,
  DB_VERSION,
  SEED_MODELS,
  SEED_PHOTO_REQUIREMENTS,
} from "./seed.js";
import type { AnyBulkWriteOperation } from "mongodb";
import {
  getMongoCollection,
  getSerialsCollection,
  isMongoEnabled,
  type StoredDatabaseDocument,
  type StoredSerialDocument,
} from "./mongo.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "../../data");
const DATA_FILE = resolve(DATA_DIR, "database.json");
const PRIMARY_DOCUMENT_ID = "primary";

/**
 * How many times a write replays against fresh state before giving up. A
 * conflict only happens when another instance committed between our read and
 * our write, so a handful of attempts is far more than enough in practice.
 */
const MAX_WRITE_ATTEMPTS = 5;

let cache: Database | null = null;
/**
 * The `rev` of the stored document `cache` was loaded from. Every write is
 * conditional on it, which is what stops one serverless instance from
 * overwriting a document another instance has already moved forward.
 */
let cachedRev = 0;
let revision = 0;
let persistenceDisabled = false;
let useMongo = false;
const listeners = new Set<() => void>();
let idCounter = 0;
/**
 * Serial id → the JSON of the serial as it was last written. Diffing against
 * this keeps a write to the serials collection proportional to what actually
 * changed instead of resending every row.
 */
let persistedSerials = new Map<string, string>();
/** The serials-collection revision the cached serials were read at. */
let cachedSerialsRev = 0;

function ensureDir(): void {
  mkdirSync(DATA_DIR, { recursive: true });
}

function isDatabaseShape(value: unknown): value is Database {
  if (!value || typeof value !== "object") return false;
  const db = value as Database;
  return (
    typeof db.version === "number" &&
    db.version <= DB_VERSION &&
    Array.isArray(db.models) &&
    Array.isArray(db.serials) &&
    Array.isArray(db.registrations) &&
    Array.isArray(db.photoRequirements)
  );
}

/**
 * Brings a stored database up to `DB_VERSION` in place.
 *
 * Older snapshots are intentionally replaced with the blank workspace so the
 * checked-in seed data never comes back after a deploy or restart.
 * Returns true when something changed and the result needs persisting.
 */
function migrate(db: Database): boolean {
  if (db.version < 6) {
    Object.assign(db, createBlankDatabase());
    return true;
  }

  let changed = db.version !== DB_VERSION;
  if (!Array.isArray(db.series)) {
    db.series = [];
    changed = true;
  }
  if (!Array.isArray(db.serialImportFiles)) {
    db.serialImportFiles = [];
    changed = true;
  }
  // Series created before v8 did not record whether their serials were for an
  // inverter or a battery. Infer that once so existing inventory remains valid.
  db.series.forEach((series) => {
    const modelTypes = new Set(
      db.models
        .filter((model) => model.series.trim().toLowerCase() === series.name.trim().toLowerCase())
        .map((model) => model.productType),
    );
    const serialTypes = new Set(
      db.serials
        .filter((serial) => serial.seriesId === series.id)
        .map((serial) => serial.productType),
    );
    // The old uploader defaulted every row to inverter. A matching product
    // catalog series is therefore more trustworthy when it has one clear type.
    const inferredType = modelTypes.size === 1
      ? [...modelTypes][0]!
      : serialTypes.size === 1
        ? [...serialTypes][0]!
        : series.productType === "battery" || series.productType === "combo"
          ? series.productType
          : "inverter";
    if (series.productType !== inferredType) {
      series.productType = inferredType;
      changed = true;
    }
    if (modelTypes.size === 1) {
      db.serials
        .filter(
          (serial) =>
            serial.seriesId === series.id &&
            serial.productType !== inferredType,
        )
        .forEach((serial) => {
          serial.productType = inferredType;
          changed = true;
        });
    }
  });
  // Models used to be tied to a series only by a matching name string, which
  // broke as soon as a series was renamed. Bind them by id once.
  db.models.forEach((model) => {
    if (model.seriesId) return;
    const owner = db.series.find(
      (series) => series.name.trim().toLowerCase() === model.series.trim().toLowerCase(),
    );
    if (owner) {
      model.seriesId = owner.id;
      changed = true;
    }
  });
  if (db.models.length === 0) {
    db.models = SEED_MODELS.map((model) => ({ ...model }));
    changed = true;
  }
  // The photos step is mandatory — a registration cannot be submitted without
  // photos — so an empty checklist leaves the customer with nothing to upload
  // and the super admin with nothing to edit on Customer Fields. Restore the
  // standard three as real, editable rows so both sides read the same list.
  if (db.photoRequirements.length === 0) {
    db.photoRequirements = SEED_PHOTO_REQUIREMENTS.map((entry) => ({ ...entry }));
    changed = true;
  }
  db.version = DB_VERSION;
  return changed;
}

function persistFile(db: Database): void {
  if (persistenceDisabled) return;
  try {
    ensureDir();
    writeFileSync(DATA_FILE, `${JSON.stringify(db, null, 2)}\n`, "utf8");
  } catch {
    persistenceDisabled = true;
  }
}

function loadFile(): Database {
  if (existsSync(DATA_FILE)) {
    try {
      const parsed = JSON.parse(readFileSync(DATA_FILE, "utf8")) as Database;
      if (isDatabaseShape(parsed)) {
        if (migrate(parsed)) persistFile(parsed);
        return parsed;
      }
    } catch {
      // Fall through to a fresh empty workspace.
    }
  }

  const fresh = createSeedDatabase();
  persistFile(fresh);
  return fresh;
}

function stripDocumentId(document: StoredDatabaseDocument): Omit<Database, "serials"> {
  const { _id: _ignored, rev: _rev, ...db } = document;
  return db as Omit<Database, "serials">;
}

function snapshotSerials(serials: SerialNumber[]): Map<string, string> {
  return new Map(serials.map((serial) => [serial.id, JSON.stringify(serial)]));
}

/**
 * Writes only the serials that were added, changed or removed since the last
 * commit. Serial rows are independent documents, so two instances editing
 * different serials never contend.
 */
async function writeSerials(serials: SerialNumber[]): Promise<boolean> {
  const next = snapshotSerials(serials);
  const operations: AnyBulkWriteOperation<StoredSerialDocument>[] = [];

  serials.forEach((serial) => {
    if (persistedSerials.get(serial.id) === next.get(serial.id)) return;
    operations.push({
      replaceOne: {
        filter: { _id: serial.id },
        // `_id` is the serial's own id, carried by the filter on replace.
        replacement: { ...serial } as StoredSerialDocument,
        upsert: true,
      },
    });
  });

  const removed = [...persistedSerials.keys()].filter((id) => !next.has(id));
  if (removed.length > 0) {
    operations.push({ deleteMany: { filter: { _id: { $in: removed } } } });
  }

  if (operations.length === 0) return false;
  const collection = await getSerialsCollection();
  await collection.bulkWrite(operations, { ordered: false });
  persistedSerials = next;
  return true;
}

async function readSerials(): Promise<SerialNumber[]> {
  const collection = await getSerialsCollection();
  const documents = await collection.find({}).toArray();
  return documents.map((document) => {
    const { _id: _ignored, ...serial } = document;
    return serial as SerialNumber;
  });
}

function documentRevision(document: Partial<StoredDatabaseDocument>): number {
  return typeof document.rev === "number" ? document.rev : 0;
}

/** Reads the whole document and adopts it as the current cache. */
async function loadMongo(): Promise<void> {
  const collection = await getMongoCollection();
  const existing = await collection.findOne({ _id: PRIMARY_DOCUMENT_ID });

  if (existing) {
    // Serials used to live inside this document. Move any that are still there
    // into their own collection once, then read them back from it.
    const inlineSerials = Array.isArray(
      (existing as Partial<Database>).serials,
    )
      ? ((existing as unknown as Database).serials ?? [])
      : null;

    if (inlineSerials && inlineSerials.length > 0) {
      persistedSerials = new Map();
      await writeSerials(inlineSerials);
      await collection.updateOne(
        { _id: PRIMARY_DOCUMENT_ID },
        { $unset: { serials: "" } },
      );
    }

    // Reuse the serials already in memory when the collection has not moved,
    // so an unrelated edit does not drag thousands of rows over the wire.
    const storedSerialsRev =
      typeof existing.serialsRev === "number" ? existing.serialsRev : 0;
    const canReuseSerials =
      cache !== null && storedSerialsRev === cachedSerialsRev && !inlineSerials;
    const serials = canReuseSerials ? cache!.serials : await readSerials();

    const db = { ...stripDocumentId(existing), serials } as Database;
    persistedSerials = snapshotSerials(serials);
    cachedSerialsRev = storedSerialsRev;

    if (isDatabaseShape(db)) {
      cache = db;
      cachedRev = documentRevision(existing);
      revision += 1;
      if (migrate(db)) {
        // A migration is a normal write: it has to win the same race as any
        // other, otherwise it could roll back a concurrent registration.
        await writeMongo(db);
      }
      return;
    }
  }

  const fresh = createSeedDatabase();
  const { serials: freshSerials, ...freshState } = fresh;
  persistedSerials = new Map();
  await writeSerials(freshSerials);
  await collection.updateOne(
    { _id: PRIMARY_DOCUMENT_ID },
    { $set: { ...freshState, rev: 1, serialsRev: 1 } },
    { upsert: true },
  );
  cache = fresh;
  cachedRev = 1;
  cachedSerialsRev = 1;
  revision += 1;
}

/**
 * Compare-and-set the whole document.
 *
 * The update only applies while the stored `rev` is still the one this
 * instance last read. If another instance has written in the meantime the
 * filter misses, nothing is overwritten, and the caller replays against the
 * newer state instead.
 *
 * Returns false on a conflict; throws if the database itself is unreachable.
 */
async function writeMongo(db: Database): Promise<boolean> {
  const collection = await getMongoCollection();
  const nextRev = cachedRev + 1;

  // Serial rows go first: they are addressed individually and upserted, so a
  // replay after a conflict simply writes them again.
  const serialsChanged = await writeSerials(db.serials);
  const nextSerialsRev = serialsChanged ? cachedSerialsRev + 1 : cachedSerialsRev;

  // Documents written before revisions existed carry no `rev` at all; treat
  // that as revision 0 so the first write after deploying this fix lands.
  const filter =
    cachedRev === 0
      ? {
          _id: PRIMARY_DOCUMENT_ID,
          $or: [{ rev: 0 }, { rev: { $exists: false } }],
        }
      : { _id: PRIMARY_DOCUMENT_ID, rev: cachedRev };

  const { serials: _serials, ...state } = clone(db);
  const result = await collection.updateOne(filter, {
    $set: { ...state, rev: nextRev, serialsRev: nextSerialsRev },
  });

  if (result.matchedCount === 0) return false;
  cachedRev = nextRev;
  cachedSerialsRev = nextSerialsRev;
  return true;
}

export async function initializeStore(): Promise<void> {
  if (cache) return;

  if (isMongoEnabled()) {
    try {
      useMongo = true;
      await loadMongo();
      console.log("Database connected successfully (MongoDB).");
      return;
    } catch (error) {
      if (isProduction) {
        throw new AppError(
          "MongoDB is unavailable. Production requires durable database storage.",
          503,
          "database_unavailable",
        );
      }
      useMongo = false;
      console.warn(
        "MongoDB was configured but could not be reached. Falling back to the local JSON store.",
        error,
      );
    }
  }

  if (isProduction) {
    throw new AppError(
      "MONGODB_URI must be configured in production so warranty and session data persists.",
      503,
      "database_not_configured",
    );
  }

  useMongo = false;
  cache = loadFile();
  console.log("Database connected successfully (local JSON store).");
}

export function isMongoStoreActive(): boolean {
  return useMongo;
}

/**
 * Brings this instance up to date before a request is served.
 *
 * Each serverless instance keeps its own in-memory copy of the database, so
 * without this a lambda that booted before a registration was created would
 * keep serving a snapshot that does not contain it — the warranty appearing
 * and disappearing depending on which instance answered. The revision check
 * is a tiny projected read; the full document is only transferred when it has
 * actually changed.
 */
export async function refreshFromStore(): Promise<void> {
  if (!useMongo) return;
  if (!cache) {
    await loadMongo();
    return;
  }

  const collection = await getMongoCollection();
  const head = await collection.findOne(
    { _id: PRIMARY_DOCUMENT_ID },
    { projection: { rev: 1 } },
  );

  if (!head || documentRevision(head) !== cachedRev) {
    await loadMongo();
  }
}

export function getDatabase(): Database {
  if (cache) return cache;

  if (!useMongo) {
    cache = loadFile();
    return cache;
  }

  throw new AppError(
    "Database has not been initialized yet.",
    500,
    "database_unavailable",
  );
}

export function clone<T>(value: T): T {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : (JSON.parse(JSON.stringify(value)) as T);
}

export function createId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}${idCounter.toString(36)}`;
}

/**
 * Applies a change and commits it durably before returning.
 *
 * On MongoDB the commit is conditional on the revision this instance read, so
 * a stale instance can never overwrite newer data. When another instance wins
 * the race the partial edit is discarded, the newer state is adopted, and the
 * mutator is replayed against it — which is why mutators must derive
 * everything they need from the `db` they are handed rather than from values
 * captured beforehand.
 */
export async function mutate<T>(mutator: (db: Database) => T): Promise<T> {
  for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt += 1) {
    const db = getDatabase();
    const result = mutator(db);

    if (!useMongo) {
      revision += 1;
      persistFile(db);
      listeners.forEach((listener) => listener());
      return result;
    }

    if (await writeMongo(db)) {
      revision += 1;
      listeners.forEach((listener) => listener());
      return result;
    }

    // Another instance committed first. Drop this attempt entirely — including
    // the edit it made to the cached copy — and replay on their state.
    await loadMongo();
  }

  throw new AppError(
    "The database is handling too many changes at once. Please try again.",
    503,
    "write_conflict",
  );
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getRevision(): number {
  return revision;
}

export async function resetDatabase(): Promise<void> {
  persistenceDisabled = false;
  await mutate((db) => {
    Object.assign(db, createBlankDatabase());
  });
}
