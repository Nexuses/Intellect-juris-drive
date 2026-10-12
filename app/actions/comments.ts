"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/app/lib/dal";
import { getFile, getFileById } from "@/app/lib/drive";
import {
  addComment,
  deleteComment,
  getCommentFileId,
  listComments,
  type FileComment,
} from "@/app/lib/file-comments";

const SESSION_EXPIRED = "Your session has expired. Please log in again.";
const FILE_GONE = "This file no longer exists.";

export type CommentViewer = { id: string; isAdmin: boolean };

/** The signed-in person and the file, if they may see its comments: their own file, or any file for an admin. */
async function access(fileId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: SESSION_EXPIRED };
  const file = user.role === "admin" ? await getFileById(fileId) : await getFile(user.id, fileId);
  if (!file) return { error: FILE_GONE };
  return { user, file: { id: fileId, ownerId: file.ownerId.toHexString() } };
}

function refresh() {
  revalidatePath("/dashboard", "layout");
  revalidatePath("/admin", "layout");
}

export async function listCommentsAction(
  fileId: string,
): Promise<{ comments?: FileComment[]; viewer?: CommentViewer; error?: string }> {
  const result = await access(fileId);
  if ("error" in result) return { error: result.error };
  return {
    comments: await listComments(fileId),
    viewer: { id: result.user.id, isAdmin: result.user.role === "admin" },
  };
}

export async function addCommentAction(
  fileId: string,
  text: string,
  parentId?: string,
): Promise<{ comment?: FileComment; error?: string }> {
  const result = await access(fileId);
  if ("error" in result) return { error: result.error };
  const { user, file } = result;
  const added = await addComment(file, { id: user.id, name: user.name, role: user.role }, text, parentId);
  if (added.comment) refresh();
  return added;
}

export async function deleteCommentAction(commentId: string): Promise<{ error?: string }> {
  const fileId = await getCommentFileId(commentId);
  if (!fileId) return { error: "This comment was already deleted." };
  const result = await access(fileId);
  if ("error" in result) return { error: result.error };
  const { user } = result;
  if (!(await deleteComment(commentId, { id: user.id, role: user.role }))) {
    return { error: "You can only delete your own comments." };
  }
  refresh();
  return {};
}
