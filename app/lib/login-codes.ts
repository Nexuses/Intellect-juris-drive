import "server-only";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { ObjectId } from "mongodb";
import { cookies } from "next/headers";
import { getDb } from "./mongodb";
import type { Role } from "./users";

export const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RESEND_SECONDS = 30;
const CHALLENGE_COOKIE = "login_challenge";

type ChallengeDoc = {
  _id: ObjectId;
  userId: ObjectId;
  codeHash: string;
  attempts: number;
  sentAt: Date;
  expiresAt: Date;
};

type ChallengePayload = { challengeId: string; role: Role; email: string };

let indexesReady: Promise<unknown> | null = null;

async function challenges() {
  const col = (await getDb()).collection<ChallengeDoc>("login_challenges");
  indexesReady ??= Promise.all([
    col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    col.createIndex({ userId: 1 }),
  ]).catch((error) => {
    indexesReady = null;
    throw error;
  });
  await indexesReady;
  return col;
}

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is not set in .env.local");
  return value;
}

function hashCode(challengeId: ObjectId, code: string) {
  return createHmac("sha256", secret()).update(`${challengeId.toHexString()}:${code}`).digest("hex");
}

function newCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Starts a login challenge for a user whose password was correct. Returns the code to email. */
export async function startChallenge(user: { id: string; role: Role; email: string }) {
  const col = await challenges();
  const userId = new ObjectId(user.id);
  await col.deleteMany({ userId });

  const _id = new ObjectId();
  const code = newCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CODE_MINUTES * 60_000);
  await col.insertOne({ _id, userId, codeHash: hashCode(_id, code), attempts: 0, sentAt: now, expiresAt });

  const token = await new SignJWT({ challengeId: _id.toHexString(), role: user.role, email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${CODE_MINUTES}m`)
    .sign(new TextEncoder().encode(secret()));
  (await cookies()).set(CHALLENGE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
  return code;
}

async function readChallengeCookie() {
  const token = (await cookies()).get(CHALLENGE_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify<ChallengePayload>(token, new TextEncoder().encode(secret()), {
      algorithms: ["HS256"],
    });
    return ObjectId.isValid(payload.challengeId) ? payload : null;
  } catch {
    return null;
  }
}

export async function clearChallenge() {
  const payload = await readChallengeCookie();
  if (payload) await (await challenges()).deleteOne({ _id: new ObjectId(payload.challengeId) });
  (await cookies()).delete(CHALLENGE_COOKIE);
}

/** The pending challenge's email and role, if one is still valid. */
export async function pendingChallenge() {
  const payload = await readChallengeCookie();
  if (!payload) return null;
  const doc = await (await challenges()).findOne({ _id: new ObjectId(payload.challengeId) });
  if (!doc || doc.expiresAt < new Date()) return null;
  return { email: payload.email, role: payload.role };
}

export type VerifyResult =
  | { ok: true; userId: string; role: Role }
  | { ok: false; error: string; restart?: boolean };

export async function verifyChallenge(code: string): Promise<VerifyResult> {
  const payload = await readChallengeCookie();
  if (!payload) return { ok: false, restart: true, error: "Your code expired. Sign in again to get a new one." };

  const col = await challenges();
  const id = new ObjectId(payload.challengeId);
  const doc = await col.findOne({ _id: id });
  if (!doc || doc.expiresAt < new Date()) {
    await clearChallenge();
    return { ok: false, restart: true, error: "Your code expired. Sign in again to get a new one." };
  }
  if (doc.attempts >= MAX_ATTEMPTS) {
    await clearChallenge();
    return { ok: false, restart: true, error: "Too many wrong codes. Sign in again to get a new one." };
  }

  const expected = Buffer.from(doc.codeHash, "hex");
  const actual = Buffer.from(hashCode(id, code), "hex");
  if (!/^\d{6}$/.test(code) || !timingSafeEqual(expected, actual)) {
    await col.updateOne({ _id: id }, { $inc: { attempts: 1 } });
    const left = MAX_ATTEMPTS - doc.attempts - 1;
    return {
      ok: false,
      error: left > 0 ? `That code is not correct. ${left} ${left === 1 ? "try" : "tries"} left.` : "That code is not correct.",
    };
  }

  await clearChallenge();
  return { ok: true, userId: doc.userId.toHexString(), role: payload.role };
}

/** Issues a fresh code for the pending challenge, keeping its expiry and wrong-attempt count. */
export async function refreshChallenge(): Promise<
  { userId: string; code: string; minutesLeft: number } | { error: string; restart?: boolean }
> {
  const payload = await readChallengeCookie();
  if (!payload) return { restart: true, error: "Your sign-in expired. Sign in again." };
  const col = await challenges();
  const id = new ObjectId(payload.challengeId);
  const doc = await col.findOne({ _id: id });
  if (!doc || doc.expiresAt < new Date()) return { restart: true, error: "Your sign-in expired. Sign in again." };

  const wait = Math.ceil((doc.sentAt.getTime() + RESEND_SECONDS * 1000 - Date.now()) / 1000);
  if (wait > 0) return { error: `Please wait ${wait} seconds before asking for a new code.` };

  const code = newCode();
  await col.updateOne({ _id: id }, { $set: { codeHash: hashCode(id, code), sentAt: new Date() } });
  const minutesLeft = Math.max(1, Math.ceil((doc.expiresAt.getTime() - Date.now()) / 60_000));
  return { userId: doc.userId.toHexString(), code, minutesLeft };
}
