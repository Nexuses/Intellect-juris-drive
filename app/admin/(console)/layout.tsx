import type { ReactNode } from "react";
import { requireAdmin } from "@/app/lib/dal";
import { ChatWidget } from "@/app/ui/chat-widget";
import { AdminSidebar } from "./sidebar";

export default async function AdminConsoleLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdmin();

  return (
    <div className="flex h-screen max-h-screen min-h-0 flex-1 overflow-hidden bg-cream text-ink">
      <AdminSidebar name={admin.name} email={admin.email} />
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto py-4 pr-4">
        <main className="min-h-full rounded-2xl bg-white px-8 py-7 shadow-[0_1px_2px_rgba(41,45,48,0.04)]">{children}</main>
      </div>
      <ChatWidget hint="Ask for a user's uploaded files and their S3 links." />
    </div>
  );
}
