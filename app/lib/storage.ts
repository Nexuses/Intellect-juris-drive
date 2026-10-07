import "server-only";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import { GridFSBucket, ObjectId } from "mongodb";
import { getDb } from "./mongodb";

// File bytes live in MongoDB GridFS for now. Everything outside this module only
// deals with an opaque storage key, so this can be swapped for S3 later.

async function bucket() {
  return new GridFSBucket(await getDb(), { bucketName: "drive_files" });
}

export async function saveFile(file: File, ownerId: string): Promise<string> {
  const upload = (await bucket()).openUploadStream(file.name, {
    metadata: { ownerId, mimeType: file.type || null },
  });
  await pipeline(Readable.fromWeb(file.stream() as NodeWebReadableStream), upload);
  return upload.id.toString();
}

export async function readFile(storageKey: string): Promise<ReadableStream> {
  const stream = (await bucket()).openDownloadStream(new ObjectId(storageKey));
  return Readable.toWeb(stream) as ReadableStream;
}

export async function deleteFiles(storageKeys: string[]) {
  const files = await bucket();
  await Promise.all(
    storageKeys.map((key) => files.delete(new ObjectId(key)).catch(() => undefined)),
  );
}
