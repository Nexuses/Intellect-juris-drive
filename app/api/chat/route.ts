import { after } from "next/server";
import { WRITING_MODEL } from "@/app/lib/ai-gateway";
import { getCurrentUser } from "@/app/lib/dal";
import { answerDocuments, docKeywordIntent } from "@/app/lib/doc-ai";
import { getIndexSummary, indexUnreadFiles } from "@/app/lib/doc-index";
import { getDriveSnapshot, listStoredFileLinks, type StoredFileLink } from "@/app/lib/drive";
import { answerUserDrive } from "@/app/lib/user-assistant";
import { listUsers, type PublicUser } from "@/app/lib/users";

const GATEWAY = "https://ai-gateway.vercel.sh/v1";
const CHAT_MODEL = WRITING_MODEL;

export const maxDuration = 300;
const MAX_MESSAGES = 20;
const MAX_CHARS = 4000;

type ChatMessage = { role: "user" | "assistant"; content: string };

function cleanMessages(value: unknown): ChatMessage[] | null {
  if (!Array.isArray(value)) return null;
  const messages: ChatMessage[] = [];
  for (const item of value.slice(-MAX_MESSAGES)) {
    if (!item || typeof item !== "object") continue;
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") continue;
    const trimmed = content.trim().slice(0, MAX_CHARS);
    if (!trimmed) continue;
    messages.push({ role, content: trimmed });
  }
  if (messages.length === 0 || messages.at(-1)?.role !== "user") return null;
  return messages;
}

function replyText(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const content = (payload as { choices?: { message?: { content?: unknown } }[] }).choices?.[0]
    ?.message?.content;
  if (typeof content === "string") return content.trim() || null;
  if (!Array.isArray(content)) return null;
  const text = content
    .map((part) =>
      part && typeof part === "object" && "text" in part ? String(part.text) : "",
    )
    .join("")
    .trim();
  return text || null;
}

async function jevTopic(key: string, message: string) {
  try {
    const response = await fetch(`${GATEWAY}/evaluate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "typesafe-ai/jev",
        state: message,
        questions: {
          topic: {
            type: "choice",
            instructions: "What is this message mainly about?",
            criteria: {
              upload: "Uploading a file or a folder from the computer",
              folders: "Creating, opening, or organizing folders",
              links: "An S3 link, download, preview, or sharing a file",
              account: "Login, users, or the admin console",
              general: "A greeting or anything else",
            },
          },
        },
      }),
    });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    const choice =
      data &&
      typeof data === "object" &&
      "answers" in data &&
      data.answers &&
      typeof data.answers === "object" &&
      "topic" in data.answers &&
      data.answers.topic &&
      typeof data.answers.topic === "object" &&
      "choice" in data.answers.topic
        ? data.answers.topic.choice
        : null;
    return typeof choice === "string" ? choice : null;
  } catch {
    return null;
  }
}

function asksForStoredLinks(text: string) {
  if (/\bhow\b/i.test(text) && !/\b(show|share|list|send|give)\b/i.test(text)) return false;
  const wantsLinks = /\b(s3|links?)\b/i.test(text);
  const wantsList =
    /\b(show|share|list|send|give|what|which)\b/i.test(text) &&
    /\b(files?|uploads?|uploaded|documents?|links?)\b/i.test(text);
  return wantsLinks || wantsList;
}

function asksForEveryone(text: string) {
  return /\b(all|every|everyone|each)\b/i.test(text);
}

function mentionsUser(text: string, person: PublicUser) {
  const haystack = text.toLowerCase();
  const name = person.name.trim().toLowerCase();
  if (name.length >= 2 && haystack.includes(name)) return true;
  const email = person.email.toLowerCase();
  if (haystack.includes(email)) return true;
  const local = email.split("@")[0] ?? "";
  return local.length >= 3 && haystack.includes(local);
}

function formatFileList(person: PublicUser, files: StoredFileLink[]) {
  if (files.length === 0) {
    return `${person.name} (${person.email}) has not uploaded any files.`;
  }
  const lines = files.map((file, index) => {
    const link = file.s3Url ?? "No S3 link is stored for this file yet.";
    return `${index + 1}. ${file.name}\nFolder: ${file.folder}\n${link}`;
  });
  const label = files.length === 1 ? "file" : "files";
  return `${person.name} (${person.email}) uploaded ${files.length} ${label}:\n\n${lines.join("\n\n")}`;
}

async function fileRecordsFor(actor: PublicUser, question: string) {
  if (!asksForStoredLinks(question)) return null;

  if (actor.role !== "admin") {
    const files = await listStoredFileLinks(actor.id);
    return formatFileList(actor, files);
  }

  const people = await listUsers();
  const named = people.filter((person) => mentionsUser(question, person));
  const selected = named.length > 0 ? named : asksForEveryone(question) ? people : [];
  if (selected.length === 0) {
    if (!/\b(show|share|list|send|give)\b/i.test(question)) return null;
    const directory = people.map((person) => `${person.name} (${person.email})`).join("\n");
    return `Say which user you want. These are the accounts:\n\n${directory}`;
  }

  const sections = await Promise.all(
    selected.map(async (person) => formatFileList(person, await listStoredFileLinks(person.id))),
  );
  return sections.join("\n\n");
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  const key = process.env.JEV_API_KEY;
  if (!key) return Response.json({ error: "JEV_API_KEY is not set." }, { status: 500 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const messages = cleanMessages(
    body && typeof body === "object" && "messages" in body ? body.messages : null,
  );
  if (!messages) return Response.json({ error: "Enter a message." }, { status: 400 });

  const latest = messages.at(-1)?.content ?? "";
  if ((await getIndexSummary()).waiting > 0) after(() => indexUnreadFiles());

  let records: string | null = null;
  try {
    if (user.role !== "admin") {
      const answer = await answerUserDrive(user.id, messages);
      if (answer) return Response.json({ reply: answer });
    }

    const question = messages
      .filter((message) => message.role === "user")
      .map((message) => message.content)
      .join("\n");
    records = await fileRecordsFor(user, question);
    if (records && asksForStoredLinks(latest)) return Response.json({ reply: records });

    if (user.role === "admin") {
      const [{ files }, people] = await Promise.all([getDriveSnapshot(null), listUsers()]);
      const scope = {
        ownerId: null,
        files,
        ownerNames: new Map(people.map((person) => [person.id, person.name])),
      };
      const answer = await answerDocuments(scope, messages, docKeywordIntent(latest) ?? "ask");
      if (answer) return Response.json({ reply: answer });
    }
  } catch (error) {
    console.error("Jev document answer failed", error);
    return Response.json({ error: "Jev could not read the documents just now. Try again." }, { status: 502 });
  }

  const topic = await jevTopic(key, latest);

  const response = await fetch(`${GATEWAY}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages: [
        {
          role: "system",
          content: [
            "You are Jev, the assistant inside Intellect Juris, a private document drive for a law office.",
            `You are talking to ${user.name}, who is ${user.role === "admin" ? "an admin" : "a user"}.`,
            topic ? `A classifier labeled this message as: ${topic}. Use that only as a hint.` : "",
            records ? `Stored file records:\n${records}` : "",
            "Users sign in on the user login page and get a private drive. They can create folders, upload files, upload a folder from their computer, search, rename, and delete.",
            "Jev also reads uploaded documents. People can ask it to find a document by what it says, summarize a file, compare files by name, or answer questions with the source file and page.",
            "A folder is stored in the database. A file is stored in S3, and the database stores that file's permanent S3 link and the folder it belongs to.",
            "Get S3 link copies a public address that does not expire. Anyone with that link can open the file.",
            "Admins sign in at the admin page, see upload stats on the dashboard, and create, edit, or delete users.",
            user.role === "admin"
              ? "This person is an admin. When stored file records are included below, list every file name and paste each S3 link exactly."
              : "This person is a regular user. Only discuss their own files.",
            "Do not give legal advice. Do not ask for or reveal passwords or API keys.",
            "Answer in a few short sentences.",
          ]
            .filter(Boolean)
            .join(" "),
        },
        ...messages,
      ],
    }),
  });

  if (!response.ok) {
    return Response.json({ error: "Jev could not answer just now. Try again." }, { status: 502 });
  }

  const reply = replyText(await response.json());
  if (!reply) {
    return Response.json({ error: "Jev returned an empty reply. Try again." }, { status: 502 });
  }

  return Response.json({ reply });
}
