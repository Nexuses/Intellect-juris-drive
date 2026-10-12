"use client";

import { useState, type DragEvent, type KeyboardEvent, type MouseEvent } from "react";
import type { DriveItem } from "@/app/lib/drive";
import { Breadcrumbs, type BreadcrumbItem } from "./breadcrumbs";
import { useDrive } from "./drive-provider";
import { FilePreviewPane } from "./file-preview-pane";
import { fileKind, formatModified, formatSize, hasImagePreview } from "./file-kind";
import {
  ArrowDownIcon,
  CheckIcon,
  FileTypeIcon,
  FileUploadIcon,
  FolderIcon,
  GridIcon,
  ListIcon,
  MoreIcon,
} from "./icons";

type DriveBrowserProps = {
  items: DriveItem[];
  crumbs?: BreadcrumbItem[];
  title?: string;
  allowCreate?: boolean;
  emptyTitle: string;
  emptyHint?: string;
};

function ItemIcon({ item, className }: { item: DriveItem; className?: string }) {
  if (item.type === "folder") return <FolderIcon className={`${className} text-gold`} />;
  return <FileTypeIcon kind={fileKind(item.mimeType, item.name)} className={className} />;
}

function FilePreview({ item }: { item: DriveItem }) {
  if (hasImagePreview(item.mimeType)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- authenticated, user-uploaded content
      <img
        src={`/api/files/${item.id}`}
        alt=""
        loading="lazy"
        draggable={false}
        className="h-full w-full object-cover"
      />
    );
  }
  return <FileTypeIcon kind={fileKind(item.mimeType, item.name)} className="h-16 w-16" />;
}

export function DriveBrowser({
  items,
  crumbs,
  title,
  allowCreate = true,
  emptyTitle,
  emptyHint,
}: DriveBrowserProps) {
  const { view, setView, sort, toggleSort, openNewMenu, openItemMenu, openItem, uploadFiles } =
    useDrive();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const sorted = [...items].sort((a, b) => {
    const order = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    return sort === "asc" ? order : -order;
  });
  const folders = sorted.filter((item) => item.type === "folder");
  const files = sorted.filter((item) => item.type === "file");
  const previewItem = files.find((item) => item.id === previewId) ?? null;

  function showPreview(item: DriveItem) {
    setSelectedId(item.id);
    setPreviewId(item.id);
  }

  function stepPreview(offset: number) {
    if (!previewItem) return;
    const next = files[files.indexOf(previewItem) + offset];
    if (next) showPreview(next);
  }

  function itemHandlers(item: DriveItem) {
    return {
      role: "button" as const,
      tabIndex: 0,
      "aria-label": item.name,
      onClick: (event: MouseEvent) => {
        event.stopPropagation();
        if (item.type === "file") {
          showPreview(item);
          return;
        }
        setSelectedId(item.id);
        if (previewItem || (event.nativeEvent as PointerEvent).pointerType === "touch") openItem(item);
      },
      onDoubleClick: () => openItem(item),
      onKeyDown: (event: KeyboardEvent) => {
        if (event.key === "Enter") openItem(item);
        if (previewItem && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
          event.preventDefault();
          stepPreview(event.key === "ArrowDown" ? 1 : -1);
        }
      },
      onContextMenu: (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        setSelectedId(item.id);
        openItemMenu(item, event.clientX, event.clientY);
      },
    };
  }

  function moreButton(item: DriveItem) {
    return (
      <button
        type="button"
        aria-label={`More actions for ${item.name}`}
        onClick={(event) => {
          event.stopPropagation();
          setSelectedId(item.id);
          const rect = event.currentTarget.getBoundingClientRect();
          openItemMenu(item, rect.left, rect.bottom);
        }}
        onDoubleClick={(event) => event.stopPropagation()}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink/50 transition hover:bg-white/70 hover:text-ink"
      >
        <MoreIcon />
      </button>
    );
  }

  function handleDragOver(event: DragEvent) {
    if (!allowCreate || !event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    setDragging(true);
  }

  function handleDrop(event: DragEvent) {
    if (!allowCreate) return;
    event.preventDefault();
    setDragging(false);
    const dropped = Array.from(event.dataTransfer.items)
      .filter((entry) => entry.kind === "file" && !entry.webkitGetAsEntry()?.isDirectory)
      .map((entry) => entry.getAsFile())
      .filter((file): file is File => file !== null);
    if (dropped.length > 0) uploadFiles(dropped);
  }

  const cardBase = "cursor-default select-none rounded-xl outline-none transition duration-200 focus-visible:ring-2 focus-visible:ring-gold";
  const cardColor = (item: DriveItem) =>
    selectedId === item.id
      ? "bg-sand shadow-[inset_0_0_0_1px_rgba(165,139,96,0.45)]"
      : "bg-cream hover:-translate-y-0.5 hover:bg-sand hover:shadow-[0_10px_24px_-16px_rgba(41,45,48,0.45)]";

  const sortButton = (
    <button
      type="button"
      onClick={toggleSort}
      className="inline-flex items-center gap-2 rounded-full py-1 pl-3 pr-1 text-sm font-medium text-ink transition hover:bg-sand"
    >
      Name
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gold text-cream">
        <ArrowDownIcon className={`h-[18px] w-[18px] transition ${sort === "desc" ? "rotate-180" : ""}`} />
      </span>
    </button>
  );

  return (
    <div
      className={`flex flex-col rounded-2xl transition ${previewItem ? "h-full" : "min-h-full"} ${dragging ? "bg-sand/60 ring-2 ring-gold" : ""}`}
      onClick={() => setSelectedId(null)}
      onContextMenu={(event) => {
        if (!allowCreate) return;
        event.preventDefault();
        setSelectedId(null);
        openNewMenu(event.clientX, event.clientY);
      }}
      onDragOver={handleDragOver}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={handleDrop}
    >
      <div className="flex items-center justify-between gap-2 py-2 sm:gap-4">
        {crumbs ? (
          <Breadcrumbs crumbs={crumbs} />
        ) : (
          <h1 className="truncate px-1 text-xl text-ink sm:px-3 sm:text-2xl">{title}</h1>
        )}

        <div className="flex shrink-0 overflow-hidden rounded-full border border-sand">
          {(["list", "grid"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-label={mode === "list" ? "List layout" : "Grid layout"}
              aria-pressed={view === mode}
              onClick={(event) => {
                event.stopPropagation();
                setView(mode);
                setPreviewId(null);
              }}
              className={`inline-flex h-8 items-center gap-1 px-3 transition sm:px-4 ${
                view === mode ? "bg-sand text-ink" : "text-ink/60 hover:bg-cream hover:text-ink"
              } ${mode === "list" ? "border-r border-sand" : ""}`}
            >
              {view === mode && <CheckIcon className="h-[18px] w-[18px]" />}
              {mode === "list" ? <ListIcon className="h-[18px] w-[18px]" /> : <GridIcon className="h-[18px] w-[18px]" />}
            </button>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center py-20 text-center">
          <div className="mb-5 flex h-24 w-24 items-center justify-center rounded-full bg-sand text-gold">
            <FileUploadIcon className="h-12 w-12" />
          </div>
          <p className="px-4 text-xl text-ink sm:text-[22px]">{emptyTitle}</p>
          {emptyHint && <p className="mt-2 px-4 text-sm text-ink/60">{emptyHint}</p>}
        </div>
      ) : previewItem ? (
        <div className="grid min-h-0 flex-1 gap-4 pb-2 lg:grid-cols-[minmax(240px,320px)_minmax(0,1fr)]">
          <div className="hidden min-h-0 flex-col lg:flex">
            <div className="shrink-0 border-b border-sand px-1 py-2">{sortButton}</div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {[...folders, ...files].map((item) => (
                <div
                  key={item.id}
                  {...itemHandlers(item)}
                  className={`flex h-14 cursor-default select-none items-center gap-3 rounded-lg pl-3 pr-1 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold ${
                    previewItem.id === item.id ? "bg-sand" : "hover:bg-cream"
                  }`}
                >
                  <ItemIcon item={item} className="h-5 w-5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">{item.name}</p>
                    <p className="truncate text-xs text-ink/55" suppressHydrationWarning>
                      {formatModified(item.updatedAt)}
                      {item.type === "file" ? ` · ${formatSize(item.size)}` : ""}
                    </p>
                  </div>
                  {moreButton(item)}
                </div>
              ))}
            </div>
          </div>
          <FilePreviewPane item={previewItem} onClose={() => setPreviewId(null)} />
        </div>
      ) : view === "grid" ? (
        <div className="pb-6">
          <div className="px-1 py-3">{sortButton}</div>

          {folders.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] sm:gap-4">
              {folders.map((item) => (
                <div
                  key={item.id}
                  {...itemHandlers(item)}
                  className={`${cardBase} ${cardColor(item)} flex h-12 items-center gap-2 pl-3 pr-1 sm:gap-4 sm:pl-4 sm:pr-2`}
                >
                  <ItemIcon item={item} className="h-6 w-6 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                    {item.name}
                  </span>
                  {moreButton(item)}
                </div>
              ))}
            </div>
          )}

          {files.length > 0 && (
            <div
              className={`grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] sm:gap-4 ${folders.length > 0 ? "mt-6 sm:mt-10" : ""}`}
            >
              {files.map((item) => (
                <div
                  key={item.id}
                  {...itemHandlers(item)}
                  className={`${cardBase} ${cardColor(item)} flex flex-col px-2 pb-2`}
                >
                  <div className="flex h-12 items-center gap-2 pl-1 sm:gap-3 sm:pl-2">
                    <ItemIcon item={item} className="h-5 w-5 shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                      {item.name}
                    </span>
                    {moreButton(item)}
                  </div>
                  <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg bg-white">
                    <FilePreview item={item} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="pb-6">
          <div className="grid grid-cols-[minmax(0,1fr)_48px] items-center border-b border-sand text-sm font-medium text-ink sm:grid-cols-[minmax(0,1fr)_160px_120px_48px]">
            <div className="py-2">{sortButton}</div>
            <div className="hidden px-2 sm:block">Last modified</div>
            <div className="hidden px-2 sm:block">File size</div>
            <div />
          </div>
          {[...folders, ...files].map((item) => (
            <div
              key={item.id}
              {...itemHandlers(item)}
              className={`grid h-14 cursor-default select-none grid-cols-[minmax(0,1fr)_48px] items-center border-b border-sand text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold sm:h-12 sm:grid-cols-[minmax(0,1fr)_160px_120px_48px] ${
                selectedId === item.id ? "bg-sand" : "hover:bg-cream"
              }`}
            >
              <div className="flex min-w-0 items-center gap-3 pl-2 sm:gap-4 sm:pl-4">
                <ItemIcon item={item} className="h-5 w-5 shrink-0" />
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">{item.name}</p>
                  <p className="truncate text-xs text-ink/55 sm:hidden" suppressHydrationWarning>
                    {formatModified(item.updatedAt)}
                    {item.type === "file" ? ` · ${formatSize(item.size)}` : ""}
                  </p>
                </div>
              </div>
              <div className="hidden px-2 text-ink/60 sm:block" suppressHydrationWarning>
                {formatModified(item.updatedAt)}
              </div>
              <div className="hidden px-2 text-ink/60 sm:block">
                {item.type === "folder" ? "—" : formatSize(item.size)}
              </div>
              <div className="flex justify-center">{moreButton(item)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}