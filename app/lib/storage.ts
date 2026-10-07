import "server-only";
import { randomUUID } from "node:crypto";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// File bytes live in S3. Callers only see an opaque object key.

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set in .env.local`);
  return value;
}

function s3() {
  return new S3Client({
    region: required("AWS_REGION"),
    credentials: {
      accessKeyId: required("AWS_ACCESS_KEY_ID"),
      secretAccessKey: required("AWS_SECRET_ACCESS_KEY"),
    },
  });
}

function bucket() {
  return required("AWS_S3_BUCKET");
}

export async function saveFile(file: File, ownerId: string): Promise<string> {
  const key = `${ownerId}/${randomUUID()}`;
  await s3().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: Buffer.from(await file.arrayBuffer()),
      ContentType: file.type || "application/octet-stream",
      ContentLength: file.size,
    }),
  );
  return key;
}

const LINK_SECONDS = 7 * 24 * 60 * 60;

/** A temporary URL that opens this object directly from S3. Valid for 7 days. */
export async function presignFile(storageKey: string) {
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: bucket(), Key: storageKey }), {
    expiresIn: LINK_SECONDS,
  });
}

export async function readFile(storageKey: string): Promise<ReadableStream> {
  const result = await s3().send(
    new GetObjectCommand({ Bucket: bucket(), Key: storageKey }),
  );
  if (!result.Body) throw new Error("The file in storage is empty.");
  return result.Body.transformToWebStream();
}

export async function deleteFiles(storageKeys: string[]) {
  const keys = storageKeys.filter(Boolean);
  if (keys.length === 0) return;

  const client = s3();
  const Bucket = bucket();
  for (let index = 0; index < keys.length; index += 1000) {
    const chunk = keys.slice(index, index + 1000);
    await client.send(
      new DeleteObjectsCommand({
        Bucket,
        Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
      }),
    );
  }
}
