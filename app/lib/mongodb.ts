import "server-only";
import { MongoClient } from "mongodb";

// Reuse the client across hot reloads in development so we don't open a new
// connection pool on every file change.
const globalForMongo = globalThis as unknown as {
  _mongoClientPromise?: Promise<MongoClient>;
};

function getClient() {
  if (!globalForMongo._mongoClientPromise) {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error("MONGODB_URI is not set in .env.local");
    }
    globalForMongo._mongoClientPromise = new MongoClient(uri).connect();
  }
  return globalForMongo._mongoClientPromise;
}

export async function getDb() {
  const client = await getClient();
  return client.db(process.env.MONGODB_DB || "nexuses_drive");
}
