export type FileKind =
  | "image"
  | "pdf"
  | "video"
  | "audio"
  | "sheet"
  | "csv"
  | "doc"
  | "slides"
  | "archive"
  | "text"
  | "code"
  | "file";

const EXTENSION_KINDS: Record<string, FileKind> = {
  csv: "csv",
  xls: "sheet",
  xlsx: "sheet",
  ods: "sheet",
  doc: "doc",
  docx: "doc",
  odt: "doc",
  rtf: "doc",
  ppt: "slides",
  pptx: "slides",
  odp: "slides",
  zip: "archive",
  rar: "archive",
  "7z": "archive",
  tar: "archive",
  gz: "archive",
  txt: "text",
  md: "text",
  json: "code",
  js: "code",
  ts: "code",
  tsx: "code",
  html: "code",
  css: "code",
  py: "code",
  xml: "code",
};

export function fileKind(mimeType: string | null, name: string): FileKind {
  const extension = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  if (EXTENSION_KINDS[extension]) return EXTENSION_KINDS[extension];

  const mime = mimeType ?? "";
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("text/")) return "text";
  return "file";
}

const PREVIEWABLE_IMAGES = /^image\/(png|jpe?g|gif|webp|avif|bmp)$/;

export function hasImagePreview(mimeType: string | null) {
  return PREVIEWABLE_IMAGES.test(mimeType ?? "");
}

export function formatSize(bytes: number | null) {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

export function formatModified(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
