"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/app/lib/dal";
import { ensureTopLevelFolders, listLooseFiles, moveFile, type FolderOption } from "@/app/lib/drive";
import { planFolders, type FilePlan, type OrganizeTarget } from "@/app/lib/file-organizer";

const MAX_FILES = 200;
const EXPIRED = "Your session has expired. Please log in again.";

type PlanResult = { plans?: FilePlan[]; folders?: FolderOption[]; error?: string };

/** Jev's folder choice for each file about to be uploaded. Keys are the file positions. */
export async function planUploadAction(files: { name: string; type: string }[]): Promise<PlanResult> {
  const user = await getCurrentUser();
  if (!user) return { error: EXPIRED };
  if (files.length > MAX_FILES) return { error: `Organize at most ${MAX_FILES} files at a time.` };

  return planFolders(
    user.id,
    files.map((file, index) => ({ key: String(index), name: String(file.name).slice(0, 255), mimeType: file.type || null })),
  );
}

/** Jev's folder choice for files sitting at the top of the drive. Keys are file ids. */
export async function planLooseFilesAction(): Promise<PlanResult> {
  const user = await getCurrentUser();
  if (!user) return { error: EXPIRED };

  const loose = (await listLooseFiles(user.id)).slice(0, MAX_FILES);
  return planFolders(
    user.id,
    loose.map((file) => ({ key: file.id, name: file.name, mimeType: file.mimeType })),
  );
}

/** Creates (or reuses) top-level folders by name. Returns name -> folder id. */
export async function prepareFoldersAction(
  names: string[],
): Promise<{ folders?: Record<string, string>; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: EXPIRED };

  const ids = await ensureTopLevelFolders(user.id, names.slice(0, MAX_FILES));
  revalidatePath("/dashboard", "layout");
  return { folders: Object.fromEntries(ids) };
}

/** Moves files into the folders chosen in the review screen. */
export async function applyOrganizeAction(
  moves: { fileId: string; target: OrganizeTarget }[],
): Promise<{ moved?: number; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: EXPIRED };
  if (moves.length > MAX_FILES) return { error: `Organize at most ${MAX_FILES} files at a time.` };

  const newNames = moves.flatMap((move) => (move.target.kind === "new" ? [move.target.name] : []));
  const created = await ensureTopLevelFolders(user.id, newNames);

  let moved = 0;
  let failed = 0;
  for (const move of moves) {
    const folderId = move.target.kind === "existing" ? move.target.folderId : created.get(move.target.name);
    const result = folderId ? await moveFile(user.id, move.fileId, folderId) : { error: "No folder." };
    if (result.error) failed += 1;
    else moved += 1;
  }

  revalidatePath("/dashboard", "layout");
  revalidatePath("/admin", "layout");
  if (failed > 0) return { moved, error: `${failed} ${failed === 1 ? "file" : "files"} could not be moved.` };
  return { moved };
}
