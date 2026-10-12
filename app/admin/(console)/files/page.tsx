import type { Metadata } from "next";
import Link from "next/link";
import { CommentIcon, FilesIcon, FolderIcon } from "@/app/dashboard/ui/icons";
import { requireAdmin } from "@/app/lib/dal";
import { getWorkspaceUsage } from "@/app/lib/drive";
import { formatModified, formatSize } from "@/app/lib/file-kind";
import { getFileManagementRows } from "@/app/lib/file-management";
import { listUsers } from "@/app/lib/users";
import { UserAvatar } from "@/app/ui/user-avatar";

export const metadata: Metadata = { title: "File Management | Intellect Juris" };

export default async function AdminFileManagementPage() {
  await requireAdmin();
  const [users, usage, files] = await Promise.all([listUsers(), getWorkspaceUsage(), getFileManagementRows(null)]);

  const stats = new Map<string, { comments: number; lastUpload: string | null }>();
  for (const file of files) {
    const entry = stats.get(file.ownerId) ?? { comments: 0, lastUpload: null };
    entry.comments += file.comments;
    if (!entry.lastUpload || file.uploadedAt > entry.lastUpload) entry.lastUpload = file.uploadedAt;
    stats.set(file.ownerId, entry);
  }

  const cards = users
    .filter((user) => user.role === "user" || usage.byOwner.has(user.id))
    .map((user) => ({
      user,
      usage: usage.byOwner.get(user.id) ?? { files: 0, folders: 0, bytes: 0 },
      comments: stats.get(user.id)?.comments ?? 0,
      lastUpload: stats.get(user.id)?.lastUpload ?? null,
    }))
    .sort((a, b) => a.user.name.localeCompare(b.user.name));

  return (
    <div>
      <h1 className="text-[22px] font-normal">File Management</h1>
      <p className="mt-1 text-sm text-ink/60">
        Open a user to browse their folders and the files inside them.
      </p>

      {cards.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-sand px-6 py-16 text-center">
          <p className="text-lg text-ink">No users yet</p>
          <p className="mt-1 text-sm text-ink/60">Create users in User Management. Their files will appear here.</p>
        </div>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map(({ user, usage: owned, comments, lastUpload }) => (
            <li key={user.id}>
              <Link
                href={`/admin/files/${user.id}`}
                className="group flex h-full flex-col rounded-2xl border border-sand bg-white p-5 shadow-[0_1px_2px_rgba(41,45,48,0.05)] transition hover:-translate-y-0.5 hover:border-gold/60 hover:shadow-[0_16px_36px_-24px_rgba(165,139,96,0.7)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
              >
                <div className="flex items-center gap-3">
                  <UserAvatar name={user.name} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink group-hover:text-gold">{user.name}</p>
                    <p className="truncate text-xs text-ink/60">{user.email}</p>
                  </div>
                </div>

                <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-cream px-2 py-3">
                    <dt className="flex items-center justify-center gap-1 text-[11px] text-ink/55">
                      <FolderIcon className="h-3.5 w-3.5 text-gold" /> Folders
                    </dt>
                    <dd className="mt-1 text-lg font-semibold text-ink">{owned.folders}</dd>
                  </div>
                  <div className="rounded-xl bg-cream px-2 py-3">
                    <dt className="flex items-center justify-center gap-1 text-[11px] text-ink/55">
                      <FilesIcon className="h-3.5 w-3.5 text-gold" /> Files
                    </dt>
                    <dd className="mt-1 text-lg font-semibold text-ink">{owned.files}</dd>
                  </div>
                  <div className="rounded-xl bg-cream px-2 py-3">
                    <dt className="flex items-center justify-center gap-1 text-[11px] text-ink/55">
                      <CommentIcon className="h-3.5 w-3.5 text-gold" /> Comments
                    </dt>
                    <dd className="mt-1 text-lg font-semibold text-ink">{comments}</dd>
                  </div>
                </dl>

                <div className="mt-4 flex items-center justify-between gap-2 border-t border-sand pt-3 text-xs text-ink/55">
                  <span>{formatSize(owned.bytes)} used</span>
                  <span suppressHydrationWarning>
                    {lastUpload ? `Last upload ${formatModified(lastUpload)}` : "No uploads yet"}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
