"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/app/lib/dal";
import {
  createFolder,
  createFolderTree,
  deleteItem,
  getFile,
  renameItem,
  saveFileLink,
} from "@/app/lib/drive";
import { keyFromLink, publicFileUrl } from "@/app/lib/storage";

type Result = { error?: string };

async function currentUserId() {
  const user = await getCurrentUser();
  return user?.id ?? null;
}

function refreshDrive() {
  revalidatePath("/dashboard", "layout");
}

export async function createFolderAction(parentId: string | null, name: string): Promise<Result> {
  const userId = await currentUserId();
  if (!userId) return { error: "Your session has expired. Please log in again." };

  const result = await createFolder(userId, parentId, name);
  if ("error" in result) return { error: result.error };

  refreshDrive();
  return {};
}

export async function createFolderTreeAction(
  parentId: string | null,
  paths: string[],
): Promise<Result & { folders?: Record<string, string> }> {
  const userId = await currentUserId();
  if (!userId) return { error: "Your session has expired. Please log in again." };

  const result = await createFolderTree(userId, parentId, paths);
  if ("error" in result) return { error: result.error };

  refreshDrive();
  return { folders: result.folders };
}

export async function renameItemAction(itemId: string, name: string): Promise<Result> {
  const userId = await currentUserId();
  if (!userId) return { error: "Your session has expired. Please log in again." };

  const result = await renameItem(userId, itemId, name);
  if (result.error) return result;

  refreshDrive();
  return {};
}

export async function getFileLinkAction(
  itemId: string,
): Promise<{ url?: string; error?: string }> {
  const userId = await currentUserId();
  if (!userId) return { error: "Your session has expired. Please log in again." };

  const file = await getFile(userId, itemId);
  const storageKey = file?.s3Url ? keyFromLink(file.s3Url) : file?.storageKey;
  if (!storageKey?.includes("/")) {
    return { error: "This file was uploaded before S3. Upload it again to get a link." };
  }

  const url = publicFileUrl(storageKey);
  if (file?.s3Url !== url) await saveFileLink(userId, itemId, url);
  return { url };
}

export async function deleteItemAction(itemId: string): Promise<Result> {
  const userId = await currentUserId();
  if (!userId) return { error: "Your session has expired. Please log in again." };

  const result = await deleteItem(userId, itemId);
  if (result.error) return result;

  refreshDrive();
  return {};
}
