import type { Metadata } from "next";
import { requireAdmin } from "@/app/lib/dal";
import { getFileManagementRows } from "@/app/lib/file-management";
import { listUsers } from "@/app/lib/users";
import { FileManager } from "@/app/ui/file-manager";

export const metadata: Metadata = { title: "File Management | Intellect Juris" };

export default async function AdminFileManagementPage() {
  await requireAdmin();
  const users = await listUsers();
  const ownerNames = new Map(users.map((user) => [user.id, user.name]));
  const files = await getFileManagementRows(null, ownerNames);
  const owners = users
    .map((user) => ({ id: user.id, name: user.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <h1 className="text-[22px] font-normal">File Management</h1>
      <p className="mt-1 text-sm text-ink/60">
        Every file uploaded by every user. Filter by user or type, open files, copy S3 links, rename, or delete.
      </p>
      <div className="mt-6">
        <FileManager files={files} owners={owners} />
      </div>
    </div>
  );
}
