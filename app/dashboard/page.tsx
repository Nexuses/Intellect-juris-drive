import type { Metadata } from "next";
import { requireUser } from "@/app/lib/dal";
import { listChildren } from "@/app/lib/drive";
import { DriveBrowser } from "./ui/drive-browser";

export const metadata: Metadata = { title: "My Drive | Intellect Juris" };

export default async function MyDrivePage() {
  const user = await requireUser();
  const items = await listChildren(user.id, null);

  return (
    <DriveBrowser
      items={items}
      crumbs={[{ id: null, name: "My Drive" }]}
      emptyTitle="Drop files here"
      emptyHint="Files are kept inside folders. AI suggests a folder for each file, or create your own with New."
    />
  );
}
