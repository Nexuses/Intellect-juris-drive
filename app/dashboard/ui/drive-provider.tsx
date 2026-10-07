"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  createFolderAction,
  createFolderTreeAction,
  deleteItemAction,
  renameItemAction,
} from "@/app/actions/drive";
import type { DriveItem } from "@/app/lib/drive";
import { ContextMenu, type MenuEntry } from "./context-menu";
import { DeleteDialog, LinkDialog, NameDialog } from "./drive-dialogs";
import { fileKind } from "./file-kind";
import {
  CheckIcon,
  CloseIcon,
  DownloadIcon,
  ErrorIcon,
  LinkIcon,
  FileTypeIcon,
  FileUploadIcon,
  FolderUploadIcon,
  NewFolderIcon,
  OpenIcon,
  RenameIcon,
  TrashIcon,
} from "./icons";

export type ViewMode = "grid" | "list";
export type SortOrder = "asc" | "desc";

type MenuState =
  | { kind: "new"; x: number; y: number }
  | { kind: "item"; x: number; y: number; item: DriveItem }
  | null;

type DialogState =
  | { kind: "new-folder" }
  | { kind: "rename"; item: DriveItem }
  | { kind: "delete"; item: DriveItem }
  | { kind: "link"; item: DriveItem }
  | null;

type UploadStatus = "queued" | "uploading" | "done" | "error";
type UploadEntry = { id: number; name: string; status: UploadStatus; error?: string };
type UploadJob = { file: File; parentId: string | null };

type DriveApi = {
  view: ViewMode;
  setView: (view: ViewMode) => void;
  sort: SortOrder;
  toggleSort: () => void;
  openNewMenu: (x: number, y: number) => void;
  openItemMenu: (item: DriveItem, x: number, y: number) => void;
  openItem: (item: DriveItem) => void;
  uploadFiles: (files: File[]) => void;
};

const DriveContext = createContext<DriveApi | null>(null);

export function useDrive() {
  const api = useContext(DriveContext);
  if (!api) throw new Error("useDrive must be used inside <DriveProvider>");
  return api;
}

function folderIdFromPath(pathname: string) {
  return pathname.match(/^\/dashboard\/folders\/([^/]+)/)?.[1] ?? null;
}

export function DriveProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const currentFolderId = folderIdFromPath(pathname);

  const [view, setView] = useState<ViewMode>("grid");
  const [sort, setSort] = useState<SortOrder>("asc");
  const [menu, setMenu] = useState<MenuState>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [uploads, setUploads] = useState<UploadEntry[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const nextUploadId = useRef(0);

  useEffect(() => {
    folderInputRef.current?.setAttribute("webkitdirectory", "");
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  const closeMenu = useCallback(() => setMenu(null), []);
  const closeDialog = useCallback(() => setDialog(null), []);

  const updateUpload = (id: number, patch: Partial<UploadEntry>) =>
    setUploads((list) => list.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));

  async function runUploads(jobs: UploadJob[]) {
    if (jobs.length === 0) return;
    const queued = jobs.map((job) => ({
      id: nextUploadId.current++,
      name: job.file.name,
      status: "queued" as const,
    }));
    setUploads((list) => [...list.filter((entry) => entry.status !== "done"), ...queued]);

    for (const [index, job] of jobs.entries()) {
      const { id } = queued[index];
      updateUpload(id, { status: "uploading" });
      const body = new FormData();
      body.set("file", job.file, job.file.name);
      if (job.parentId) body.set("parentId", job.parentId);

      try {
        const response = await fetch("/api/files", { method: "POST", body });
        if (!response.ok) {
          const data = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? "Upload failed.");
        }
        updateUpload(id, { status: "done" });
      } catch (error) {
        updateUpload(id, {
          status: "error",
          error: error instanceof Error ? error.message : "Upload failed.",
        });
      }
    }
    router.refresh();
  }

  function uploadFiles(files: File[]) {
    const parentId = currentFolderId;
    void runUploads(files.map((file) => ({ file, parentId })));
  }

  async function uploadFolder(files: File[]) {
    if (files.length === 0) return;
    const parentId = currentFolderId;
    const directories = new Set<string>();
    for (const file of files) {
      const segments = file.webkitRelativePath.split("/").slice(0, -1);
      segments.forEach((_, i) => directories.add(segments.slice(0, i + 1).join("/")));
    }

    const result = await createFolderTreeAction(parentId, [...directories]);
    if (result.error || !result.folders) {
      setNotice(result.error ?? "Couldn't upload the folder.");
      return;
    }
    const folders = result.folders;
    void runUploads(
      files.map((file) => {
        const dir = file.webkitRelativePath.split("/").slice(0, -1).join("/");
        return { file, parentId: folders[dir] ?? parentId };
      }),
    );
  }

  function openItem(item: DriveItem) {
    if (item.type === "folder") router.push(`/dashboard/folders/${item.id}`);
    else window.open(`/api/files/${item.id}`, "_blank", "noopener");
  }

  function downloadItem(item: DriveItem) {
    const link = document.createElement("a");
    link.href = `/api/files/${item.id}?download`;
    link.download = item.name;
    link.click();
  }

  const newEntries: MenuEntry[] = [
    {
      label: "New folder",
      icon: <NewFolderIcon />,
      onSelect: () => setDialog({ kind: "new-folder" }),
    },
    "divider",
    { label: "File upload", icon: <FileUploadIcon />, onSelect: () => fileInputRef.current?.click() },
    {
      label: "Folder upload",
      icon: <FolderUploadIcon />,
      onSelect: () => folderInputRef.current?.click(),
    },
  ];

  function itemEntries(item: DriveItem): MenuEntry[] {
    return [
      { label: "Open", icon: <OpenIcon />, onSelect: () => openItem(item) },
      ...(item.type === "file"
        ? [
            { label: "Download", icon: <DownloadIcon />, onSelect: () => downloadItem(item) },
            {
              label: "Get S3 link",
              icon: <LinkIcon />,
              onSelect: () => setDialog({ kind: "link", item }),
            },
          ]
        : []),
      { label: "Rename", icon: <RenameIcon />, onSelect: () => setDialog({ kind: "rename", item }) },
      "divider",
      {
        label: "Delete",
        icon: <TrashIcon />,
        danger: true,
        onSelect: () => setDialog({ kind: "delete", item }),
      },
    ];
  }

  const api: DriveApi = {
    view,
    setView,
    sort,
    toggleSort: () => setSort((order) => (order === "asc" ? "desc" : "asc")),
    openNewMenu: (x, y) => setMenu({ kind: "new", x, y }),
    openItemMenu: (item, x, y) => setMenu({ kind: "item", x, y, item }),
    openItem,
    uploadFiles,
  };

  const finished = uploads.filter((entry) => entry.status === "done").length;
  const failed = uploads.filter((entry) => entry.status === "error").length;
  const active = uploads.length - finished - failed;

  return (
    <DriveContext.Provider value={api}>
      {children}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          uploadFiles(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          void uploadFolder(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />

      {menu && (
        <ContextMenu
          key={`${menu.x}-${menu.y}`}
          x={menu.x}
          y={menu.y}
          entries={menu.kind === "new" ? newEntries : itemEntries(menu.item)}
          onClose={closeMenu}
        />
      )}

      {dialog?.kind === "new-folder" && (
        <NameDialog
          title="New folder"
          initialName="Untitled folder"
          submitLabel="Create"
          onClose={closeDialog}
          onSubmit={async (name) => (await createFolderAction(currentFolderId, name)).error}
        />
      )}
      {dialog?.kind === "rename" && (
        <NameDialog
          title="Rename"
          initialName={dialog.item.name}
          submitLabel="OK"
          selectBaseName={dialog.item.type === "file"}
          onClose={closeDialog}
          onSubmit={async (name) => (await renameItemAction(dialog.item.id, name)).error}
        />
      )}
      {dialog?.kind === "link" && <LinkDialog item={dialog.item} onClose={closeDialog} />}
      {dialog?.kind === "delete" && (
        <DeleteDialog
          item={dialog.item}
          onClose={closeDialog}
          onConfirm={async () => {
            const { error } = await deleteItemAction(dialog.item.id);
            if (!error) setNotice(`"${dialog.item.name}" was deleted.`);
            return error;
          }}
        />
      )}

      {uploads.length > 0 && (
        <div className="fixed bottom-4 right-4 z-40 w-[360px] overflow-hidden rounded-2xl bg-white shadow-[0_4px_8px_3px_rgba(60,64,67,0.15),0_1px_3px_rgba(60,64,67,0.3)]">
          <div className="flex items-center justify-between bg-sand py-3 pl-5 pr-2">
            <p className="text-sm font-medium text-ink">
              {active > 0
                ? `Uploading ${active} item${active === 1 ? "" : "s"}`
                : `${finished} upload${finished === 1 ? "" : "s"} complete${failed ? `, ${failed} failed` : ""}`}
            </p>
            <button
              type="button"
              onClick={() => setUploads([])}
              disabled={active > 0}
              aria-label="Close uploads"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink/60 transition hover:bg-white/60 hover:text-ink disabled:opacity-30"
            >
              <CloseIcon />
            </button>
          </div>
          <ul className="max-h-64 overflow-y-auto py-1">
            {uploads.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 px-5 py-2.5">
                <FileTypeIcon kind={fileKind(null, entry.name)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">{entry.name}</p>
                  {entry.error && <p className="truncate text-xs text-[#8c3a32]">{entry.error}</p>}
                </div>
                {entry.status === "done" && <CheckIcon className="h-5 w-5 text-gold" />}
                {entry.status === "error" && <ErrorIcon className="h-5 w-5 text-[#8c3a32]" />}
                {(entry.status === "uploading" || entry.status === "queued") && (
                  <span
                    className={`h-5 w-5 rounded-full border-2 border-sand border-t-gold ${
                      entry.status === "uploading" ? "animate-spin" : "opacity-40"
                    }`}
                  />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="fixed bottom-4 left-4 z-40 rounded-lg bg-ink px-4 py-3 text-sm text-cream shadow-lg"
        >
          {notice}
        </div>
      )}
    </DriveContext.Provider>
  );
}
