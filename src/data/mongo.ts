import { MongoClient, type Collection, type Db } from "mongodb";
import { config } from "../config.js";
import { AppError } from "../utils/errors.js";
import type { Database } from "../types.js";

export type StoredDatabaseDocument = Database & {
  _id: string;
};

const STATE_COLLECTION = "app_state";

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
