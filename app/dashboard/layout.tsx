import { Suspense, type ReactNode } from "react";
import { requireUser } from "@/app/lib/dal";
import { LogoutButton } from "@/app/ui/logout-button";
import { UserAvatar } from "@/app/ui/user-avatar";
import { DriveProvider } from "./ui/drive-provider";
import { DriveSidebar } from "./ui/drive-sidebar";
import { SearchBar } from "./ui/search-bar";

export default async function DriveLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  return (
    <DriveProvider>
      <div className="flex h-screen overflow-hidden bg-cream text-ink">
        <DriveSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 shrink-0 items-center gap-4 pr-4">
            <Suspense>
              <SearchBar />
            </Suspense>
            <div className="ml-auto flex items-center gap-3">
              <LogoutButton />
              <span title={`${user.name} (${user.email})`}>
                <UserAvatar name={user.name} size={36} />
              </span>
            </div>
          </header>
          <div className="min-h-0 flex-1 pb-4 pr-4">
            <main className="h-full overflow-y-auto rounded-2xl bg-white px-4 py-2 shadow-[0_1px_2px_rgba(41,45,48,0.04)]">{children}</main>
          </div>
        </div>
      </div>
    </DriveProvider>
  );
}
