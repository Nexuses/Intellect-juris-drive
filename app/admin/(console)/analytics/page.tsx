import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/app/lib/dal";
import { getIndexSummary, isBackfillRunning } from "@/app/lib/doc-index";
import { getWorkspaceUsage, type KindCounts, type OwnerUsage } from "@/app/lib/drive";
import { formatSize } from "@/app/lib/file-kind";
import { listUsers } from "@/app/lib/users";
import { UserAvatar } from "@/app/ui/user-avatar";
import { ReadFilesButton } from "./read-files-button";

export const metadata: Metadata = { title: "Analytics | Intellect Juris" };

const EMPTY_USAGE: OwnerUsage = {
  files: 0,
  folders: 0,
  bytes: 0,
  kinds: {
    image: 0,
    pdf: 0,
    video: 0,
    audio: 0,
    sheet: 0,
    csv: 0,
    doc: 0,
    slides: 0,
    archive: 0,
    text: 0,
    code: 0,
    file: 0,
  },
};

function documents(kinds: KindCounts) {
  return kinds.doc + kinds.slides + kinds.text;
}

function sheets(kinds: KindCounts) {
  return kinds.sheet + kinds.csv;
}

function other(kinds: KindCounts) {
  return kinds.audio + kinds.archive + kinds.code + kinds.file;
}

const FILE_COLUMNS = [
  { label: "Images", value: (usage: OwnerUsage) => usage.kinds.image },
  { label: "PDFs", value: (usage: OwnerUsage) => usage.kinds.pdf },
  { label: "Documents", value: (usage: OwnerUsage) => documents(usage.kinds) },
  { label: "Sheets", value: (usage: OwnerUsage) => sheets(usage.kinds) },
  { label: "Videos", value: (usage: OwnerUsage) => usage.kinds.video },
  { label: "Other", value: (usage: OwnerUsage) => other(usage.kinds) },
];

function Count({ value }: { value: number }) {
  return <span className={value === 0 ? "text-ink/25" : "font-medium text-ink"}>{value}</span>;
}

export default async function AdminAnalyticsPage() {
  await requireAdmin();
  const [users, usage, reading] = await Promise.all([listUsers(), getWorkspaceUsage(), getIndexSummary()]);
  const { totals } = usage;
  const readingStats = [
    { label: "Ready to search", value: reading.ready },
    { label: "Waiting", value: reading.waiting },
    { label: "Could not read", value: reading.failed },
    { label: "Not supported", value: reading.unsupported },
  ];

  const rows = [...users]
    .map((user) => ({ user, usage: usage.byOwner.get(user.id) ?? EMPTY_USAGE }))
    .sort((a, b) => b.usage.files - a.usage.files || a.user.name.localeCompare(b.user.name));

  const totalsCards = [
    { label: "Files uploaded", value: String(totals.files) },
    { label: "Folders", value: String(totals.folders) },
    { label: "Storage used", value: formatSize(totals.bytes) },
    { label: "Accounts", value: String(users.length) },
  ];

  const typeStats = [
    { label: "Images", value: totals.kinds.image },
    { label: "PDFs", value: totals.kinds.pdf },
    { label: "Documents", value: documents(totals.kinds) },
    { label: "Sheets", value: sheets(totals.kinds) },
    { label: "Videos", value: totals.kinds.video },
    { label: "Other", value: other(totals.kinds) },
  ];

  return (
    <div>
      <h1 className="text-[22px] font-normal">Analytics</h1>
      <p className="mt-1 text-sm text-ink/60">Uploads across every account in the firm.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {totalsCards.map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-sand bg-white p-5 transition duration-200 hover:-translate-y-0.5 hover:border-gold/50 hover:shadow-[0_12px_28px_-18px_rgba(165,139,96,0.8)]"
          >
            <p className="text-sm text-ink/60">{stat.label}</p>
            <p className="mt-2 text-3xl font-normal text-ink">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {typeStats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl bg-sand px-4 py-3 text-ink transition duration-200 hover:bg-gold hover:text-cream"
          >
            <p className="text-xs font-medium uppercase tracking-wide opacity-80">{stat.label}</p>
            <p className="mt-1 text-2xl font-medium">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-2xl border border-sand">
        <div className="flex items-center justify-between gap-4 border-b border-sand px-5 py-4">
          <div>
            <h2 className="text-base font-medium">Jev document reading</h2>
            <p className="mt-0.5 text-xs text-ink/60">
              Jev reads each upload so people can search, summarize, compare, and ask about what
              files say. Video and old .doc, .xls, and .ppt files are not supported.
            </p>
          </div>
          <ReadFilesButton
            running={isBackfillRunning()}
            disabled={reading.waiting === 0 && reading.failed === 0}
          />
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
          {readingStats.map((stat) => (
            <div key={stat.label} className="rounded-xl bg-cream px-4 py-3">
              <p className="text-xs text-ink/60">{stat.label}</p>
              <p className="mt-1 text-2xl font-medium text-ink">{stat.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8 overflow-hidden rounded-2xl border border-sand">
        <div className="flex items-center justify-between border-b border-sand px-5 py-4">
          <div>
            <h2 className="text-base font-medium">Uploads by user</h2>
            <p className="mt-0.5 text-xs text-ink/60">
              Documents include Word, slides, and text files. Other covers audio, archives, and
              unrecognized files.
            </p>
          </div>
          <Link
            href="/admin/users"
            className="shrink-0 rounded-full px-3 py-1.5 text-sm font-medium text-gold transition hover:bg-sand"
          >
            Manage users
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-sand bg-cream text-ink/60">
              <tr>
                <th className="px-5 py-3 font-medium">User</th>
                <th className="px-3 py-3 font-medium">Files</th>
                <th className="px-3 py-3 font-medium">Folders</th>
                {FILE_COLUMNS.map((column) => (
                  <th key={column.label} className="px-3 py-3 font-medium">
                    {column.label}
                  </th>
                ))}
                <th className="px-5 py-3 font-medium">Storage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand">
              {rows.map(({ user, usage: row }) => (
                <tr key={user.id} className="transition hover:bg-sand/40">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <UserAvatar name={user.name} />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{user.name}</p>
                        <p className="truncate text-xs text-ink/60">
                          {user.email}
                          {user.role === "admin" ? " · Admin" : ""}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <Count value={row.files} />
                  </td>
                  <td className="px-3 py-3">
                    <Count value={row.folders} />
                  </td>
                  {FILE_COLUMNS.map((column) => (
                    <td key={column.label} className="px-3 py-3">
                      <Count value={column.value(row)} />
                    </td>
                  ))}
                  <td className="px-5 py-3 text-ink/70">{formatSize(row.bytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
