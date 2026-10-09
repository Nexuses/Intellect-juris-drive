"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/app/lib/dal";
import { indexUnreadFiles } from "@/app/lib/doc-index";

export async function readAllFilesAction() {
  await requireAdmin();
  after(() => indexUnreadFiles({ retryFailed: true }));
  revalidatePath("/admin/analytics");
}
