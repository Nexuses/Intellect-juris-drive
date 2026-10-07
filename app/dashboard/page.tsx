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
      emptyHint='or use the "New" button to create folders and upload files'
    />
  );
}
