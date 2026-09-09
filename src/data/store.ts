import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config, isProduction } from "../config.js";
import { AppError } from "../utils/errors.js";
import type { Database } from "../types.js";
import {
  createBlankDatabase,
  createSeedDatabase,
  DB_VERSION,
  SEED_MODELS,
} from "./seed.js";
import { getMongoCollection, isMongoEnabled, type StoredDatabaseDocument } from "./mongo.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "../../data");
const DATA_FILE = resolve(DATA_DIR, "database.json");
const PRIMARY_DOCUMENT_ID = "primary";

let cache: Database | null = null;
let revision = 0;
let persistenceDisabled = false;
let useMongo = false;
const listeners = new Set<() => void>();
let idCounter = 0;
let persistQueue = Promise.resolve();

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
  if (db.models.length === 0) {
    db.models = SEED_MODELS.map((model) => ({ ...model }));
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

async function loadMongo(): Promise<Database> {
  const collection = await getMongoCollection();
  const existing = await collection.findOne({ _id: PRIMARY_DOCUMENT_ID });
  if (existing && isDatabaseShape(existing)) {
    const db = stripDocumentId(existing);
    if (migrate(db)) {
      await collection.updateOne({ _id: PRIMARY_DOCUMENT_ID }, { $set: db });
    }
    return db;
  }

  const fresh = createSeedDatabase();
  await collection.updateOne(
    { _id: PRIMARY_DOCUMENT_ID },
    { $set: fresh },
    { upsert: true },
  );
  return fresh;
}

function stripDocumentId(document: StoredDatabaseDocument): Database {
  const { _id: _ignored, ...db } = document;
  return db;
}

async function persistMongo(db: Database): Promise<void> {
  if (persistenceDisabled) return;
  const collection = await getMongoCollection();
  await collection.updateOne(
    { _id: PRIMARY_DOCUMENT_ID },
    { $set: db },
    { upsert: true },
  );
}

function schedulePersist(db: Database): void {
  const snapshot = clone(db);
  if (!useMongo) {
    persistFile(snapshot);
    return;
  }

  persistQueue = persistQueue
    .then(() => persistMongo(snapshot))
    .catch((error: unknown) => {
      persistenceDisabled = true;
      console.error("Failed to persist MongoDB state:", error);
    });
}

export async function initializeStore(): Promise<void> {
  if (cache) return;

  if (isMongoEnabled()) {
    try {
      cache = await loadMongo();
      useMongo = true;
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

export function mutate<T>(mutator: (db: Database) => T): T {
  const db = getDatabase();
  const result = mutator(db);
  revision += 1;
  schedulePersist(db);
  listeners.forEach((listener) => listener());
  return result;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getRevision(): number {
  return revision;
}

export function resetDatabase(): void {
  cache = createBlankDatabase();
  revision += 1;
  persistenceDisabled = false;
  schedulePersist(cache);
  listeners.forEach((listener) => listener());
}
