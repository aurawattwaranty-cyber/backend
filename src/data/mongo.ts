import { MongoClient, type Collection, type Db } from "mongodb";
import { config } from "../config.js";
import { AppError } from "../utils/errors.js";
import type { Database, SerialNumber } from "../types.js";

/**
 * Serials are stored one per document rather than inside the state document.
 * Thousands of them in a single document made every unrelated write — a login,
 * an approval — carry a megabyte of payload, which took long enough that
 * serverless writes were being abandoned before they committed.
 */
export type StoredSerialDocument = SerialNumber & { _id: string };

export type StoredDatabaseDocument = Omit<Database, "serials"> & {
  _id: string;
  /**
   * Bumped on every committed write. Writers condition their update on the
   * revision they read, so a stale instance's update matches nothing instead
   * of overwriting newer data.
   */
  rev: number;
  /**
   * Bumped only when the serials collection changes, so a refresh can skip
   * re-reading thousands of serial rows for an unrelated edit.
   */
  serialsRev: number;
};

const STATE_COLLECTION = "app_state";
const SERIALS_COLLECTION = "serials";

let client: MongoClient | null = null;
let clientPromise: Promise<MongoClient> | null = null;

export function isMongoEnabled(): boolean {
  return Boolean(config.mongoUri.trim());
}

async function createClient(): Promise<MongoClient> {
  if (!isMongoEnabled()) {
    throw new AppError(
      "MONGODB_URI is missing. Add it to backend/.env before starting the API.",
      500,
      "database_not_configured",
    );
  }

  if (client) return client;
  if (!clientPromise) {
    const mongoClient = new MongoClient(config.mongoUri, {
      ignoreUndefined: true,
    });
    clientPromise = mongoClient.connect().then((connected) => {
      client = connected;
      return connected;
    });
  }

  return clientPromise;
}

export async function getMongoDb(): Promise<Db> {
  const connected = await createClient();
  return connected.db(config.databaseName);
}

export async function getMongoCollection(): Promise<Collection<StoredDatabaseDocument>> {
  const db = await getMongoDb();
  return db.collection<StoredDatabaseDocument>(STATE_COLLECTION);
}

export async function getSerialsCollection(): Promise<Collection<StoredSerialDocument>> {
  const db = await getMongoDb();
  return db.collection<StoredSerialDocument>(SERIALS_COLLECTION);
}
