import "server-only";
import { ObjectId } from "mongodb";
import { fileKind, type FileKind } from "./file-kind";
import { getDb } from "./mongodb";
import { deleteFiles } from "./storage";

export type ItemType = "folder" | "file";

type ItemDoc = {
  _id: ObjectId;
  ownerId: ObjectId;
  parentId: ObjectId | null;
  type: ItemType;
  name: string;
  mimeType?: string;
  size?: number;
  storageKey?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type DriveItem = {
  id: string;
  name: string;
  type: ItemType;
  mimeType: string | null;
  size: number | null;
  updatedAt: string;
};

export type Crumb = { id: string; name: string };

const MAX_NAME_LENGTH = 255;
const MAX_FOLDER_DEPTH = 100;

let indexesReady: Promise<unknown> | null = null;

async function items() {
  const col = (await getDb()).collection<ItemDoc>("drive_items");
  indexesReady ??= col.createIndex({ ownerId: 1, parentId: 1 }).catch((error) => {
    indexesReady = null;
    throw error;
  });
  await indexesReady;
  return col;
}

function toObjectId(id: string | null | undefined) {
  return id && ObjectId.isValid(id) ? new ObjectId(id) : null;
}

function toDriveItem(doc: ItemDoc): DriveItem {
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    type: doc.type,
    mimeType: doc.mimeType ?? null,
    size: doc.size ?? null,
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export function cleanName(name: string) {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > MAX_NAME_LENGTH) return null;
  return trimmed;
}

async function findFolderDoc(owner: ObjectId, folderId: string) {
  const id = toObjectId(folderId);
  if (!id) return null;
  return (await items()).findOne({ _id: id, ownerId: owner, type: "folder" });
}

/** Resolves a parent id to an owned folder; `null` means the drive root. */
async function resolveParent(owner: ObjectId, parentId: string | null) {
  if (parentId === null) return { ok: true as const, id: null };
  const folder = await findFolderDoc(owner, parentId);
  return folder ? { ok: true as const, id: folder._id } : { ok: false as const };
}

export async function getFolder(ownerId: string, folderId: string) {
  const owner = toObjectId(ownerId);
  if (!owner) return null;
  const doc = await findFolderDoc(owner, folderId);
  return doc ? toDriveItem(doc) : null;
}

export async function getBreadcrumbs(ownerId: string, folderId: string): Promise<Crumb[]> {
  const owner = toObjectId(ownerId);
  const col = await items();
  const crumbs: Crumb[] = [];
  let current = toObjectId(folderId);

  while (owner && current && crumbs.length < MAX_FOLDER_DEPTH) {
    const doc = await col.findOne({ _id: current, ownerId: owner, type: "folder" });
    if (!doc) break;
    crumbs.unshift({ id: doc._id.toHexString(), name: doc.name });
    current = doc.parentId;
  }
  return crumbs;
}

export async function listChildren(ownerId: string, parentId: string | null) {
  const owner = toObjectId(ownerId);
  if (!owner) return [];
  const parent = parentId === null ? null : toObjectId(parentId);
  if (parentId !== null && !parent) return [];

  const docs = await (await items())
    .find({ ownerId: owner, parentId: parent })
    .sort({ name: 1 })
    .toArray();
  return docs.map(toDriveItem);
}

export async function searchItems(ownerId: string, query: string) {
  const owner = toObjectId(ownerId);
  const q = query.trim();
  if (!owner || !q) return [];

  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const docs = await (await items())
    .find({ ownerId: owner, name: { $regex: escaped, $options: "i" } })
    .sort({ name: 1 })
    .limit(200)
    .toArray();
  return docs.map(toDriveItem);
}

export async function createFolder(ownerId: string, parentId: string | null, name: string) {
  const owner = toObjectId(ownerId);
  const folderName = cleanName(name);
  if (!owner || !folderName) return { error: "Enter a valid folder name." };

  const parent = await resolveParent(owner, parentId);
  if (!parent.ok) return { error: "The destination folder no longer exists." };

  const now = new Date();
  const doc: ItemDoc = {
    _id: new ObjectId(),
    ownerId: owner,
    parentId: parent.id,
    type: "folder",
    name: folderName,
    createdAt: now,
    updatedAt: now,
  };
  await (await items()).insertOne(doc);
  return { item: toDriveItem(doc) };
}

/**
 * Creates nested folders for a folder upload. `paths` are relative directory
 * paths such as "Photos" and "Photos/2024". Returns a map of path -> folder id.
 */
export async function createFolderTree(
  ownerId: string,
  parentId: string | null,
  paths: string[],
) {
  const owner = toObjectId(ownerId);
  if (!owner) return { error: "Not signed in." };

  const parent = await resolveParent(owner, parentId);
  if (!parent.ok) return { error: "The destination folder no longer exists." };

  const unique = [...new Set(paths)]
    .map((path) => path.split("/").filter(Boolean))
    .filter((segments) => segments.length > 0 && segments.length <= MAX_FOLDER_DEPTH)
    .sort((a, b) => a.length - b.length);

  const ids = new Map<string, ObjectId>();
  const now = new Date();
  const docs: ItemDoc[] = [];

  for (const segments of unique) {
    const path = segments.join("/");
    const name = cleanName(segments[segments.length - 1]);
    if (!name || ids.has(path)) continue;

    const parentPath = segments.slice(0, -1).join("/");
    const doc: ItemDoc = {
      _id: new ObjectId(),
      ownerId: owner,
      parentId: parentPath ? (ids.get(parentPath) ?? parent.id) : parent.id,
      type: "folder",
      name,
      createdAt: now,
      updatedAt: now,
    };
    ids.set(path, doc._id);
    docs.push(doc);
  }

  if (docs.length > 0) await (await items()).insertMany(docs);

  return {
    folders: Object.fromEntries([...ids].map(([path, id]) => [path, id.toHexString()])),
  };
}

export async function addFile(
  ownerId: string,
  parentId: string | null,
  file: { name: string; mimeType: string; size: number; storageKey: string },
) {
  const owner = toObjectId(ownerId);
  const name = cleanName(file.name);
  if (!owner || !name) return { error: "Invalid file name." };

  const parent = await resolveParent(owner, parentId);
  if (!parent.ok) return { error: "The destination folder no longer exists." };

  const now = new Date();
  const doc: ItemDoc = {
    _id: new ObjectId(),
    ownerId: owner,
    parentId: parent.id,
    type: "file",
    name,
    mimeType: file.mimeType || "application/octet-stream",
    size: file.size,
    storageKey: file.storageKey,
    createdAt: now,
    updatedAt: now,
  };
  await (await items()).insertOne(doc);
  return { item: toDriveItem(doc) };
}

export async function getFile(ownerId: string, fileId: string) {
  const owner = toObjectId(ownerId);
  const id = toObjectId(fileId);
  if (!owner || !id) return null;
  return (await items()).findOne({ _id: id, ownerId: owner, type: "file" });
}

export async function renameItem(ownerId: string, itemId: string, name: string) {
  const owner = toObjectId(ownerId);
  const id = toObjectId(itemId);
  const newName = cleanName(name);
  if (!owner || !id || !newName) return { error: "Enter a valid name." };

  const result = await (await items()).updateOne(
    { _id: id, ownerId: owner },
    { $set: { name: newName, updatedAt: new Date() } },
  );
  return result.matchedCount === 1 ? {} : { error: "This item no longer exists." };
}

/** Deletes an item and, for folders, everything inside it. */
export async function deleteItem(ownerId: string, itemId: string) {
  const owner = toObjectId(ownerId);
  const id = toObjectId(itemId);
  if (!owner || !id) return { error: "This item no longer exists." };

  const col = await items();
  const root = await col.findOne({ _id: id, ownerId: owner });
  if (!root) return { error: "This item no longer exists." };

  const ids: ObjectId[] = [root._id];
  const storageKeys: string[] = root.storageKey ? [root.storageKey] : [];
  let frontier = root.type === "folder" ? [root._id] : [];

  while (frontier.length > 0) {
    const children = await col
      .find(
        { ownerId: owner, parentId: { $in: frontier } },
        { projection: { _id: 1, type: 1, storageKey: 1 } },
      )
      .toArray();
    frontier = [];
    for (const child of children) {
      ids.push(child._id);
      if (child.storageKey) storageKeys.push(child.storageKey);
      if (child.type === "folder") frontier.push(child._id);
    }
  }

  await col.deleteMany({ _id: { $in: ids }, ownerId: owner });
  await deleteFiles(storageKeys);
  return {};
}

export type KindCounts = Record<FileKind, number>;

export type OwnerUsage = {
  files: number;
  folders: number;
  bytes: number;
  kinds: KindCounts;
};

const FILE_KINDS: FileKind[] = [
  "image",
  "pdf",
  "video",
  "audio",
  "sheet",
  "csv",
  "doc",
  "slides",
  "archive",
  "text",
  "code",
  "file",
];

function emptyKinds(): KindCounts {
  return Object.fromEntries(FILE_KINDS.map((kind) => [kind, 0])) as KindCounts;
}

/** Counts folders and files, by type, for every user. */
export async function getWorkspaceUsage() {
  const docs = await (await items())
    .find({}, { projection: { ownerId: 1, type: 1, name: 1, mimeType: 1, size: 1 } })
    .toArray();

  const totals: OwnerUsage = { files: 0, folders: 0, bytes: 0, kinds: emptyKinds() };
  const byOwner = new Map<string, OwnerUsage>();

  for (const doc of docs) {
    const ownerId = doc.ownerId.toHexString();
    let usage = byOwner.get(ownerId);
    if (!usage) {
      usage = { files: 0, folders: 0, bytes: 0, kinds: emptyKinds() };
      byOwner.set(ownerId, usage);
    }

    if (doc.type === "folder") {
      usage.folders += 1;
      totals.folders += 1;
      continue;
    }

    const kind = fileKind(doc.mimeType ?? null, doc.name);
    const size = doc.size ?? 0;
    usage.files += 1;
    usage.kinds[kind] += 1;
    usage.bytes += size;
    totals.files += 1;
    totals.kinds[kind] += 1;
    totals.bytes += size;
  }

  return { totals, byOwner };
}

export async function deleteAllForOwner(ownerId: string) {
  const owner = toObjectId(ownerId);
  if (!owner) return;
  const col = await items();
  const files = await col
    .find({ ownerId: owner, type: "file" }, { projection: { storageKey: 1 } })
    .toArray();
  await col.deleteMany({ ownerId: owner });
  await deleteFiles(files.flatMap((file) => (file.storageKey ? [file.storageKey] : [])));
}
