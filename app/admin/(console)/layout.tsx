import type { ReactNode } from "react";
import { requireAdmin } from "@/app/lib/dal";
import { AdminSidebar } from "./sidebar";

export default async function AdminConsoleLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdmin();

  return (
    <div className="flex flex-1 bg-cream text-ink">
      <AdminSidebar name={admin.name} email={admin.email} />
      <div className="min-w-0 flex-1 py-4 pr-4">
        <main className="min-h-full rounded-2xl bg-white px-8 py-7 shadow-[0_1px_2px_rgba(41,45,48,0.04)]">{children}</main>
      </div>
    </div>
  );
}
