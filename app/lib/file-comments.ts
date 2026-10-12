import "server-only";
import { ObjectId } from "mongodb";
import { getDb } from "./mongodb";
import type { Role } from "./users";

type CommentDoc = {
  _id: ObjectId;
  fileId: ObjectId;
  ownerId: ObjectId;
  /** Set on replies; replies are one level deep. */
  parentId: ObjectId | null;
  authorId: ObjectId;
  authorName: string;
  authorRole: Role;
  text: string;
  createdAt: Date;
};

export type FileComment = {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: Role;
  text: string;
  createdAt: string;
  replies: FileComment[];
};

export type CommentAuthor = { id: string; name: string; role: Role };

export const MAX_COMMENT_LENGTH = 2000;

let indexesReady: Promise<unknown> | null = null;

async function comments() {
  const col = (await getDb()).collection<CommentDoc>("file_comments");
  indexesReady ??= col.createIndex({ fileId: 1, createdAt: 1 }).catch((error) => {
    indexesReady = null;
    throw error;
  });
  await indexesReady;
  return col;
}

function toObjectId(id: string | null | undefined) {
  return id && ObjectId.isValid(id) ? new ObjectId(id) : null;
}

function toFileComment(doc: CommentDoc): FileComment {
  return {
    id: doc._id.toHexString(),
    authorId: doc.authorId.toHexString(),
    authorName: doc.authorName,
    authorRole: doc.authorRole,
    text: doc.text,
    createdAt: doc.createdAt.toISOString(),
    replies: [],
  };
}

/** Comments on one file, oldest first, each with its replies. */
export async function listComments(fileId: string): Promise<FileComment[]> {
  const file = toObjectId(fileId);
  if (!file) return [];
  const docs = await (await comments()).find({ fileId: file }).sort({ createdAt: 1 }).toArray();

  const threads = new Map<string, FileComment>();
  for (const doc of docs) {
    if (!doc.parentId) threads.set(doc._id.toHexString(), toFileComment(doc));
  }
  for (const doc of docs) {
    if (doc.parentId) threads.get(doc.parentId.toHexString())?.replies.push(toFileComment(doc));
  }
  return [...threads.values()];
}

export async function addComment(
  file: { id: string; ownerId: string },
  author: CommentAuthor,
  text: string,
  parentId?: string,
): Promise<{ comment?: FileComment; error?: string }> {
  const fileId = toObjectId(file.id);
  const ownerId = toObjectId(file.ownerId);
  const authorId = toObjectId(author.id);
  const body = text.trim();
  if (!fileId || !ownerId || !authorId) return { error: "This file no longer exists." };
  if (!body) return { error: "Write a comment first." };
  if (body.length > MAX_COMMENT_LENGTH) {
    return { error: `Comments can be at most ${MAX_COMMENT_LENGTH} characters.` };
  }

  const col = await comments();
  let parent: ObjectId | null = null;
  if (parentId) {
    parent = toObjectId(parentId);
    const exists = parent && (await col.findOne({ _id: parent, fileId, parentId: null }));
    if (!exists) return { error: "The comment you replied to was deleted." };
  }

  const doc: CommentDoc = {
    _id: new ObjectId(),
    fileId,
    ownerId,
    parentId: parent,
    authorId,
    authorName: author.name,
    authorRole: author.role,
    text: body,
    createdAt: new Date(),
  };
  await col.insertOne(doc);
  return { comment: toFileComment(doc) };
}

/** Deletes a comment and its replies. Authors can delete their own; admins can delete any. */
export async function deleteComment(commentId: string, viewer: { id: string; role: Role }) {
  const id = toObjectId(commentId);
  if (!id) return false;
  const col = await comments();
  const doc = await col.findOne({ _id: id });
  if (!doc) return false;
  if (viewer.role !== "admin" && doc.authorId.toHexString() !== viewer.id) return false;
  await col.deleteMany({ $or: [{ _id: id }, { parentId: id }] });
  return true;
}

export async function getCommentFileId(commentId: string) {
  const id = toObjectId(commentId);
  if (!id) return null;
  const doc = await (await comments()).findOne({ _id: id }, { projection: { fileId: 1 } });
  return doc?.fileId.toHexString() ?? null;
}

/** Number of comments and replies on each file. */
export async function countCommentsByFile(fileIds: string[]) {
  const ids = fileIds.map(toObjectId).filter((id): id is ObjectId => id !== null);
  const counts = new Map<string, number>();
  if (ids.length === 0) return counts;
  const rows = await (await comments())
    .aggregate<{ _id: ObjectId; count: number }>([
      { $match: { fileId: { $in: ids } } },
      { $group: { _id: "$fileId", count: { $sum: 1 } } },
    ])
    .toArray();
  for (const row of rows) counts.set(row._id.toHexString(), row.count);
  return counts;
}

export async function removeCommentsForFiles(fileIds: ObjectId[]) {
  if (fileIds.length === 0) return;
  await (await comments()).deleteMany({ fileId: { $in: fileIds } });
}

export async function removeCommentsForOwner(ownerId: ObjectId) {
  await (await comments()).deleteMany({ ownerId });
}
