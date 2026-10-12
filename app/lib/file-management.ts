import "server-only";
import type { ManagedFileRow } from "@/app/ui/file-manager";
import { getIndexStatus } from "./doc-index";
import { listManagedFiles } from "./drive";
import { countCommentsByFile } from "./file-comments";

/** Files for one user, or for everyone when `ownerId` is null, with reading status, comment counts and owner names. */
export async function getFileManagementRows(
  ownerId: string | null,
  ownerNames?: Map<string, string>,
): Promise<ManagedFileRow[]> {
  const files = await listManagedFiles(ownerId);
  const ids = files.map((file) => file.id);
  const [statuses, commentCounts] = await Promise.all([getIndexStatus(ids), countCommentsByFile(ids)]);
  return files.map((file) => ({
    ...file,
    ownerName: ownerNames?.get(file.ownerId),
    reading: statuses.get(file.id)?.status ?? "waiting",
    comments: commentCounts.get(file.id) ?? 0,
  }));
}
