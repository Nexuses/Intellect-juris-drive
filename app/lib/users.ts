import "server-only";
import bcrypt from "bcryptjs";
import { MongoServerError, ObjectId } from "mongodb";
import { getDb } from "./mongodb";

export type Role = "admin" | "user";

type UserDoc = {
  _id: ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  createdAt: Date;
};

type MetaDoc = {
  _id: string;
  userId: ObjectId;
  claimedAt: Date;
};

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: Date;
};

const ADMIN_CLAIM_ID = "admin";

let indexesReady: Promise<unknown> | null = null;

async function collections() {
  const db = await getDb();
  const users = db.collection<UserDoc>("users");
  const meta = db.collection<MetaDoc>("app_meta");

  indexesReady ??= users
    .createIndex({ email: 1 }, { unique: true })
    .catch((error) => {
      indexesReady = null;
      throw error;
    });
  await indexesReady;

  return { users, meta };
}

function toPublicUser(doc: UserDoc): PublicUser {
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    email: doc.email,
    role: doc.role,
    createdAt: doc.createdAt,
  };
}

function isDuplicateKeyError(error: unknown) {
  return error instanceof MongoServerError && error.code === 11000;
}

export async function hasAdmin() {
  const { meta } = await collections();
  return (await meta.countDocuments({ _id: ADMIN_CLAIM_ID }, { limit: 1 })) > 0;
}

export async function createUser(input: {
  name: string;
  email: string;
  password: string;
}): Promise<{ user: PublicUser } | { error: "email_taken" }> {
  const { users, meta } = await collections();
  const passwordHash = await bcrypt.hash(input.password, 10);

  const doc: UserDoc = {
    _id: new ObjectId(),
    name: input.name,
    email: input.email,
    passwordHash,
    role: "user",
    createdAt: new Date(),
  };

  try {
    await users.insertOne(doc);
  } catch (error) {
    if (isDuplicateKeyError(error)) return { error: "email_taken" };
    throw error;
  }

  // The admin slot is a single document with a fixed _id, so only one signup
  // can ever claim it, even if several people sign up at the same moment.
  try {
    await meta.insertOne({
      _id: ADMIN_CLAIM_ID,
      userId: doc._id,
      claimedAt: new Date(),
    });
    await users.updateOne({ _id: doc._id }, { $set: { role: "admin" } });
    doc.role = "admin";
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
  }

  return { user: toPublicUser(doc) };
}

export async function verifyCredentials(email: string, password: string) {
  const { users } = await collections();
  const doc = await users.findOne({ email });
  if (!doc) return null;

  const valid = await bcrypt.compare(password, doc.passwordHash);
  return valid ? toPublicUser(doc) : null;
}

export async function findUserById(id: string) {
  if (!ObjectId.isValid(id)) return null;
  const { users } = await collections();
  const doc = await users.findOne({ _id: new ObjectId(id) });
  return doc ? toPublicUser(doc) : null;
}

export async function updateUser(
  id: string,
  input: { name: string; email: string; password?: string },
): Promise<{ user: PublicUser } | { error: "email_taken" | "not_found" }> {
  if (!ObjectId.isValid(id)) return { error: "not_found" };
  const { users } = await collections();

  const changes: Partial<UserDoc> = { name: input.name, email: input.email };
  if (input.password) {
    changes.passwordHash = await bcrypt.hash(input.password, 10);
  }

  try {
    const doc = await users.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: changes },
      { returnDocument: "after" },
    );
    return doc ? { user: toPublicUser(doc) } : { error: "not_found" };
  } catch (error) {
    if (isDuplicateKeyError(error)) return { error: "email_taken" };
    throw error;
  }
}

export async function deleteRegularUser(id: string) {
  if (!ObjectId.isValid(id)) return false;
  const { users } = await collections();
  const result = await users.deleteOne({ _id: new ObjectId(id), role: "user" });
  return result.deletedCount === 1;
}

export async function listUsers() {
  const { users } = await collections();
  const docs = await users.find().sort({ createdAt: 1 }).toArray();
  return docs.map(toPublicUser);
}
