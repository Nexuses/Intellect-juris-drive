import "server-only";
import { ObjectId } from "mongodb";
import { extractDocument, type ExtractedSection } from "./doc-extract";
import { getDb } from "./mongodb";
import { keyFromLink, readFileBytes } from "./storage";

export type IndexStatus = "ready" | "failed" | "unsupported";

type ChunkDoc = {
  _id: ObjectId;
  ownerId: ObjectId;
  fileId: ObjectId;
  order: number;
  page: number | null;
  section: string | null;
  text: string;
};

type IndexDoc = {
  _id: ObjectId;
  ownerId: ObjectId;
  status: IndexStatus;
  method: string | null;
  pages: number | null;
  chunks: number;
  reason: string | null;
  indexedAt: Date;
};

type FileDoc = {
  _id: ObjectId;
  ownerId: ObjectId;
  type: "file" | "folder";
  name: string;
  mimeType?: string;
  s3Url?: string;
  storageKey?: string;
};

export type Passage = {
  fileId: string;
  ownerId: string;
  page: number | null;
  section: string | null;
  order: number;
  text: string;
  score: number;
};

const CHUNK_CHARS = 1400;

let indexesReady: Promise<unknown> | null = null;

async function collections() {
  const db = await getDb();
  const chunks = db.collection<ChunkDoc>("doc_chunks");
  const index = db.collection<IndexDoc>("doc_index");
  indexesReady ??= Promise.all([
    chunks.createIndex({ text: "text" }, { name: "doc_text", default_language: "english" }),
    chunks.createIndex({ fileId: 1, order: 1 }),
    chunks.createIndex({ ownerId: 1 }),
    index.createIndex({ ownerId: 1 }),
  ]).catch((error) => {
    indexesReady = null;
    throw error;
  });
  await indexesReady;
  return { chunks, index, items: db.collection<FileDoc>("drive_items") };
}

function toObjectId(id: string | null | undefined) {
  return id && ObjectId.isValid(id) ? new ObjectId(id) : null;
}

/** Splits long sections into passages of about CHUNK_CHARS, breaking at paragraphs or sentences. */
function toChunks(sections: ExtractedSection[]) {
  const chunks: { page: number | null; section: string | null; text: string }[] = [];
  for (const section of sections) {
    const pieces = section.text.split(/\n{2,}|(?<=[.!?])\s+(?=[A-Z0-9])/);
    let buffer = "";
    for (const piece of pieces) {
      if (buffer && buffer.length + piece.length + 1 > CHUNK_CHARS) {
        chunks.push({ page: section.page, section: section.section, text: buffer.trim() });
        buffer = "";
      }
      if (piece.length > CHUNK_CHARS) {
        for (let start = 0; start < piece.length; start += CHUNK_CHARS) {
          chunks.push({ page: section.page, section: section.section, text: piece.slice(start, start + CHUNK_CHARS) });
        }
        continue;
      }
      buffer += `${piece}\n`;
    }
    if (buffer.trim()) chunks.push({ page: section.page, section: section.section, text: buffer.trim() });
  }
  return chunks;
}

function storageKeyFor(file: FileDoc) {
  if (file.s3Url) return keyFromLink(file.s3Url);
  return file.storageKey?.includes("/") ? file.storageKey : null;
}

/** Reads one file from S3 and saves its text passages. Safe to call again; it replaces the old passages. */
export async function indexFile(fileId: string) {
  const id = toObjectId(fileId);
  if (!id) return;
  const { chunks, index, items } = await collections();
  const file = await items.findOne({ _id: id, type: "file" });
  if (!file) return;

  const save = async (doc: Omit<IndexDoc, "_id" | "ownerId" | "indexedAt">) => {
    await index.updateOne(
      { _id: id },
      { $set: { ...doc, ownerId: file.ownerId, indexedAt: new Date() } },
      { upsert: true },
    );
  };

  const key = storageKeyFor(file);
  if (!key) {
    await save({ status: "unsupported", method: null, pages: null, chunks: 0, reason: "This file is not in S3." });
    return;
  }

  try {
    const bytes = await readFileBytes(key);
    const extraction = await extractDocument(bytes, file.name, file.mimeType ?? "");
    await chunks.deleteMany({ fileId: id });

    if (extraction.status !== "ready") {
      await save({ status: "unsupported", method: null, pages: null, chunks: 0, reason: extraction.reason });
      return;
    }

    const docs: ChunkDoc[] = toChunks(extraction.sections).map((chunk, order) => ({
      _id: new ObjectId(),
      ownerId: file.ownerId,
      fileId: id,
      order,
      ...chunk,
    }));
    if (docs.length > 0) await chunks.insertMany(docs);
    await save({
      status: "ready",
      method: extraction.method,
      pages: extraction.pages,
      chunks: docs.length,
      reason: null,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message.slice(0, 300) : "Reading failed.";
    await save({ status: "failed", method: null, pages: null, chunks: 0, reason });
  }
}

let backfill: Promise<number> | null = null;

/** Reads every file that has no saved text yet, and optionally retries failed ones. Only one run happens at a time. */
export function indexUnreadFiles({ retryFailed = false } = {}) {
  backfill ??= (async () => {
    const { index, items } = await collections();
    const files = await items.find({ type: "file" }, { projection: { _id: 1 } }).toArray();
    const skip = retryFailed ? { status: { $ne: "failed" as const } } : {};
    const done = new Set(
      (await index.find(skip, { projection: { _id: 1 } }).toArray()).map((doc) => doc._id.toHexString()),
    );
    let count = 0;
    for (const file of files) {
      if (done.has(file._id.toHexString())) continue;
      await indexFile(file._id.toHexString());
      count += 1;
    }
    return count;
  })().finally(() => {
    backfill = null;
  });
  return backfill;
}

export function isBackfillRunning() {
  return backfill !== null;
}

export async function removeIndexForFiles(fileIds: ObjectId[]) {
  if (fileIds.length === 0) return;
  const { chunks, index } = await collections();
  await chunks.deleteMany({ fileId: { $in: fileIds } });
  await index.deleteMany({ _id: { $in: fileIds } });
}

export async function removeIndexForOwner(ownerId: ObjectId) {
  const { chunks, index } = await collections();
  await chunks.deleteMany({ ownerId });
  await index.deleteMany({ ownerId });
}

export async function getIndexStatus(fileIds: string[]) {
  const ids = fileIds.map(toObjectId).filter((id): id is ObjectId => id !== null);
  const { index } = await collections();
  const docs = await index.find({ _id: { $in: ids } }).toArray();
  return new Map(docs.map((doc) => [doc._id.toHexString(), doc]));
}

/** Counts files by reading status. Files with no record yet count as waiting. */
export async function getIndexSummary() {
  const { index, items } = await collections();
  const [files, docs] = await Promise.all([
    items.countDocuments({ type: "file" }),
    index.find({}, { projection: { status: 1 } }).toArray(),
  ]);
  const counts = { ready: 0, failed: 0, unsupported: 0 };
  for (const doc of docs) counts[doc.status] += 1;
  return { files, ...counts, waiting: Math.max(0, files - docs.length) };
}

function toPassage(doc: ChunkDoc & { score?: number }): Passage {
  return {
    fileId: doc.fileId.toHexString(),
    ownerId: doc.ownerId.toHexString(),
    page: doc.page,
    section: doc.section,
    order: doc.order,
    text: doc.text,
    score: doc.score ?? 0,
  };
}

/** Keyword search over saved passages. `ownerId` null searches every account. */
export async function searchPassages(ownerId: string | null, query: string, limit = 40) {
  const owner = toObjectId(ownerId);
  if (ownerId && !owner) return [];
  const terms = query.replace(/["\\]/g, " ").trim();
  if (!terms) return [];
  const { chunks } = await collections();
  const docs = await chunks
    .find(
      { $text: { $search: terms }, ...(owner ? { ownerId: owner } : {}) },
      { projection: { score: { $meta: "textScore" } } },
    )
    .sort({ score: { $meta: "textScore" } })
    .limit(limit)
    .toArray();
  return docs.map((doc) => toPassage(doc as ChunkDoc & { score?: number }));
}

/** Passages of one file in reading order, up to `maxChars` characters. */
export async function readFilePassages(fileId: string, maxChars = 400_000) {
  const id = toObjectId(fileId);
  if (!id) return [];
  const { chunks } = await collections();
  const docs = await chunks.find({ fileId: id }).sort({ order: 1 }).toArray();
  const passages: Passage[] = [];
  let used = 0;
  for (const doc of docs) {
    if (used + doc.text.length > maxChars) break;
    passages.push(toPassage(doc));
    used += doc.text.length;
  }
  return passages;
}
