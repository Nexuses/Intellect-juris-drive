import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUser } from "@/app/lib/dal";
import { searchDocuments } from "@/app/lib/doc-ai";
import { getDriveSnapshot, searchItems } from "@/app/lib/drive";
import { DriveBrowser } from "../ui/drive-browser";

export const metadata: Metadata = { title: "Search | Intellect Juris" };

function snippet(text: string, max = 240) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max).trimEnd()}...` : flat;
}

async function ContentMatches({ ownerId, query }: { ownerId: string; query: string }) {
  const { files } = await getDriveSnapshot(ownerId);
  const results = await searchDocuments({ ownerId, files }, query).catch(() => []);
  if (results.length === 0) return null;

  return (
    <section className="mb-2 border-b border-sand px-3 pb-5 pt-3">
      <h2 className="text-sm font-medium text-ink">Found inside documents</h2>
      <p className="mt-0.5 text-xs text-ink/60">Jev matched what these files say, not only their names.</p>
      <ul className="mt-3 flex flex-col gap-2">
        {results.map((result) => {
          const where = result.page ? `Page ${result.page}` : result.section;
          return (
            <li key={result.fileId}>
              <a
                href={`/api/files/${result.fileId}`}
                target="_blank"
                rel="noopener"
                className="block rounded-xl border border-sand bg-white px-4 py-3 transition hover:border-gold/60 hover:bg-cream"
              >
                <p className="truncate text-sm font-medium text-ink">{result.file.name}</p>
                <p className="mt-0.5 text-xs text-gold">
                  {[where, result.file.folder].filter(Boolean).join(" · ")}
                </p>
                <p className="mt-1.5 text-sm leading-6 text-ink/70">{snippet(result.text)}</p>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const user = await requireUser();
  const raw = (await searchParams).q;
  const query = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  const items = query ? await searchItems(user.id, query) : [];

  return (
    <div className="flex min-h-full flex-col">
      {query && (
        <Suspense
          key={query}
          fallback={<p className="px-3 pt-4 text-sm text-ink/50">Jev is searching inside your documents...</p>}
        >
          <ContentMatches ownerId={user.id} query={query} />
        </Suspense>
      )}
      <DriveBrowser
        items={items}
        title={query ? `Name matches for "${query}"` : "Search"}
        allowCreate={false}
        emptyTitle={query ? "No file or folder names match" : "Search your Drive"}
        emptyHint={
          query
            ? "Results found inside documents appear above."
            : "Type a file name, or describe what a document says, in the search bar above."
        }
      />
    </div>
  );
}
