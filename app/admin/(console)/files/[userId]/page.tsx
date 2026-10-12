import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRightIcon, FolderIcon } from "@/app/dashboard/ui/icons";
import { requireAdmin } from "@/app/lib/dal";
import { listFolders, type FolderNode } from "@/app/lib/drive";
import { formatModified, formatSize } from "@/app/lib/file-kind";
import { getFileManagementRows } from "@/app/lib/file-management";
import { findUserById } from "@/app/lib/users";
import { FileManager, type ManagedFileRow } from "@/app/ui/file-manager";
import { UserAvatar } from "@/app/ui/user-avatar";

export const metadata: Metadata = { title: "File Management | Intellect Juris" };

type PageProps = {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ folder?: string | string[] }>;
};

function folderTotals(folders: FolderNode[], files: ManagedFileRow[]) {
  const children = new Map<string | null, FolderNode[]>();
  for (const folder of folders) {
    const siblings = children.get(folder.parentId) ?? [];
    siblings.push(folder);
    children.set(folder.parentId, siblings);
  }
  const directFiles = new Map<string | null, ManagedFileRow[]>();
  for (const file of files) {
    const list = directFiles.get(file.folderId) ?? [];
    list.push(file);
    directFiles.set(file.folderId, list);
  }

  const totals = new Map<string, { files: number; bytes: number }>();
  function walk(folderId: string, seen: Set<string>): { files: number; bytes: number } {
    const cached = totals.get(folderId);
    if (cached) return cached;
    if (seen.has(folderId)) return { files: 0, bytes: 0 };
    seen.add(folderId);
    const own = directFiles.get(folderId) ?? [];
    const total = {
      files: own.length,
      bytes: own.reduce((sum, file) => sum + (file.size ?? 0), 0),
    };
    for (const child of children.get(folderId) ?? []) {
      const sub = walk(child.id, seen);
      total.files += sub.files;
      total.bytes += sub.bytes;
    }
    totals.set(folderId, total);
    return total;
  }
  for (const folder of folders) walk(folder.id, new Set());

  return { children, directFiles, totals };
}

export default async function AdminUserFilesPage({ params, searchParams }: PageProps) {
  await requireAdmin();
  const { userId } = await params;
  const { folder } = await searchParams;
  const folderId = typeof folder === "string" && folder ? folder : null;

  const user = await findUserById(userId);
  if (!user) notFound();

  const [folders, files] = await Promise.all([listFolders(user.id), getFileManagementRows(user.id)]);
  const byId = new Map(folders.map((node) => [node.id, node]));
  if (folderId && !byId.has(folderId)) notFound();

  const trail: FolderNode[] = [];
  for (let current = folderId ? byId.get(folderId) : undefined; current && trail.length < 100; ) {
    trail.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }

  const { children, directFiles, totals } = folderTotals(folders, files);
  const subfolders = children.get(folderId) ?? [];
  const folderFiles = directFiles.get(folderId) ?? [];
  const totalBytes = files.reduce((sum, file) => sum + (file.size ?? 0), 0);
  const userHref = `/admin/files/${user.id}`;

  return (
    <div>
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm text-ink/60">
        <Link href="/admin/files" className="rounded px-1 transition hover:text-gold">
          File Management
        </Link>
        <ChevronRightIcon className="h-4 w-4 shrink-0" />
        {trail.length === 0 ? (
          <span className="px-1 text-ink">{user.name}</span>
        ) : (
          <Link href={userHref} className="rounded px-1 transition hover:text-gold">
            {user.name}
          </Link>
        )}
        {trail.map((node, index) => (
          <span key={node.id} className="flex items-center gap-1">
            <ChevronRightIcon className="h-4 w-4 shrink-0" />
            {index === trail.length - 1 ? (
              <span className="max-w-[16rem] truncate px-1 text-ink">{node.name}</span>
            ) : (
              <Link href={`${userHref}?folder=${node.id}`} className="max-w-[12rem] truncate rounded px-1 transition hover:text-gold">
                {node.name}
              </Link>
            )}
          </span>
        ))}
      </nav>

      <div className="mt-4 flex items-center gap-3">
        <UserAvatar name={user.name} size={44} />
        <div className="min-w-0">
          <h1 className="truncate text-[22px] font-normal">
            {trail.length > 0 ? trail[trail.length - 1].name : user.name}
          </h1>
          <p className="truncate text-sm text-ink/60">
            {trail.length > 0
              ? `${user.name} · ${folderFiles.length} ${folderFiles.length === 1 ? "file" : "files"} here`
              : `${user.email} · ${folders.length} ${folders.length === 1 ? "folder" : "folders"} · ${files.length} ${files.length === 1 ? "file" : "files"} · ${formatSize(totalBytes)}`}
          </p>
        </div>
      </div>

      <section className="mt-6">
        <h2 className="text-sm font-medium text-ink/70">
          {trail.length > 0 ? "Folders inside" : "Folders"}
        </h2>
        {subfolders.length === 0 ? (
          <p className="mt-2 text-sm text-ink/50">
            {trail.length > 0 ? "No folders inside this folder." : `${user.name} hasn't created any folders yet.`}
          </p>
        ) : (
          <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {subfolders.map((node) => {
              const total = totals.get(node.id) ?? { files: 0, bytes: 0 };
              const inner = children.get(node.id)?.length ?? 0;
              return (
                <li key={node.id}>
                  <Link
                    href={`${userHref}?folder=${node.id}`}
                    className="group flex items-center gap-3 rounded-xl border border-sand bg-white px-4 py-3 transition hover:-translate-y-0.5 hover:border-gold/60 hover:bg-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                  >
                    <FolderIcon className="h-8 w-8 shrink-0 text-gold" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink group-hover:text-gold">{node.name}</p>
                      <p className="truncate text-xs text-ink/55" suppressHydrationWarning>
                        {total.files} {total.files === 1 ? "file" : "files"}
                        {inner > 0 ? ` · ${inner} ${inner === 1 ? "folder" : "folders"}` : ""} · {formatSize(total.bytes)}
                        {" · "}
                        {formatModified(node.updatedAt)}
                      </p>
                    </div>
                    <ChevronRightIcon className="h-5 w-5 shrink-0 text-ink/30 transition group-hover:text-gold" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {(trail.length > 0 || folderFiles.length > 0) && (
        <section className="mt-8">
          <h2 className="text-sm font-medium text-ink/70">
            {trail.length > 0 ? "Files in this folder" : "Files outside any folder"}
          </h2>
          {folderFiles.length === 0 ? (
            <p className="mt-2 text-sm text-ink/50">No files in this folder.</p>
          ) : (
            <div className="mt-3">
              <FileManager files={folderFiles} />
            </div>
          )}
        </section>
      )}
    </div>
  );
}
