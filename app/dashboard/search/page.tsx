import type { Metadata } from "next";
import { requireUser } from "@/app/lib/dal";
import { searchItems } from "@/app/lib/drive";
import { DriveBrowser } from "../ui/drive-browser";

export const metadata: Metadata = { title: "Search | Intellect Juris" };

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
    <DriveBrowser
      items={items}
      title={query ? `Search results for "${query}"` : "Search"}
      allowCreate={false}
      emptyTitle={query ? "No matching results" : "Search your Drive"}
      emptyHint={
        query
          ? "Try a different file or folder name."
          : "Type a file or folder name in the search bar above."
      }
    />
  );
}
