import "server-only";

const GATEWAY = "https://ai-gateway.vercel.sh/v1";

/** Writes summaries, comparisons, answers, and reads scans. Changing it changes cost. */
export const WRITING_MODEL = "google/gemini-2.5-flash";

/** Ranks and chooses. It does not write text. */
export const DECISION_MODEL = "typesafe-ai/jev";

export function gatewayKey() {
  const key = process.env.JEV_API_KEY;
  if (!key) throw new Error("JEV_API_KEY is not set in .env.local");
  return key;
}

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } }
  | { type: "input_audio"; input_audio: { data: string; format: string } };

export type GatewayMessage = {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
};

function textFrom(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const content = (payload as { choices?: { message?: { content?: unknown } }[] }).choices?.[0]
    ?.message?.content;
  if (typeof content === "string") return content.trim() || null;
  if (!Array.isArray(content)) return null;
  const text = content
    .map((part) => (part && typeof part === "object" && "text" in part ? String(part.text) : ""))
    .join("")
    .trim();
  return text || null;
}

export async function writeText(messages: GatewayMessage[]) {
  const response = await fetch(`${GATEWAY}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${gatewayKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: WRITING_MODEL, messages }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`The writing model returned ${response.status}. ${detail.slice(0, 200)}`);
  }
  const text = textFrom(await response.json());
  if (!text) throw new Error("The writing model returned an empty reply.");
  return text;
}

type BooleanQuestion = { type: "boolean"; instructions: string };
type ChoiceQuestion = {
  type: "choice";
  instructions: string;
  criteria: Record<string, string>;
};

/** Asks Jev typed questions about `state`. Returns null when Jev cannot be reached. */
export async function askJev(
  state: unknown,
  questions: Record<string, BooleanQuestion | ChoiceQuestion>,
): Promise<Record<string, { probability?: number; choice?: string }> | null> {
  try {
    const response = await fetch(`${GATEWAY}/evaluate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${gatewayKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: DECISION_MODEL, state, questions }),
    });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    if (!data || typeof data !== "object" || !("answers" in data)) return null;
    const answers = (data as { answers: unknown }).answers;
    return answers && typeof answers === "object"
      ? (answers as Record<string, { probability?: number; choice?: string }>)
      : null;
  } catch {
    return null;
  }
}
