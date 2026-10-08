import type { Metadata } from "next";
import { requireUser } from "@/app/lib/dal";
import { getOwnerUsage, type KindCounts } from "@/app/lib/drive";
import { formatSize } from "@/app/lib/file-kind";

export const metadata: Metadata = { title: "Analytics | Intellect Juris" };

function documents(kinds: KindCounts) {
  return kinds.doc + kinds.slides + kinds.text;
}

function sheets(kinds: KindCounts) {
  return kinds.sheet + kinds.csv;
}

function other(kinds: KindCounts) {
  return kinds.audio + kinds.archive + kinds.code + kinds.file;
}

export default async function UserAnalyticsPage() {
  const user = await requireUser();
  const mine = await getOwnerUsage(user.id);

  const totals = [
    { label: "Files", value: String(mine.files) },
    { label: "Folders", value: String(mine.folders) },
    { label: "Storage used", value: formatSize(mine.bytes) },
  ];

  const typeStats = [
    { label: "Images", value: mine.kinds.image },
    { label: "PDFs", value: mine.kinds.pdf },
    { label: "Documents", value: documents(mine.kinds) },
    { label: "Sheets", value: sheets(mine.kinds) },
    { label: "Videos", value: mine.kinds.video },
    { label: "Other", value: other(mine.kinds) },
  ];

  return (
    <div className="px-2 py-4">
      <h1 className="text-[22px] font-normal">Analytics</h1>
      <p className="mt-1 text-sm text-ink/60">Uploads in your drive only.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {totals.map((stat) => (
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
    </div>
  );
}
