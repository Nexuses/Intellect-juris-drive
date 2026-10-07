import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/app/lib/dal";
import { getBreadcrumbs, getFolder, listChildren } from "@/app/lib/drive";
import { DriveBrowser } from "../../ui/drive-browser";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const user = await requireUser();
  const folder = await getFolder(user.id, (await params).id);
  return { title: `${folder?.name ?? "Folder"} | Intellect Juris` };
}

export default async function FolderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const folder = await getFolder(user.id, id);
  if (!folder) notFound();

  const [crumbs, items] = await Promise.all([
    getBreadcrumbs(user.id, id),
    listChildren(user.id, id),
  ]);

  return (
    <DriveBrowser
      items={items}
      crumbs={[{ id: null, name: "My Drive" }, ...crumbs]}
      emptyTitle="Drop files here"
      emptyHint='or use the "New" button'
    />
  );
}
