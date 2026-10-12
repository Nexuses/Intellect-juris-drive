import type { ReactNode } from "react";
import Link from "next/link";
import { requireAdmin } from "@/app/lib/dal";
import { ChatWidget } from "@/app/ui/chat-widget";
import { Logo } from "@/app/ui/logo";
import { MobileNavButton, MobileNavPanel, MobileNavProvider } from "@/app/ui/mobile-nav";
import { UserAvatar } from "@/app/ui/user-avatar";
import { AdminSidebar } from "./sidebar";

export default async function AdminConsoleLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdmin();

  return (
    <MobileNavProvider>
      <div className="flex h-dvh max-h-dvh min-h-0 flex-1 overflow-hidden bg-cream text-ink lg:h-screen lg:max-h-screen">
        <MobileNavPanel>
          <AdminSidebar name={admin.name} email={admin.email} />
        </MobileNavPanel>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center gap-2 px-2 lg:hidden">
            <MobileNavButton />
            <Link href="/admin/dashboard" className="flex items-center">
              <Logo className="h-auto w-[56px]" />
            </Link>
            <span className="ml-auto pr-1" title={`${admin.name} (${admin.email})`}>
              <UserAvatar name={admin.name} size={32} />
            </span>
          </header>
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-2 pb-2 lg:py-4 lg:pl-0 lg:pr-4">
            <main className="min-h-full rounded-2xl bg-white px-4 py-5 shadow-[0_1px_2px_rgba(41,45,48,0.04)] sm:px-6 lg:px-8 lg:py-7">{children}</main>
          </div>
        </div>
        <ChatWidget hint="Ask for a user's uploaded files and their S3 links." />
      </div>
    </MobileNavProvider>
  );
}
