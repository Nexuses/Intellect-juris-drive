import "server-only";
import type { ManagedFileRow } from "@/app/ui/file-manager";
import { getIndexStatus } from "./doc-index";
import { listManagedFiles } from "./drive";

/** Files for one user, or for everyone when `ownerId` is null, with Jev reading status and owner names. */
export async function getFileManagementRows(
  ownerId: string | null,
  ownerNames?: Map<string, string>,
): Promise<ManagedFileRow[]> {
  const files = await listManagedFiles(ownerId);
  const statuses = await getIndexStatus(files.map((file) => file.id));
  return files.map((file) => ({
    ...file,
    ownerName: ownerNames?.get(file.ownerId),
    reading: statuses.get(file.id)?.status ?? "waiting",
  }));
}
