import "server-only";
import JSZip from "jszip";
import { extractText } from "unpdf";
import { writeText } from "./ai-gateway";

export type ExtractedSection = {
  /** Page number for PDFs. Null for formats without pages. */
  page: number | null;
  /** Heading, slide, or sheet name when the format has one. */
  section: string | null;
  text: string;
};

export type Extraction =
  | { status: "ready"; method: string; pages: number | null; sections: ExtractedSection[] }
  | { status: "unsupported"; reason: string };

const AI_READ_LIMIT = 18 * 1024 * 1024;
const ZIP_ENTRY_LIMIT = 60;

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "csv", "tsv", "json", "xml", "yaml", "yml", "log", "ini",
  "js", "ts", "tsx", "jsx", "py", "java", "c", "cpp", "cs", "go", "rb", "php", "sql", "sh",
]);

const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  heic: "image/heic",
};

const AUDIO_FORMATS: Record<string, string> = { mp3: "mp3", wav: "wav" };

function extensionOf(name: string) {
  return name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
}

function decodeXml(text: string) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, "&");
}

function tidy(text: string) {
  return text
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripHtml(html: string) {
  return decodeXml(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<\/(p|div|h[1-6]|li|tr|br)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  );
}

function ready(method: string, sections: ExtractedSection[], pages: number | null = null): Extraction {
  const kept = sections
    .map((section) => ({ ...section, text: tidy(section.text) }))
    .filter((section) => section.text.length > 0);
  if (kept.length === 0) return { status: "unsupported", reason: "No readable text was found in this file." };
  return { status: "ready", method, pages, sections: kept };
}

async function readPdf(bytes: Uint8Array, name: string): Promise<Extraction> {
  const { totalPages, text } = await extractText(new Uint8Array(bytes), { mergePages: false });
  const pages = text.map((pageText, index) => ({ page: index + 1, section: null, text: pageText }));
  const characters = text.join("").replace(/\s/g, "").length;

  if (characters >= Math.max(40, totalPages * 25)) return ready("pdf-text", pages, totalPages);
  if (bytes.byteLength > AI_READ_LIMIT) {
    return { status: "unsupported", reason: "This scanned PDF is too large for AI reading (over 18 MB)." };
  }

  const transcript = await writeText([
    {
      role: "user",
      content: [
        {
          type: "text",
          text:
            "Transcribe every page of this scanned PDF exactly. Before each page write a line '=== Page N ===' with its page number. Do not add commentary.",
        },
        {
          type: "file",
          file: {
            filename: name,
            file_data: `data:application/pdf;base64,${Buffer.from(bytes).toString("base64")}`,
          },
        },
      ],
    },
  ]);
  return ready("pdf-ai", splitPageMarkers(transcript), totalPages);
}

function splitPageMarkers(transcript: string): ExtractedSection[] {
  const parts = transcript.split(/^=+\s*Page\s+(\d+)\s*=+\s*$/im);
  if (parts.length < 3) return [{ page: null, section: null, text: transcript }];
  const sections: ExtractedSection[] = [];
  for (let index = 1; index < parts.length; index += 2) {
    sections.push({ page: Number(parts[index]), section: null, text: parts[index + 1] ?? "" });
  }
  return sections;
}

async function readDocx(zip: JSZip): Promise<Extraction> {
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) return { status: "unsupported", reason: "This Word file has no document body." };

  const sections: ExtractedSection[] = [];
  let current: ExtractedSection = { page: null, section: null, text: "" };

  for (const paragraph of xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []) {
    const text = decodeXml(
      paragraph
        .replace(/<w:tab\/>/g, "\t")
        .replace(/<w:br\/>/g, "\n")
        .match(/<w:t[^>]*>[^<]*<\/w:t>|\t|\n/g)
        ?.map((part) => part.replace(/<[^>]+>/g, ""))
        .join("") ?? "",
    ).trim();
    if (!text) continue;

    const style = /<w:pStyle w:val="([^"]+)"/.exec(paragraph)?.[1] ?? "";
    if (/^(heading|title)/i.test(style)) {
      if (current.text.trim()) sections.push(current);
      current = { page: null, section: text.slice(0, 160), text: `${text}\n` };
    } else {
      current.text += `${text}\n`;
    }
  }
  if (current.text.trim()) sections.push(current);
  return ready("docx", sections);
}

async function readPptx(zip: JSZip): Promise<Extraction> {
  const slides = Object.keys(zip.files)
    .map((path) => ({ path, number: Number(/^ppt\/slides\/slide(\d+)\.xml$/.exec(path)?.[1]) }))
    .filter((slide) => Number.isFinite(slide.number) && slide.number > 0)
    .sort((a, b) => a.number - b.number);

  const sections: ExtractedSection[] = [];
  for (const slide of slides) {
    const xml = (await zip.file(slide.path)?.async("string")) ?? "";
    const text = (xml.match(/<a:p>[\s\S]*?<\/a:p>/g) ?? [])
      .map((paragraph) =>
        decodeXml((paragraph.match(/<a:t>([^<]*)<\/a:t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, "")).join("")),
      )
      .filter(Boolean)
      .join("\n");
    sections.push({ page: null, section: `Slide ${slide.number}`, text });
  }
  return ready("pptx", sections);
}

async function readXlsx(zip: JSZip): Promise<Extraction> {
  const workbook = (await zip.file("xl/workbook.xml")?.async("string")) ?? "";
  const rels = (await zip.file("xl/_rels/workbook.xml.rels")?.async("string")) ?? "";
  const shared = (await zip.file("xl/sharedStrings.xml")?.async("string")) ?? "";

  const strings = (shared.match(/<si>[\s\S]*?<\/si>/g) ?? []).map((item) =>
    decodeXml((item.match(/<t[^>]*>([^<]*)<\/t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, "")).join("")),
  );
  const targets = new Map(
    (rels.match(/<Relationship [^>]+>/g) ?? []).map((rel) => [
      /Id="([^"]+)"/.exec(rel)?.[1] ?? "",
      /Target="([^"]+)"/.exec(rel)?.[1] ?? "",
    ]),
  );

  const sections: ExtractedSection[] = [];
  for (const sheet of workbook.match(/<sheet [^>]+>/g) ?? []) {
    const name = decodeXml(/name="([^"]+)"/.exec(sheet)?.[1] ?? "Sheet");
    const target = targets.get(/r:id="([^"]+)"/.exec(sheet)?.[1] ?? "") ?? "";
    const path = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
    const xml = (await zip.file(path)?.async("string")) ?? "";

    const rows = (xml.match(/<row[\s\S]*?<\/row>/g) ?? []).map((row) =>
      (row.match(/<c [^>]*(?:\/>|>[\s\S]*?<\/c>)/g) ?? [])
        .map((cell) => {
          const type = /t="([^"]+)"/.exec(cell)?.[1];
          if (type === "inlineStr") {
            return decodeXml((cell.match(/<t[^>]*>([^<]*)<\/t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, "")).join(""));
          }
          const value = /<v>([^<]*)<\/v>/.exec(cell)?.[1] ?? "";
          return type === "s" ? (strings[Number(value)] ?? "") : decodeXml(value);
        })
        .filter((value) => value !== "")
        .join(" | "),
    );
    sections.push({ page: null, section: `Sheet: ${name}`, text: rows.filter(Boolean).join("\n") });
  }
  return ready("xlsx", sections);
}

async function readOpenDocument(zip: JSZip): Promise<Extraction> {
  const xml = (await zip.file("content.xml")?.async("string")) ?? "";
  const text = decodeXml(
    xml
      .replace(/<text:(p|h)[^>]*>/g, "\n")
      .replace(/<text:tab\/>/g, "\t")
      .replace(/<[^>]+>/g, ""),
  );
  return ready("opendocument", [{ page: null, section: null, text }]);
}

async function readZipArchive(zip: JSZip): Promise<Extraction> {
  const sections: ExtractedSection[] = [];
  const entries = Object.values(zip.files).filter((entry) => !entry.dir).slice(0, ZIP_ENTRY_LIMIT);
  const listing = entries.map((entry) => entry.name).join("\n");
  sections.push({ page: null, section: "Archive contents", text: listing });

  for (const entry of entries) {
    const extension = extensionOf(entry.name);
    if (!TEXT_EXTENSIONS.has(extension) && !["docx", "pptx", "xlsx", "html", "htm"].includes(extension)) continue;
    const bytes = await entry.async("uint8array");
    const inner = await readWithoutAi(bytes, entry.name);
    if (inner?.status !== "ready") continue;
    for (const section of inner.sections) {
      sections.push({ ...section, section: section.section ? `${entry.name}: ${section.section}` : entry.name });
    }
  }
  return ready("zip", sections);
}

/** Reads formats that do not need the AI model. Returns null for formats it does not know. */
async function readWithoutAi(bytes: Uint8Array, name: string): Promise<Extraction | null> {
  const extension = extensionOf(name);
  if (["docx", "pptx", "xlsx", "odt", "ods", "odp", "zip"].includes(extension)) {
    const zip = await JSZip.loadAsync(bytes);
    if (extension === "docx") return readDocx(zip);
    if (extension === "pptx") return readPptx(zip);
    if (extension === "xlsx") return readXlsx(zip);
    if (extension === "zip") return readZipArchive(zip);
    return readOpenDocument(zip);
  }
  if (extension === "html" || extension === "htm") {
    return ready("html", [{ page: null, section: null, text: stripHtml(new TextDecoder().decode(bytes)) }]);
  }
  if (extension === "rtf") {
    const raw = new TextDecoder().decode(bytes);
    const text = raw
      .replace(/\\par[d]?/g, "\n")
      .replace(/\\'[0-9a-f]{2}/gi, "")
      .replace(/\\[a-z]+-?\d* ?/gi, "")
      .replace(/[{}]/g, "");
    return ready("rtf", [{ page: null, section: null, text }]);
  }
  if (TEXT_EXTENSIONS.has(extension)) {
    return ready("text", [{ page: null, section: null, text: new TextDecoder().decode(bytes) }]);
  }
  return null;
}

async function readImage(bytes: Uint8Array, mimeType: string): Promise<Extraction> {
  if (bytes.byteLength > AI_READ_LIMIT) {
    return { status: "unsupported", reason: "This image is too large for AI reading (over 18 MB)." };
  }
  const text = await writeText([
    {
      role: "user",
      content: [
        {
          type: "text",
          text:
            "Transcribe all readable text in this image exactly. Then add one line starting 'Image description:' that describes the image in one or two sentences.",
        },
        {
          type: "image_url",
          image_url: { url: `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}` },
        },
      ],
    },
  ]);
  return ready("image-ai", [{ page: null, section: null, text }]);
}

async function readAudio(bytes: Uint8Array, format: string): Promise<Extraction> {
  if (bytes.byteLength > AI_READ_LIMIT) {
    return { status: "unsupported", reason: "This audio file is too large for AI reading (over 18 MB)." };
  }
  const text = await writeText([
    {
      role: "user",
      content: [
        { type: "text", text: "Transcribe this recording word for word. Do not add commentary." },
        { type: "input_audio", input_audio: { data: Buffer.from(bytes).toString("base64"), format } },
      ],
    },
  ]);
  return ready("audio-ai", [{ page: null, section: "Transcript", text }]);
}

/** Turns an uploaded file into searchable text, with page or section labels where the format has them. */
export async function extractDocument(bytes: Uint8Array, name: string, mimeType: string): Promise<Extraction> {
  const extension = extensionOf(name);
  const mime = mimeType.toLowerCase();

  if (extension === "pdf" || mime === "application/pdf") return readPdf(bytes, name);

  const known = await readWithoutAi(bytes, name);
  if (known) return known;

  if (mime.startsWith("text/")) {
    return ready("text", [{ page: null, section: null, text: new TextDecoder().decode(bytes) }]);
  }
  if (IMAGE_TYPES[extension] || mime.startsWith("image/")) {
    if (mime === "image/svg+xml" || extension === "svg") {
      return ready("svg", [{ page: null, section: null, text: stripHtml(new TextDecoder().decode(bytes)) }]);
    }
    return readImage(bytes, IMAGE_TYPES[extension] ?? mime);
  }
  if (AUDIO_FORMATS[extension]) return readAudio(bytes, AUDIO_FORMATS[extension]);
  if (mime.startsWith("video/")) return { status: "unsupported", reason: "Video files are not read." };
  if (["doc", "xls", "ppt"].includes(extension)) {
    return {
      status: "unsupported",
      reason: `Old .${extension} files cannot be read. Save it as .${extension}x and upload it again.`,
    };
  }
  return { status: "unsupported", reason: "This file type cannot be read." };
}
