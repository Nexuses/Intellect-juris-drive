import "server-only";
import { askJev, type JevAnswer } from "./ai-gateway";
import { listFolderOptions, type FolderOption } from "./drive";
import { fileKind, type FileKind } from "./file-kind";

export type OrganizeTarget = { kind: "existing"; folderId: string; path: string } | { kind: "new"; name: string };

export type FilePlan = {
  key: string;
  name: string;
  target: OrganizeTarget;
  /** Jev's confidence from 0 to 1. Zero when the fallback rule chose. */
  confidence: number;
  byJev: boolean;
};

type Option = { key: string; label: string; target: OrganizeTarget };

const BATCH_SIZE = 20;
const MAX_EXISTING_OPTIONS = 80;
const MAX_NEW_OPTIONS = 30;

const KIND_FOLDERS: Record<FileKind, string> = {
  image: "Images",
  pdf: "PDFs",
  video: "Videos",
  audio: "Audio",
  sheet: "Spreadsheets",
  csv: "Spreadsheets",
  doc: "Documents",
  slides: "Presentations",
  archive: "Archives",
  text: "Text files",
  code: "Code",
  file: "Other files",
};

const NAME_STOP_WORDS = new Set([
  "the", "and", "for", "final", "copy", "scan", "scanned", "img", "image", "photo", "doc", "docs",
  "document", "file", "new", "draft", "signed", "version", "untitled", "screenshot", "pdf", "jpg",
  "jpeg", "png", "scaled", "edited", "updated", "rev", "revised", "with", "from",
]);

function titleCase(word: string) {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/** A likely topic from a file name, such as "Lease" from "Lease Agreement Mumbai.docx". */
function nameTopic(name: string) {
  const base = name.replace(/\.[a-z0-9]{1,8}$/i, "");
  const word = base
    .split(/[^A-Za-z]+/)
    .find((part) => part.length >= 3 && !NAME_STOP_WORDS.has(part.toLowerCase()));
  return word ? titleCase(word) : null;
}

function lastSegment(path: string) {
  return path.split(" / ").at(-1)?.toLowerCase() ?? "";
}

function buildOptions(folders: FolderOption[], files: { name: string; kind: FileKind }[]) {
  const existing: Option[] = folders.slice(0, MAX_EXISTING_OPTIONS).map((folder, index) => ({
    key: `e${index}`,
    label: `Existing folder: ${folder.path}`,
    target: { kind: "existing", folderId: folder.id, path: folder.path },
  }));

  const topLevel = new Set(folders.filter((folder) => !folder.path.includes(" / ")).map((folder) => folder.path.toLowerCase()));
  const names = new Map<string, string>();
  for (const file of files) {
    for (const candidate of [nameTopic(file.name), KIND_FOLDERS[file.kind]]) {
      if (!candidate) continue;
      const lower = candidate.toLowerCase();
      if (!topLevel.has(lower) && !names.has(lower)) names.set(lower, candidate);
    }
  }
  const fresh: Option[] = [...names.values()].slice(0, MAX_NEW_OPTIONS).map((name, index) => ({
    key: `n${index}`,
    label: `New folder: ${name}`,
    target: { kind: "new", name },
  }));

  return [...existing, ...fresh];
}

/** Picks a folder by name and type when Jev cannot be reached. */
function fallbackTarget(file: { name: string; kind: FileKind }, folders: FolderOption[]): OrganizeTarget {
  const wanted = [nameTopic(file.name), KIND_FOLDERS[file.kind]].filter((value): value is string => Boolean(value));
  for (const name of wanted) {
    const match = folders.find((folder) => lastSegment(folder.path) === name.toLowerCase());
    if (match) return { kind: "existing", folderId: match.id, path: match.path };
  }
  return { kind: "new", name: KIND_FOLDERS[file.kind] };
}

function confidenceOf(answer: JevAnswer | undefined) {
  if (!answer?.choice) return 0;
  return answer.confidence ?? answer.probabilities?.[answer.choice] ?? 0;
}

/**
 * Asks Jev which folder each file belongs in, choosing between the user's
 * existing folders and suggested new top-level folders based on file names and types.
 */
export async function planFolders(
  ownerId: string,
  files: { key: string; name: string; mimeType: string | null }[],
): Promise<{ plans: FilePlan[]; folders: FolderOption[] }> {
  const folders = await listFolderOptions(ownerId);
  const typed = files.map((file) => ({ ...file, kind: fileKind(file.mimeType, file.name) }));
  if (typed.length === 0) return { plans: [], folders };

  const options = buildOptions(folders, typed);
  const byKey = new Map(options.map((option) => [option.key, option]));
  const criteria = Object.fromEntries(options.map((option) => [option.key, option.label]));

  const batches: (typeof typed)[] = [];
  for (let start = 0; start < typed.length; start += BATCH_SIZE) batches.push(typed.slice(start, start + BATCH_SIZE));

  const answered = await Promise.all(
    batches.map((batch) =>
      askJev(
        {
          task: "Organize uploaded files into a law office document drive.",
          existingFolders: folders.map((folder) => folder.path),
          files: batch.map((file) => file.name),
        },
        Object.fromEntries(
          batch.map((file, index) => [
            `file${index}`,
            {
              type: "choice" as const,
              instructions: `Which folder should the file "${file.name}" be saved in? Prefer an existing folder when it matches the file's client, matter, topic, or document type. Choose a new folder only when no existing folder fits.`,
              criteria,
            },
          ]),
        ),
      ),
    ),
  );

  const plans = batches.flatMap((batch, batchIndex) =>
    batch.map((file, index): FilePlan => {
      const answer = answered[batchIndex]?.[`file${index}`];
      const option = answer?.choice ? byKey.get(answer.choice) : undefined;
      if (option) {
        return { key: file.key, name: file.name, target: option.target, confidence: confidenceOf(answer), byJev: true };
      }
      return { key: file.key, name: file.name, target: fallbackTarget(file, folders), confidence: 0, byJev: false };
    }),
  );

  return { plans, folders };
}
