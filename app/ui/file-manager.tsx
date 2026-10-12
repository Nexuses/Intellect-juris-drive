"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { deleteManagedFilesAction, renameManagedFileAction } from "@/app/actions/files";
import {
  DownloadIcon,
  FileTypeIcon,
  LinkIcon,
  OpenIcon,
  RenameIcon,
  SearchIcon,
  TrashIcon,
} from "@/app/dashboard/ui/icons";
import type { ManagedFile } from "@/app/lib/drive";
import { formatModified, formatSize, type FileKind } from "@/app/lib/file-kind";
import { Modal } from "./modal";

export type ReadingStatus = "ready" | "failed" | "unsupported" | "waiting";
export type ManagedFileRow = ManagedFile & { ownerName?: string; reading: ReadingStatus };

type SortOrder = "newest" | "oldest" | "name" | "largest";
type Dialog = { kind: "rename"; file: ManagedFileRow } | { kind: "delete"; files: ManagedFileRow[] } | null;

const PAGE_SIZE = 50;

const TYPE_FILTERS: { id: string; label: string; kinds: FileKind[] }[] = [
  { id: "all", label: "All types", kinds: [] },
  { id: "image", label: "Images", kinds: ["image"] },
  { id: "pdf", label: "PDFs", kinds: ["pdf"] },
  { id: "doc", label: "Documents", kinds: ["doc", "slides", "text"] },
  { id: "sheet", label: "Sheets", kinds: ["sheet", "csv"] },
  { id: "video", label: "Videos", kinds: ["video"] },
  { id: "audio", label: "Audio", kinds: ["audio"] },
  { id: "archive", label: "Archives", kinds: ["archive"] },
  { id: "other", label: "Other", kinds: ["code", "file"] },
];

const READING: Record<ReadingStatus, { label: string; className: string }> = {
  ready: { label: "Searchable", className: "bg-[#e7efe4] text-[#3d5a34]" },
  waiting: { label: "Reading", className: "bg-sand text-ink/70" },
  failed: { label: "Couldn't read", className: "bg-[#f6ebe7] text-[#8c3a32]" },
  unsupported: { label: "Not supported", className: "bg-cream text-ink/50" },
};

const selectClass =
  "h-10 rounded-full border border-sand bg-white px-3 text-base text-ink outline-none transition hover:border-gold/70 focus:border-gold sm:text-sm";

function IconButton({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition ${
        danger ? "text-ink/50 hover:bg-[#f6ebe7] hover:text-[#8c3a32]" : "text-ink/50 hover:bg-sand hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

export function FileManager({
  files,
  owners,
  linkFolders = false,
}: {
  files: ManagedFileRow[];
  /** Set for admins: shows the Owner column and filter. */
  owners?: { id: string; name: string }[];
  /** Link each folder path to the user's drive folder. */
  linkFolders?: boolean;
}) {
  const router = useRouter();
  const showOwner = Boolean(owners);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [sort, setSort] = useState<SortOrder>("newest");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState<string>();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const kinds = TYPE_FILTERS.find((filter) => filter.id === typeFilter)?.kinds ?? [];
    const rows = files.filter(
      (file) =>
        (kinds.length === 0 || kinds.includes(file.kind)) &&
        (ownerFilter === "all" || file.ownerId === ownerFilter) &&
        (!q ||
          file.name.toLowerCase().includes(q) ||
          file.folder.toLowerCase().includes(q) ||
          file.ownerName?.toLowerCase().includes(q)),
    );
    return rows.sort((a, b) => {
      if (sort === "oldest") return a.uploadedAt.localeCompare(b.uploadedAt);
      if (sort === "name") return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
      if (sort === "largest") return (b.size ?? 0) - (a.size ?? 0);
      return b.uploadedAt.localeCompare(a.uploadedAt);
    });
  }, [files, query, typeFilter, ownerFilter, sort]);

  const shown = filtered.slice(0, visible);
  const selectedFiles = files.filter((file) => selected.has(file.id));
  const allShownSelected = shown.length > 0 && shown.every((file) => selected.has(file.id));
  const totalBytes = filtered.reduce((sum, file) => sum + (file.size ?? 0), 0);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllShown() {
    setSelected((current) => {
      const next = new Set(current);
      for (const file of shown) {
        if (allShownSelected) next.delete(file.id);
        else next.add(file.id);
      }
      return next;
    });
  }

  function flash(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => (current === message ? undefined : current)), 3000);
  }

  async function copyLink(file: ManagedFileRow) {
    if (!file.s3Url) {
      flash("This file has no S3 link yet.");
      return;
    }
    try {
      await navigator.clipboard.writeText(file.s3Url);
      flash("S3 link copied.");
    } catch {
      window.prompt("Copy this S3 link:", file.s3Url);
    }
  }

  function download(file: ManagedFileRow) {
    const link = document.createElement("a");
    link.href = `/api/files/${file.id}?download`;
    link.download = file.name;
    link.click();
  }

  function folderCell(file: ManagedFileRow) {
    if (!linkFolders) return <span className="truncate">{file.folder}</span>;
    return (
      <Link
        href={file.folderId ? `/dashboard/folders/${file.folderId}` : "/dashboard"}
        className="truncate hover:text-gold hover:underline"
      >
        {file.folder}
      </Link>
    );
  }

  function actions(file: ManagedFileRow) {
    return (
      <>
        <IconButton label="Open" onClick={() => window.open(`/api/files/${file.id}`, "_blank", "noopener")}>
          <OpenIcon className="h-[18px] w-[18px]" />
        </IconButton>
        <IconButton label="Download" onClick={() => download(file)}>
          <DownloadIcon className="h-[18px] w-[18px]" />
        </IconButton>
        <IconButton label="Copy S3 link" onClick={() => void copyLink(file)}>
          <LinkIcon className="h-[18px] w-[18px]" />
        </IconButton>
        <IconButton label="Rename" onClick={() => setDialog({ kind: "rename", file })}>
          <RenameIcon className="h-[18px] w-[18px]" />
        </IconButton>
        <IconButton label="Delete" danger onClick={() => setDialog({ kind: "delete", files: [file] })}>
          <TrashIcon className="h-[18px] w-[18px]" />
        </IconButton>
      </>
    );
  }

  function readingBadge(file: ManagedFileRow) {
    const { label, className } = READING[file.reading];
    return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>{label}</span>;
  }

  return (
    <div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full border border-sand bg-white px-3 transition focus-within:border-gold hover:border-gold/70">
          <SearchIcon className="h-5 w-5 shrink-0 text-ink/45" />
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setVisible(PAGE_SIZE);
            }}
            placeholder={showOwner ? "Search by file, folder, or owner" : "Search by file or folder name"}
            aria-label="Search files"
            className="h-full min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink/40 sm:text-sm"
          />
        </label>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {owners && (
            <select
              value={ownerFilter}
              onChange={(event) => {
                setOwnerFilter(event.target.value);
                setVisible(PAGE_SIZE);
              }}
              aria-label="Filter by owner"
              className={`${selectClass} col-span-2 sm:col-span-1`}
            >
              <option value="all">All users</option>
              {owners.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {owner.name}
                </option>
              ))}
            </select>
          )}
          <select
            value={typeFilter}
            onChange={(event) => {
              setTypeFilter(event.target.value);
              setVisible(PAGE_SIZE);
            }}
            aria-label="Filter by type"
            className={selectClass}
          >
            {TYPE_FILTERS.map((filter) => (
              <option key={filter.id} value={filter.id}>
                {filter.label}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortOrder)}
            aria-label="Sort files"
            className={selectClass}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="name">Name A–Z</option>
            <option value="largest">Largest first</option>
          </select>
        </div>
      </div>

      <div className="mt-4 flex min-h-10 flex-wrap items-center justify-between gap-2">
        {selected.size > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-ink">{selected.size} selected</span>
            <button
              type="button"
              onClick={() => setDialog({ kind: "delete", files: selectedFiles })}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-[#8c3a32] px-4 text-sm font-medium text-white transition hover:bg-[#6e2c26]"
            >
              <TrashIcon className="h-4 w-4" />
              Delete selected
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="h-9 rounded-full px-3 text-sm font-medium text-ink/70 transition hover:bg-sand"
            >
              Clear
            </button>
          </div>
        ) : (
          <p className="text-sm text-ink/60">
            {filtered.length === files.length
              ? `${files.length} ${files.length === 1 ? "file" : "files"}`
              : `${filtered.length} of ${files.length} files`}{" "}
            · {formatSize(totalBytes)}
          </p>
        )}
        {notice && (
          <p role="status" className="rounded-full bg-ink px-3 py-1 text-xs text-cream">
            {notice}
          </p>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-sand px-6 py-16 text-center">
          <p className="text-lg text-ink">{files.length === 0 ? "No files uploaded yet" : "No files match"}</p>
          <p className="mt-1 text-sm text-ink/60">
            {files.length === 0 ? "Uploaded files will appear here." : "Try a different search or filter."}
          </p>
        </div>
      ) : (
        <>
          <ul className="mt-3 flex flex-col gap-2 md:hidden">
            {shown.map((file) => (
              <li
                key={file.id}
                className={`rounded-2xl border px-3 py-3 transition ${
                  selected.has(file.id) ? "border-gold/60 bg-sand/50" : "border-sand bg-white"
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selected.has(file.id)}
                    onChange={() => toggle(file.id)}
                    aria-label={`Select ${file.name}`}
                    className="mt-1 h-4 w-4 shrink-0 accent-[#a58b60]"
                  />
                  <FileTypeIcon kind={file.kind} className="h-6 w-6 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{file.name}</p>
                    <p className="mt-0.5 flex min-w-0 text-xs text-ink/60">{folderCell(file)}</p>
                    <p className="mt-0.5 text-xs text-ink/55" suppressHydrationWarning>
                      {showOwner && file.ownerName ? `${file.ownerName} · ` : ""}
                      {formatSize(file.size)} · {formatModified(file.uploadedAt)}
                    </p>
                    <div className="mt-2">{readingBadge(file)}</div>
                  </div>
                </div>
                <div className="mt-2 flex justify-end gap-1 border-t border-sand pt-2">{actions(file)}</div>
              </li>
            ))}
          </ul>

          <div className="mt-3 hidden overflow-hidden rounded-2xl border border-sand md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="border-b border-sand bg-cream text-ink/60">
                  <tr>
                    <th className="w-10 py-3 pl-4">
                      <input
                        type="checkbox"
                        checked={allShownSelected}
                        onChange={toggleAllShown}
                        aria-label="Select all shown files"
                        className="h-4 w-4 accent-[#a58b60]"
                      />
                    </th>
                    <th className="px-3 py-3 font-medium">Name</th>
                    {showOwner && <th className="px-3 py-3 font-medium">Owner</th>}
                    <th className="px-3 py-3 font-medium">Size</th>
                    <th className="px-3 py-3 font-medium">Uploaded</th>
                    <th className="px-3 py-3 font-medium">Jev</th>
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sand">
                  {shown.map((file) => (
                    <tr
                      key={file.id}
                      className={`transition ${selected.has(file.id) ? "bg-sand/50" : "hover:bg-sand/30"}`}
                    >
                      <td className="py-3 pl-4">
                        <input
                          type="checkbox"
                          checked={selected.has(file.id)}
                          onChange={() => toggle(file.id)}
                          aria-label={`Select ${file.name}`}
                          className="h-4 w-4 accent-[#a58b60]"
                        />
                      </td>
                      <td className="max-w-0 px-3 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <FileTypeIcon kind={file.kind} className="h-6 w-6 shrink-0" />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-ink" title={file.name}>
                              {file.name}
                            </p>
                            <p className="flex min-w-0 text-xs text-ink/55">{folderCell(file)}</p>
                          </div>
                        </div>
                      </td>
                      {showOwner && <td className="whitespace-nowrap px-3 py-3 text-ink/80">{file.ownerName ?? "—"}</td>}
                      <td className="whitespace-nowrap px-3 py-3 text-ink/70">{formatSize(file.size)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-ink/70" suppressHydrationWarning>
                        {formatModified(file.uploadedAt)}
                      </td>
                      <td className="px-3 py-3">{readingBadge(file)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-0.5">{actions(file)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {filtered.length > visible && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => setVisible((count) => count + PAGE_SIZE)}
                className="h-10 rounded-full border border-sand px-5 text-sm font-medium text-ink transition hover:border-gold hover:bg-sand"
              >
                Show more ({filtered.length - visible} left)
              </button>
            </div>
          )}
        </>
      )}

      {dialog?.kind === "rename" && (
        <RenameDialog
          file={dialog.file}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            flash("File renamed.");
            router.refresh();
          }}
        />
      )}
      {dialog?.kind === "delete" && (
        <DeleteDialog
          files={dialog.files}
          showOwner={showOwner}
          onClose={() => setDialog(null)}
          onDone={(message) => {
            const removed = new Set(dialog.files.map((file) => file.id));
            setSelected((current) => new Set([...current].filter((id) => !removed.has(id))));
            setDialog(null);
            flash(message);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function RenameDialog({
  file,
  onClose,
  onDone,
}: {
  file: ManagedFileRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name") ?? "").trim();
    if (!name) {
      setError("Enter a name.");
      return;
    }
    startTransition(async () => {
      const result = await renameManagedFileAction(file.id, name);
      if (result.error) setError(result.error);
      else onDone();
    });
  }

  return (
    <Modal title="Rename file" onClose={onClose}>
      <form onSubmit={submit}>
        <input
          name="name"
          defaultValue={file.name}
          autoFocus
          onFocus={(event) => {
            const dot = file.name.lastIndexOf(".");
            event.currentTarget.setSelectionRange(0, dot > 0 ? dot : file.name.length);
          }}
          aria-label="File name"
          className="h-12 w-full rounded-lg border border-sand px-4 text-base text-ink outline-none transition hover:border-gold/70 focus:border-gold sm:text-[15px]"
        />
        {error && <p className="mt-2 text-xs text-[#8c3a32]">{error}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-full px-4 text-sm font-medium text-gold transition hover:bg-gold/10"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="h-10 rounded-full bg-ink px-5 text-sm font-medium text-cream transition hover:bg-gold disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Saving..." : "Rename"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteDialog({
  files,
  showOwner,
  onClose,
  onDone,
}: {
  files: ManagedFileRow[];
  showOwner: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const label = files.length === 1 ? `"${files[0].name}"` : `${files.length} files`;

  function confirm() {
    startTransition(async () => {
      const result = await deleteManagedFilesAction(files.map((file) => file.id));
      if (result.error && !result.deleted) {
        setError(result.error);
        return;
      }
      const count = result.deleted ?? 0;
      onDone(result.error ?? `Deleted ${count} ${count === 1 ? "file" : "files"}.`);
    });
  }

  return (
    <Modal title={files.length === 1 ? "Delete file?" : `Delete ${files.length} files?`} onClose={onClose}>
      <p className="text-sm text-ink/70">
        {label} will be deleted from the drive and from S3. Its S3 link will stop working. This can&apos;t be undone.
      </p>
      {files.length > 1 && (
        <ul className="mt-3 max-h-40 overflow-y-auto rounded-lg bg-cream px-3 py-2 text-xs text-ink/70">
          {files.slice(0, 50).map((file) => (
            <li key={file.id} className="truncate py-0.5">
              {file.name}
              {showOwner && file.ownerName ? ` (${file.ownerName})` : ""}
            </li>
          ))}
          {files.length > 50 && <li className="py-0.5">and {files.length - 50} more</li>}
        </ul>
      )}
      {error && <p className="mt-2 text-xs text-[#8c3a32]">{error}</p>}
      <div className="mt-6 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="h-10 rounded-full px-4 text-sm font-medium text-gold transition hover:bg-gold/10"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={pending}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-[#8c3a32] px-5 text-sm font-medium text-white transition hover:bg-[#6e2c26] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Deleting..." : "Delete"}
        </button>
      </div>
    </Modal>
  );
}
