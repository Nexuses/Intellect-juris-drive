"use client";

import { useEffect, useState } from "react";
import type { DriveItem } from "@/app/lib/drive";
import { useDrive } from "./drive-provider";
import {
  fileKind,
  formatModified,
  formatSize,
  hasImagePreview,
  isHtmlFile,
  isOfficeKind,
  officeViewerUrl,
  type FileKind,
} from "./file-kind";
import { FileComments } from "@/app/ui/file-comments";
import { CloseIcon, CommentIcon, DownloadIcon, FileTypeIcon, MoreIcon, OpenIcon } from "./icons";

const TEXT_KINDS: FileKind[] = ["text", "code", "csv"];
const MAX_TEXT_CHARS = 200_000;

function TextPreview({ src }: { src: string }) {
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(src, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Could not load file.");
        return response.text();
      })
      .then((body) => setText(body.length > MAX_TEXT_CHARS ? `${body.slice(0, MAX_TEXT_CHARS)}\n…` : body))
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [src]);

  if (failed) return <NoPreview message="This file could not be loaded." />;
  if (text === null) return <p className="m-auto text-sm text-ink/55">Loading preview...</p>;
  return (
    <pre className="h-full w-full overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-xs leading-relaxed text-ink [overflow-wrap:anywhere] sm:p-6 sm:text-[13px]">
      {text}
    </pre>
  );
}

function NoPreview({ kind, message }: { kind?: FileKind; message: string }) {
  return (
    <div className="m-auto flex flex-col items-center gap-4 px-6 text-center">
      {kind && <FileTypeIcon kind={kind} className="h-16 w-16" />}
      <p className="text-sm text-ink/60">{message}</p>
    </div>
  );
}

function PreviewBody({ item }: { item: DriveItem }) {
  const src = `/api/files/${item.id}`;
  const kind = fileKind(item.mimeType, item.name);

  if (hasImagePreview(item.mimeType)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- authenticated, user-uploaded content
      <img src={src} alt={item.name} className="m-auto max-h-full max-w-full object-contain p-2" />
    );
  }
  if (kind === "pdf") {
    return <iframe src={src} title={item.name} className="h-full w-full border-0" />;
  }
  if (kind === "video") {
    return <video src={src} controls className="m-auto max-h-full max-w-full" />;
  }
  if (kind === "audio") {
    return (
      <div className="m-auto flex w-full max-w-md flex-col items-center gap-6 px-6">
        <FileTypeIcon kind={kind} className="h-16 w-16" />
        <audio src={src} controls className="w-full" />
      </div>
    );
  }
  if (isHtmlFile(item.mimeType, item.name)) {
    return (
      <iframe
        src={src}
        title={item.name}
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        className="h-full w-full border-0 bg-white"
      />
    );
  }
  if (TEXT_KINDS.includes(kind)) return <TextPreview key={item.id} src={src} />;
  if (isOfficeKind(kind) && item.s3Url) {
    return <iframe src={officeViewerUrl(item.s3Url)} title={item.name} className="h-full w-full border-0" />;
  }
  return <NoPreview kind={kind} message="No preview is available for this file type. Download it to view." />;
}

type FilePreviewPaneProps = {
  item: DriveItem;
  commentsOpen: boolean;
  onToggleComments: () => void;
  onClose: () => void;
};

export function FilePreviewPane({ item, commentsOpen, onToggleComments, onClose }: FilePreviewPaneProps) {
  const { openItem, openItemMenu } = useDrive();

  const iconButton =
    "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink/60 transition hover:bg-sand hover:text-ink";

  return (
    <section
      aria-label={`Preview of ${item.name}`}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.stopPropagation()}
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-sand bg-cream"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-sand py-2 pl-3 pr-1 sm:gap-3 sm:pl-4 sm:pr-2">
        <FileTypeIcon kind={fileKind(item.mimeType, item.name)} className="h-5 w-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{item.name}</p>
          <p className="truncate text-xs text-ink/55" suppressHydrationWarning>
            {formatSize(item.size)} · {formatModified(item.updatedAt)}
          </p>
        </div>
        <button
          type="button"
          aria-label={commentsOpen ? "Hide comments" : "Show comments"}
          aria-pressed={commentsOpen}
          title={commentsOpen ? "Hide comments" : "Comments"}
          onClick={onToggleComments}
          className={`${iconButton} ${commentsOpen ? "bg-sand text-ink" : ""}`}
        >
          <CommentIcon className="h-[18px] w-[18px]" />
        </button>
        <button type="button" aria-label="Open in new tab" title="Open in new tab" onClick={() => openItem(item)} className={iconButton}>
          <OpenIcon className="h-[18px] w-[18px]" />
        </button>
        <a
          href={`/api/files/${item.id}?download`}
          download={item.name}
          aria-label="Download"
          title="Download"
          className={iconButton}
        >
          <DownloadIcon className="h-[18px] w-[18px]" />
        </a>
        <button
          type="button"
          aria-label={`More actions for ${item.name}`}
          title="More actions"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            openItemMenu(item, rect.left, rect.bottom);
          }}
          className={iconButton}
        >
          <MoreIcon className="h-[18px] w-[18px]" />
        </button>
        <button type="button" aria-label="Close preview" title="Close preview" onClick={onClose} className={iconButton}>
          <CloseIcon className="h-[18px] w-[18px]" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 overflow-hidden bg-white">
        <div className={`min-h-0 min-w-0 flex-1 ${commentsOpen ? "hidden lg:flex" : "flex"}`}>
          <PreviewBody item={item} />
        </div>
        {commentsOpen && (
          <aside className="flex min-h-0 w-full shrink-0 flex-col border-sand lg:w-80 lg:border-l">
            <FileComments key={item.id} fileId={item.id} />
          </aside>
        )}
      </div>
    </section>
  );
}
