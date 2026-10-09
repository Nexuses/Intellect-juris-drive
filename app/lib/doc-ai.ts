import "server-only";
import { askJev, writeText, type GatewayMessage } from "./ai-gateway";
import type { StoredFileLink } from "./drive";
import {
  getIndexStatus,
  getIndexSummary,
  indexFile,
  readFilePassages,
  searchPassages,
  type Passage,
} from "./doc-index";

export type DocScope = {
  /** Null means every account, for admins. */
  ownerId: string | null;
  files: StoredFileLink[];
  ownerNames?: Map<string, string>;
};

export type DocIntent = "compare" | "summarize" | "search" | "ask";

type ChatTurn = { role: "user" | "assistant"; content: string };

type RankedPassage = Passage & { relevance: number; file: StoredFileLink };

const QUERY_STOP_WORDS = new Set([
  "find", "search", "look", "locate", "show", "give", "tell", "list", "please", "can", "could",
  "document", "documents", "doc", "docs", "file", "files", "pdf", "pdfs", "containing", "contain",
  "contains", "mention", "mentions", "mentioning", "regarding", "related", "about", "details",
  "information", "info", "which", "where", "what", "that", "our", "my", "the", "with", "has", "have",
]);

const NAME_STOP_WORDS = new Set(["the", "and", "for", "final", "copy", "new", "file", "doc", "document", "scan"]);

const PLAIN_TEXT_RULE =
  "Write plain text only. Do not use Markdown symbols such as #, *, or **. Use '- ' at the start of a line for list items.";

export function docKeywordIntent(text: string): DocIntent | null {
  const lower = text.toLowerCase();
  if (/\b(compare|comparison|differences?|differ|versus|vs\.?)\b/.test(lower)) return "compare";
  if (/\b(summar(y|ise|ize|ization)|tl;?dr|key points|main points)\b/.test(lower)) return "summarize";
  if (
    /\b(find|search|look for|locate|which|show)\b/.test(lower) &&
    /\b(documents?|files?|pdfs?|contracts?|agreements?|records?)\b/.test(lower) &&
    /\b(contain|containing|contains|about|mention|mentions|mentioning|with|has|have|regarding|related|that|where)\b/.test(lower)
  ) {
    return "search";
  }
  return null;
}

function locationOf(passage: { page: number | null; section: string | null }) {
  if (passage.page) return `page ${passage.page}`;
  if (passage.section) return passage.section;
  return null;
}

function fileLabel(scope: DocScope, file: StoredFileLink) {
  const owner = scope.ownerId === null ? scope.ownerNames?.get(file.ownerId) : null;
  return owner ? `${file.name} (${owner})` : file.name;
}

function sourceLine(scope: DocScope, file: StoredFileLink, passage?: { page: number | null; section: string | null }) {
  const where = passage ? locationOf(passage) : null;
  const link = file.s3Url ?? "No S3 link is stored for this file yet.";
  return `${fileLabel(scope, file)}${where ? `, ${where}` : ""}\n${link}`;
}

function snippet(text: string, max = 220) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max).trimEnd()}...` : flat;
}

function queryTerms(question: string) {
  return question
    .toLowerCase()
    .replace(/[’']s\b/g, "")
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !QUERY_STOP_WORDS.has(word))
    .join(" ");
}

async function expandedTerms(question: string) {
  try {
    const text = await writeText([
      {
        role: "user",
        content: `List 10 short search keywords and synonyms someone would find inside a document that answers this request. Return only the words separated by spaces.\n\nRequest: ${question}`,
      },
    ]);
    return text.replace(/[^a-zA-Z0-9\s-]/g, " ");
  } catch {
    return "";
  }
}

async function unreadNote() {
  const summary = await getIndexSummary();
  if (summary.waiting === 0) return "";
  const label = summary.waiting === 1 ? "1 file is" : `${summary.waiting} files are`;
  return `\n\n${label} still being read, so results may be incomplete. Try again in a minute.`;
}

/** Finds passages that answer `question`, ranked by Jev. */
export async function findRelevantPassages(
  scope: DocScope,
  question: string,
  options: { limit?: number; expand?: boolean } = {},
): Promise<RankedPassage[]> {
  const limit = options.limit ?? 8;
  const files = new Map(scope.files.map((file) => [file.id, file]));
  const inScope = (passages: Passage[]) => passages.filter((passage) => files.has(passage.fileId));

  let candidates = inScope(await searchPassages(scope.ownerId, queryTerms(question) || question));
  if (candidates.length === 0 && options.expand) {
    const extra = await expandedTerms(question);
    if (extra) candidates = inScope(await searchPassages(scope.ownerId, extra));
  }
  if (candidates.length === 0) return [];

  const perFile = new Map<string, number>();
  const picked: Passage[] = [];
  for (const passage of candidates) {
    const used = perFile.get(passage.fileId) ?? 0;
    if (used >= 2) continue;
    perFile.set(passage.fileId, used + 1);
    picked.push(passage);
    if (picked.length >= 12) break;
  }

  const state = {
    question,
    passages: Object.fromEntries(
      picked.map((passage, index) => [
        `p${index}`,
        `${files.get(passage.fileId)?.name ?? "File"}${locationOf(passage) ? ` (${locationOf(passage)})` : ""}: ${passage.text.slice(0, 1200)}`,
      ]),
    ),
  };
  const questions = Object.fromEntries(
    picked.map((_, index) => [
      `p${index}`,
      {
        type: "boolean" as const,
        instructions: `Does passage p${index} contain information that helps answer the question?`,
      },
    ]),
  );
  const answers = await askJev(state, questions);

  const ranked = picked.map((passage, index) => ({
    ...passage,
    file: files.get(passage.fileId)!,
    relevance: answers ? (answers[`p${index}`]?.probability ?? 0) : 1 - index / picked.length,
  }));
  return ranked
    .filter((passage) => passage.relevance >= 0.5)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, limit);
}

/** Search by meaning. Returns one entry per document with its best passage. */
export async function searchDocuments(scope: DocScope, question: string) {
  const passages = await findRelevantPassages(scope, question, { limit: 12, expand: true });
  const seen = new Set<string>();
  return passages.filter((passage) => {
    if (seen.has(passage.fileId)) return false;
    seen.add(passage.fileId);
    return true;
  });
}

async function searchReply(scope: DocScope, question: string) {
  const results = await searchDocuments(scope, question);
  if (results.length === 0) return `No document mentions that.${await unreadNote()}`;
  const lines = results.map(
    (result, index) =>
      `${index + 1}. ${fileLabel(scope, result.file)}${locationOf(result) ? `, ${locationOf(result)}` : ""}\nFolder: ${result.file.folder}\n"${snippet(result.text)}"\n${result.file.s3Url ?? "No S3 link is stored for this file yet."}`,
  );
  const label = results.length === 1 ? "This document matches" : `These ${results.length} documents match`;
  return `${label}:\n\n${lines.join("\n\n")}`;
}

/** Files named in `text`, best match first. */
export function filesNamedIn(text: string, files: StoredFileLink[]) {
  const lower = text.toLowerCase();
  const quoted = [...text.matchAll(/["“”]([^"“”]{2,240})["“”]/g)].map((match) => match[1].toLowerCase().trim());

  return files
    .map((file) => {
      const name = file.name.toLowerCase();
      const base = name.replace(/\.[a-z0-9]+$/, "");
      if (quoted.some((value) => value === name || value === base)) return { file, score: 100, position: 0 };
      if (lower.includes(name)) return { file, score: 90, position: lower.indexOf(name) };
      if (base.length >= 3 && lower.includes(base)) return { file, score: 80, position: lower.indexOf(base) };

      const tokens = base.split(/[^a-z0-9]+/).filter((token) => token.length >= 3 && !NAME_STOP_WORDS.has(token));
      const matched = tokens.filter((token) => new RegExp(`\\b${token}`).test(lower));
      const strong = matched.length >= 2 || (matched.length === 1 && tokens.length === 1 && matched[0].length >= 4);
      if (!strong) return { file, score: 0, position: Infinity };
      return { file, score: 10 * matched.length, position: lower.indexOf(matched[0]) };
    })
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || a.position - b.position)
    .map((match) => match.file);
}

async function ensureRead(file: StoredFileLink) {
  let status = (await getIndexStatus([file.id])).get(file.id);
  if (!status) {
    await indexFile(file.id);
    status = (await getIndexStatus([file.id])).get(file.id);
  }
  if (!status) return { ok: false as const, reason: "This file could not be read." };
  if (status.status !== "ready") return { ok: false as const, reason: status.reason ?? "This file could not be read." };
  return { ok: true as const };
}

function documentText(passages: Passage[]) {
  return passages
    .map((passage) => {
      const where = locationOf(passage);
      return where ? `[${where}]\n${passage.text}` : passage.text;
    })
    .join("\n\n");
}

async function summarizeReply(scope: DocScope, message: string) {
  let file = filesNamedIn(message, scope.files)[0];
  let closest = false;
  if (!file) {
    const best = (await findRelevantPassages(scope, message, { limit: 1, expand: true }))[0];
    if (!best) return "Name the file you want summarized, for example: Summarize \"Lease Agreement.pdf\".";
    file = best.file;
    closest = true;
  }

  const read = await ensureRead(file);
  if (!read.ok) return `I can't summarize ${file.name}. ${read.reason}`;

  const passages = await readFilePassages(file.id, 400_000);
  const summary = await writeText([
    {
      role: "system",
      content: `You summarize documents for a law office. ${PLAIN_TEXT_RULE} Use only the document text. Do not give legal advice.`,
    },
    {
      role: "user",
      content: `Summarize this document. Start with a two or three sentence overview. Then list the key points. After each point, put the page or section in brackets when the text shows one, for example [page 4]. Finish with any dates, amounts, parties, and deadlines that appear.\n\nDocument: ${file.name}\n\n${documentText(passages)}`,
    },
  ]);
  const intro = closest ? `I summarized ${fileLabel(scope, file)}, the closest match to your request.\n\n` : "";
  return `${intro}${summary}\n\nSource:\n${sourceLine(scope, file)}`;
}

async function compareReply(scope: DocScope, message: string) {
  const named = filesNamedIn(message, scope.files);
  const unique = named.filter((file, index) => named.findIndex((other) => other.id === file.id) === index).slice(0, 4);
  if (unique.length < 2) {
    return "Name at least two files to compare, for example: Compare \"Contract A.pdf\" and \"Contract B.pdf\".";
  }

  const budget = Math.floor(400_000 / unique.length);
  const parts: string[] = [];
  for (const [index, file] of unique.entries()) {
    const read = await ensureRead(file);
    if (!read.ok) return `I can't compare these files. ${file.name}: ${read.reason}`;
    const passages = await readFilePassages(file.id, budget);
    const letter = String.fromCharCode(65 + index);
    parts.push(`Document ${letter}: ${file.name}\n\n${documentText(passages)}`);
  }

  const comparison = await writeText([
    {
      role: "system",
      content: `You compare documents for a law office. ${PLAIN_TEXT_RULE} Use only the document text. Do not give legal advice.`,
    },
    {
      role: "user",
      content: `Compare these documents. Give a short overview, then list what they have in common, then list the differences that matter, such as parties, amounts, dates, terms, and obligations. Name each document by its letter and file name. Put the page or section in brackets when the text shows one, for example [A, page 3].\n\n${parts.join("\n\n=====\n\n")}`,
    },
  ]);
  const sources = unique.map((file, index) => `${String.fromCharCode(65 + index)}. ${sourceLine(scope, file)}`);
  return `${comparison}\n\nSources:\n${sources.join("\n")}`;
}

function fileQuotedIn(text: string, files: StoredFileLink[]) {
  const lower = text.toLowerCase();
  return files.find((file) => {
    const name = file.name.toLowerCase();
    return lower.includes(`"${name}"`) || lower.includes(`“${name}”`);
  });
}

async function fileAnswerReply(scope: DocScope, file: StoredFileLink, messages: ChatTurn[]) {
  const read = await ensureRead(file);
  if (!read.ok) return `I can't read ${file.name}. ${read.reason}`;

  const passages = await readFilePassages(file.id, 400_000);
  const history: GatewayMessage[] = messages.slice(-7, -1).map((turn) => ({ role: turn.role, content: turn.content }));
  const answer = await writeText([
    {
      role: "system",
      content: `You answer questions for a law office using only the document below. ${PLAIN_TEXT_RULE} After each fact, put the page or section in brackets when the text shows one, for example [page 4]. If the document does not answer the question, say so plainly. Do not give legal advice.\n\nDocument: ${file.name}\n\n${documentText(passages)}`,
    },
    ...history,
    { role: "user", content: messages.at(-1)?.content ?? "" },
  ]);
  return `${answer}\n\nSource:\n${sourceLine(scope, file)}`;
}

async function answerReply(scope: DocScope, messages: ChatTurn[]) {
  const latest = messages.at(-1)?.content ?? "";
  const quoted = fileQuotedIn(latest, scope.files);
  if (quoted) return fileAnswerReply(scope, quoted, messages);

  const previousQuestion = [...messages].reverse().find((turn, index) => index > 0 && turn.role === "user")?.content;
  const query = latest.length < 60 && previousQuestion ? `${previousQuestion} ${latest}` : latest;

  const passages = await findRelevantPassages(scope, query, { limit: 8 });
  if (passages.length === 0) return null;

  const numbered = passages.map((passage, index) => {
    const where = locationOf(passage);
    return `[${index + 1}] ${passage.file.name}${where ? `, ${where}` : ""}\n${passage.text}`;
  });

  const history: GatewayMessage[] = messages.slice(-7, -1).map((turn) => ({ role: turn.role, content: turn.content }));
  const answer = await writeText([
    {
      role: "system",
      content: `You answer questions for a law office using only the numbered sources from their documents. ${PLAIN_TEXT_RULE} Put the source number in brackets after each fact, for example [2]. If the sources do not answer the question, say so plainly. Do not give legal advice.`,
    },
    ...history,
    { role: "user", content: `Sources:\n\n${numbered.join("\n\n")}\n\nQuestion: ${latest}` },
  ]);

  const cited = [...new Set([...answer.matchAll(/\[(\d+)\]/g)].map((match) => Number(match[1])))]
    .filter((number) => number >= 1 && number <= passages.length)
    .sort((a, b) => a - b);
  const used = cited.length > 0 ? cited : passages.map((_, index) => index + 1);
  const sources = used.map((number) => {
    const passage = passages[number - 1];
    return `[${number}] ${sourceLine(scope, passage.file, passage)}`;
  });
  return `${answer}\n\nSources:\n${sources.join("\n")}`;
}

/** Document features for the chat. Returns null when no saved document answers an open question. */
export async function answerDocuments(scope: DocScope, messages: ChatTurn[], intent: DocIntent) {
  const latest = messages.at(-1)?.content ?? "";
  if (scope.files.length === 0) {
    return intent === "ask" ? null : "There are no uploaded files to read yet.";
  }
  if (intent === "compare") return compareReply(scope, latest);
  if (intent === "summarize") return summarizeReply(scope, latest);
  if (intent === "search") return searchReply(scope, latest);
  return answerReply(scope, messages);
}
