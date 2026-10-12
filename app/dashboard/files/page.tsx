import type { Metadata } from "next";
import { requireUser } from "@/app/lib/dal";
import { getFileManagementRows } from "@/app/lib/file-management";
import { FileManager } from "@/app/ui/file-manager";
import { OrganizeButton } from "../ui/organize-button";

export const metadata: Metadata = { title: "File Management | Intellect Juris" };

export default async function UserFileManagementPage() {
  const user = await requireUser();
  const files = await getFileManagementRows(user.id);

  return (
    <div className="px-1 py-4 sm:px-2">
      <h1 className="text-[22px] font-normal">File Management</h1>
      <p className="mt-1 text-sm text-ink/60">
        Every file in your drive, across all folders. Search, open, rename, copy links, or delete files.
      </p>
      <div className="mt-6">
        <OrganizeButton looseCount={files.filter((file) => !file.folderId).length} />
      </div>
      <div className="mt-4">
        <FileManager files={files} linkFolders />
      </div>
    </div>
  );
}
