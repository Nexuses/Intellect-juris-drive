import { Suspense, type ReactNode } from "react";
import { requireUser } from "@/app/lib/dal";
import { ChatWidget } from "@/app/ui/chat-widget";
import { LogoutButton } from "@/app/ui/logout-button";
import { MobileNavButton, MobileNavPanel, MobileNavProvider } from "@/app/ui/mobile-nav";
import { UserAvatar } from "@/app/ui/user-avatar";
import { DriveProvider } from "./ui/drive-provider";
import { DriveSidebar, MobileNewButton } from "./ui/drive-sidebar";
import { SearchBar } from "./ui/search-bar";

export default async function DriveLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  return (
    <DriveProvider>
      <MobileNavProvider>
        <div className="flex h-dvh max-h-dvh min-h-0 flex-1 overflow-hidden bg-cream text-ink lg:h-screen lg:max-h-screen">
          <MobileNavPanel>
            <DriveSidebar user={{ name: user.name, email: user.email }} />
          </MobileNavPanel>
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex h-16 shrink-0 items-center gap-2 px-2 sm:gap-3 lg:gap-4 lg:pl-0 lg:pr-4">
              <MobileNavButton />
              <Suspense>
                <SearchBar />
              </Suspense>
              <div className="ml-auto flex items-center gap-2 sm:gap-3">
                <MobileNewButton />
                <span className="hidden sm:block">
                  <LogoutButton />
                </span>
                <span title={`${user.name} (${user.email})`} className="hidden sm:block">
                  <UserAvatar name={user.name} size={36} />
                </span>
              </div>
            </header>
            <div className="min-h-0 flex-1 px-2 pb-2 lg:pb-4 lg:pl-0 lg:pr-4">
              <main className="h-full overflow-y-auto rounded-2xl bg-white px-3 py-2 shadow-[0_1px_2px_rgba(41,45,48,0.04)] sm:px-4">{children}</main>
            </div>
          </div>
        </div>
      </MobileNavProvider>
      <ChatWidget />
    </DriveProvider>
  );
}
