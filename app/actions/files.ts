"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/app/lib/dal";
import { deleteItem, getFile, getFileById, renameItem } from "@/app/lib/drive";

type Result = { error?: string };

const MAX_BULK_DELETE = 500;

/** The owner of a file the signed-in person may manage: their own, or anyone's for an admin. */
async function manageableOwner(fileId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Your session has expired. Please log in again." };
  const file = user.role === "admin" ? await getFileById(fileId) : await getFile(user.id, fileId);
  if (!file) return { error: "This file no longer exists." };
  return { ownerId: file.ownerId.toHexString() };
}

function refresh() {
  revalidatePath("/dashboard", "layout");
  revalidatePath("/admin", "layout");
}

export async function renameManagedFileAction(fileId: string, name: string): Promise<Result> {
  const owner = await manageableOwner(fileId);
  if ("error" in owner) return owner;

  const result = await renameItem(owner.ownerId, fileId, name);
  if (result.error) return result;
  refresh();
  return {};
}

export async function deleteManagedFilesAction(fileIds: string[]): Promise<Result & { deleted?: number }> {
  if (fileIds.length === 0) return { deleted: 0 };
  if (fileIds.length > MAX_BULK_DELETE) return { error: `Delete at most ${MAX_BULK_DELETE} files at a time.` };

  let deleted = 0;
  let failed = 0;
  for (const fileId of new Set(fileIds)) {
    const owner = await manageableOwner(fileId);
    if ("error" in owner) {
      failed += 1;
      continue;
    }
    const result = await deleteItem(owner.ownerId, fileId);
    if (result.error) failed += 1;
    else deleted += 1;
  }

  refresh();
  if (failed > 0) {
    const label = failed === 1 ? "1 file" : `${failed} files`;
    return { deleted, error: `${label} could not be deleted. They may already be gone.` };
  }
  return { deleted };
}
