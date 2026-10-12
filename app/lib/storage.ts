import "server-only";
import { randomUUID } from "node:crypto";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

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

const UPLOAD_URL_SECONDS = 15 * 60;

/**
 * A short-lived URL the browser can PUT the file to directly, so large files never pass
 * through the app server (Vercel rejects request bodies over 4.5 MB).
 */
export async function createUploadUrl(ownerId: string, contentType: string, size: number) {
  const key = `${ownerId}/${randomUUID()}`;
  const uploadUrl = await getSignedUrl(
    s3(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType, ContentLength: size }),
    { expiresIn: UPLOAD_URL_SECONDS },
  );
  return { key, uploadUrl };
}

/** Size in bytes of an uploaded object, or null when it doesn't exist. */
export async function storedFileSize(storageKey: string) {
  try {
    const result = await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: storageKey }));
    return result.ContentLength ?? null;
  } catch {
    return null;
  }
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

export async function readFileBytes(storageKey: string): Promise<Uint8Array> {
  const result = await s3().send(
    new GetObjectCommand({ Bucket: bucket(), Key: storageKey }),
  );
  if (!result.Body) throw new Error("The file in storage is empty.");
  return result.Body.transformToByteArray();
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
