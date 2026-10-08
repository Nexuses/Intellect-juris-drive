import "server-only";
import { randomUUID } from "node:crypto";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

// File bytes live in S3. The database stores the link, not the file.

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

/** Public object address. It stays valid because the bucket allows public reads. */
export function publicFileUrl(storageKey: string) {
  const encodedKey = storageKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `https://${bucket()}.s3.${required("AWS_REGION")}.amazonaws.com/${encodedKey}`;
}

export async function saveFile(file: File, ownerId: string) {
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
  return { key, url: publicFileUrl(key) };
}

/** Object key embedded in a virtual-hosted or path-style S3 URL. */
export function keyFromLink(link: string) {
  try {
    const url = new URL(link);
    const path = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    if (!path) return null;
    if (/^s3[.-]/.test(url.hostname)) {
      const slash = path.indexOf("/");
      return slash === -1 ? null : path.slice(slash + 1);
    }
    return path;
  } catch {
    return null;
  }
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
