import "server-only";
import { askJev } from "./ai-gateway";
import { answerDocuments, docKeywordIntent, type DocIntent } from "./doc-ai";
import { getDriveSnapshot, type StoredFileLink, type StoredFolder } from "./drive";
import type { FileKind } from "./file-kind";

type Intent =
  | "find"
  | "folder"
  | "summary"
  | "explain_link"
  | "guide"
  | "delete_check"
  | "duplicates"
  | "list_links"
  | "doc_search"
  | "compare_docs"
  | "summarize_doc"
  | "ask_docs"
  | "general";

const DOC_INTENTS: Partial<Record<Intent, DocIntent>> = {
  doc_search: "search",
  compare_docs: "compare",
  summarize_doc: "summarize",
  ask_docs: "ask",
};

const FROM_DOC_INTENT: Record<DocIntent, Intent> = {
  search: "doc_search",
  compare: "compare_docs",
  summarize: "summarize_doc",
  ask: "ask_docs",
};

type ChatTurn = { role: "user" | "assistant"; content: string };

const STOP_WORDS = new Set([
  "where", "is", "the", "my", "file", "files", "uploaded", "upload", "find", "show", "me",
  "an", "in", "folder", "folders", "please", "link", "links", "s3", "what", "inside", "how",
  "do", "to", "create", "delete", "remove", "this", "that", "and", "of", "for", "can", "you",
  "tell", "about", "many", "have", "does", "did", "was", "are", "with", "from", "your",
  "drive", "which", "share", "list", "give", "send", "check", "before", "would", "want",
  "name", "names", "same", "duplicate", "duplicates", "summary", "summarize", "stats",
  "overview", "contents", "contain", "open", "copy", "permanent", "expire", "expires",
  "anyone", "there", "into", "onto", "just", "only", "all", "get", "getting",
]);

const KIND_WORDS: Record<string, FileKind | "documents" | "sheets"> = {
  image: "image",
  images: "image",
  photo: "image",
  photos: "image",
  picture: "image",
  pictures: "image",
  pdf: "pdf",
  pdfs: "pdf",
  document: "documents",
  documents: "documents",
  doc: "documents",
  docs: "documents",
  spreadsheet: "sheets",
  spreadsheets: "sheets",
  excel: "sheets",
  sheet: "sheets",
  sheets: "sheets",
  video: "video",
  videos: "video",
};

function words(text: string) {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

function linkFor(file: StoredFileLink) {
  return file.s3Url ?? "No S3 link is stored for this file yet.";
}

function formatFile(file: StoredFileLink, index?: number) {
  const prefix = index === undefined ? "" : `${index}. `;
  return `${prefix}${file.name}\nFolder: ${file.folder}\n${linkFor(file)}`;
}

function filesInFolder(files: StoredFileLink[], path: string) {
  if (path === "Drive") return files.filter((file) => file.folder === "Drive");
  return files.filter((file) => file.folder === path || file.folder.startsWith(`${path} / `));
}

function bestFolder(text: string, folders: StoredFolder[]) {
  const haystack = text.toLowerCase();
  return folders
    .filter((folder) => haystack.includes(folder.name.toLowerCase()))
    .sort((a, b) => b.name.length - a.name.length)[0] ?? null;
}

function matchesKind(file: StoredFileLink, kind: FileKind | "documents" | "sheets") {
  if (kind === "documents") return file.kind === "doc" || file.kind === "slides" || file.kind === "text";
  if (kind === "sheets") return file.kind === "sheet" || file.kind === "csv";
  return file.kind === kind;
}

function matchingFiles(text: string, files: StoredFileLink[]) {
  const tokens = words(text);
  const kindWord = tokens.find((token) => token in KIND_WORDS);
  const pool = kindWord ? files.filter((file) => matchesKind(file, KIND_WORDS[kindWord])) : files;
  const nameWords = tokens.filter((token) => !(token in KIND_WORDS));
  if (nameWords.length === 0) return kindWord ? pool : [];

  return pool
    .map((file) => ({
      file,
      score: nameWords.reduce(
        (total, token) => total + (file.name.toLowerCase().includes(token) ? token.length : 0),
        0,
      ),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.file);
}

function keywordIntent(text: string, folders: StoredFolder[]): Intent | null {
  const lower = text.toLowerCase();
  if (/https?:\/\/\S+/.test(lower) && /amazonaws|s3\./.test(lower)) return "explain_link";
  if (/\b(duplicat|same name|same file name|twice)\b/.test(lower)) return "duplicates";
  if (
    /\b(how many|stats|statistics)\b/.test(lower) ||
    (/\b(summar|overview)/.test(lower) && /\b(my drive|the drive|drive|my files|all my files|everything)\b/.test(lower))
  ) {
    return "summary";
  }
  const docIntent = docKeywordIntent(text);
  if (docIntent) return FROM_DOC_INTENT[docIntent];
  if (
    /\bhow (do|can|to|should|would)\b/.test(lower) &&
    /\b(upload|folder|rename|delete|remove|search|link|share|create|download|open|move)\b/.test(lower)
  ) {
    return "guide";
  }
  if (/\b(delete|remove)\b/.test(lower)) return "delete_check";
  if (/\b(s3|links?)\b/.test(lower) && /\b(show|share|list|send|give|my|all)\b/.test(lower)) {
    return "list_links";
  }
  if (bestFolder(text, folders) && /\b(inside|contents|contain|in)\b/.test(lower)) return "folder";
  if (/\b(where|find|look for)\b/.test(lower)) return "find";
  return null;
}

const INTENTS: Intent[] = [
  "find", "folder", "summary", "explain_link", "guide", "delete_check", "duplicates", "list_links",
  "doc_search", "compare_docs", "summarize_doc", "ask_docs", "general",
];

async function jevIntent(message: string): Promise<Intent | null> {
  const answers = await askJev(message, {
    intent: {
      type: "choice",
      instructions: "What does this person want from their own document drive?",
      criteria: {
        find: "Find a file by its name and show its folder and S3 link",
        folder: "List what is inside one folder",
        summary: "Count their files by type and name their folders",
        explain_link: "Explain whether a pasted S3 link expires and which file it is",
        guide: "Steps for creating a folder, uploading, renaming, searching, or deleting",
        delete_check: "Say what would be deleted, without deleting it",
        duplicates: "Find files that share the same name",
        list_links: "List their files and permanent S3 links",
        doc_search: "Find documents by what is written inside them, not by file name",
        compare_docs: "Compare two or more documents",
        summarize_doc: "Summarize one document",
        ask_docs: "A question whose answer is written inside their documents",
        general: "A greeting or something unrelated to their files",
      },
    },
  });
  const choice = answers?.intent?.choice;
  return choice && INTENTS.includes(choice as Intent) ? (choice as Intent) : null;
}

function answerFind(text: string, files: StoredFileLink[]) {
  if (files.length === 0) return "Your drive has no files yet.";
  const matched = matchingFiles(text, files);
  if (matched.length === 0) return null;
  const lines = matched.map((file, index) => formatFile(file, index + 1));
  return `I found ${matched.length === 1 ? "this file" : `${matched.length} files`}:\n\n${lines.join("\n\n")}`;
}

function answerFolder(text: string, files: StoredFileLink[], folders: StoredFolder[]) {
  const folder = bestFolder(text, folders);
  if (!folder) {
    if (folders.length === 0) return "You have no folders yet. Choose New, then New folder, to create one.";
    return `Which folder do you mean?\n\n${folders.map((item) => item.path).join("\n")}`;
  }
  const inside = filesInFolder(files, folder.path);
  const subfolders = folders.filter((item) => item.path.startsWith(`${folder.path} / `));
  const folderLines = subfolders.length > 0 ? `\n\nFolders inside it:\n${subfolders.map((item) => item.path).join("\n")}` : "";
  if (inside.length === 0) return `"${folder.path}" has no files.${folderLines}`;
  return `Inside "${folder.path}":\n\n${inside.map((file, index) => formatFile(file, index + 1)).join("\n\n")}${folderLines}`;
}

function answerSummary(files: StoredFileLink[], folders: StoredFolder[]) {
  const groups: [string, (file: StoredFileLink) => boolean][] = [
    ["Images", (file) => file.kind === "image"],
    ["PDFs", (file) => file.kind === "pdf"],
    ["Documents", (file) => file.kind === "doc" || file.kind === "slides" || file.kind === "text"],
    ["Sheets", (file) => file.kind === "sheet" || file.kind === "csv"],
    ["Videos", (file) => file.kind === "video"],
    ["Other", (file) => !["image", "pdf", "doc", "slides", "text", "sheet", "csv", "video"].includes(file.kind)],
  ];
  const counts = groups
    .map(([label, test]) => `${label}: ${files.filter(test).length}`)
    .join("\n");
  const folderLine = folders.length > 0 ? `\n\nFolders:\n${folders.map((folder) => folder.path).join("\n")}` : "\n\nYou have no folders yet.";
  const fileLabel = files.length === 1 ? "file" : "files";
  const folderLabel = folders.length === 1 ? "folder" : "folders";
  return `Your drive has ${files.length} ${fileLabel} and ${folders.length} ${folderLabel}.\n\n${counts}${folderLine}`;
}

function answerLink(text: string, files: StoredFileLink[]) {
  const urls = text.match(/https?:\/\/[^\s)]+/g) ?? [];
  if (urls.length === 0) {
    return "Paste an S3 link and I can tell you which of your files it opens. A permanent link has no X-Amz-Expires on the end. Anyone with that link can open the file.";
  }
  return urls
    .map((raw) => {
      let path = "";
      let permanent = true;
      try {
        const url = new URL(raw);
        path = decodeURIComponent(url.pathname);
        permanent = !url.searchParams.has("X-Amz-Expires") && !url.searchParams.has("X-Amz-Signature");
      } catch {
        return "That address is not a valid link.";
      }
      const file = files.find((item) => {
        if (!item.s3Url) return false;
        try {
          return decodeURIComponent(new URL(item.s3Url).pathname) === path;
        } catch {
          return false;
        }
      });
      if (!file) return "That link is not one of the files in your drive.";
      const expiry = permanent
        ? "It is a permanent S3 link. It does not expire. Anyone with this link can open the file."
        : "This is a signed S3 link, so it expires. The file itself is still in the bucket.";
      return `${file.name} is in ${file.folder}.\n${expiry}\n${linkFor(file)}`;
    })
    .join("\n\n");
}

function answerGuide(text: string) {
  const lower = text.toLowerCase();
  if (/\bfolder upload\b|\bupload a folder\b|\bupload the folder\b/.test(lower)) {
    return "Choose New, then Folder upload, and pick a folder from your computer. The folders are saved in the database. Each file inside is stored in S3, and the database keeps that file's permanent link.";
  }
  if (/\bnew folder\b|\bcreate a folder\b|\bmake a folder\b/.test(lower)) {
    return "Open the folder where it should go, or stay on the drive root. Choose New, then New folder, and enter a name.";
  }
  if (/\brename\b/.test(lower)) {
    return "Right-click the file or folder and choose Rename. Enter the new name and save it.";
  }
  if (/\bsearch\b/.test(lower)) {
    return "Use the search bar at the top. It looks through file and folder names in your drive.";
  }
  if (/\bdelete\b|\bremove\b/.test(lower)) {
    return "Right-click the file or folder and choose Delete. Deleting a folder also deletes everything inside it. You cannot undo that.";
  }
  if (/\blink\b|\bs3\b/.test(lower)) {
    return "Right-click a file and choose Get S3 link. That address does not expire. Anyone who has the link can open the file.";
  }
  return "Choose New to create a folder, upload a file, or upload a folder. Right-click an item to open it, download it, copy its S3 link, rename it, or delete it. Search from the bar at the top.";
}

function answerDelete(text: string, files: StoredFileLink[], folders: StoredFolder[]) {
  const folder = bestFolder(text, folders);
  const namedFiles = matchingFiles(text, files);
  const targetFolder = folder && (/\bfolder\b/i.test(text) || namedFiles.length === 0) ? folder : null;

  if (targetFolder) {
    const inside = filesInFolder(files, targetFolder.path);
    const subfolders = folders.filter((item) => item.path.startsWith(`${targetFolder.path} / `));
    const parts = [
      subfolders.length === 1 ? "1 folder inside it" : subfolders.length > 1 ? `${subfolders.length} folders inside it` : "",
      inside.length === 1 ? "1 file" : inside.length > 1 ? `${inside.length} files` : "",
    ].filter(Boolean);
    const contents = parts.length > 0 ? ` It contains ${parts.join(" and ")}.` : " It is empty.";
    const fileLines = inside.length > 0 ? `\n\n${inside.map((file, index) => formatFile(file, index + 1)).join("\n\n")}` : "";
    return `Deleting the folder "${targetFolder.path}" would remove that folder.${contents}${fileLines}\n\nNothing has been deleted. Right-click the folder and choose Delete to remove it.`;
  }

  if (namedFiles.length > 0) {
    return `Deleting would remove:\n\n${namedFiles.map((file, index) => formatFile(file, index + 1)).join("\n\n")}\n\nNothing has been deleted. Right-click the file and choose Delete to remove it.`;
  }

  return "Name the file or folder you want to check. Nothing has been deleted.";
}

function answerDuplicates(files: StoredFileLink[]) {
  const groups = new Map<string, StoredFileLink[]>();
  for (const file of files) {
    const key = file.name.toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), file]);
  }
  const duplicates = [...groups.values()].filter((group) => group.length > 1);
  if (duplicates.length === 0) return "No two files in your drive share the same name.";
  return duplicates
    .map((group) => {
      const lines = group.map((file, index) => formatFile(file, index + 1));
      return `${group.length} files are named "${group[0].name}":\n\n${lines.join("\n\n")}`;
    })
    .join("\n\n");
}

function answerList(files: StoredFileLink[]) {
  if (files.length === 0) return "You have not uploaded any files.";
  const label = files.length === 1 ? "file" : "files";
  return `You uploaded ${files.length} ${label}:\n\n${files.map((file, index) => formatFile(file, index + 1)).join("\n\n")}`;
}

/** Answers a signed-in user from their own drive and documents. Returns null for a general chat question. */
export async function answerUserDrive(ownerId: string, messages: ChatTurn[]) {
  const message = messages.at(-1)?.content ?? "";
  const { files, folders } = await getDriveSnapshot(ownerId);
  const scope = { ownerId, files };
  const asksAboutOneFile = /^in\s+["“][^"“”]+["”],/i.test(message.trim()) && !docKeywordIntent(message);
  const intent: Intent = asksAboutOneFile
    ? "ask_docs"
    : (keywordIntent(message, folders) ?? (await jevIntent(message)) ?? "general");

  const docIntent = DOC_INTENTS[intent];
  if (docIntent) return answerDocuments(scope, messages, docIntent);
  if (intent === "general") return answerDocuments(scope, messages, "ask");
  if (intent === "find") {
    return answerFind(message, files) ?? answerDocuments(scope, messages, "search");
  }
  if (intent === "folder") return answerFolder(message, files, folders);
  if (intent === "summary") return answerSummary(files, folders);
  if (intent === "explain_link") return answerLink(message, files);
  if (intent === "guide") return answerGuide(message);
  if (intent === "delete_check") return answerDelete(message, files, folders);
  if (intent === "duplicates") return answerDuplicates(files);
  return answerList(files);
}
