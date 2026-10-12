"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/app/ui/logo";
import { LogoutButton } from "@/app/ui/logout-button";
import { useMobileNav } from "@/app/ui/mobile-nav";
import { UserAvatar } from "@/app/ui/user-avatar";
import { useDrive } from "./drive-provider";
import { ChartIcon, FilesIcon, HomeIcon, PlusIcon } from "./icons";

export function DriveSidebar({ user }: { user: { name: string; email: string } }) {
  const pathname = usePathname();
  const { openNewMenu } = useDrive();
  const { setOpen } = useMobileNav();
  const onDashboard = pathname === "/dashboard" || pathname.startsWith("/dashboard/folders");
  const onAnalytics = pathname === "/dashboard/analytics";
  const onFiles = pathname === "/dashboard/files";

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col overflow-hidden px-3 py-4">
      <Link href="/dashboard" className="mb-6 flex justify-center pt-1">
        <Logo priority className="h-auto w-[120px]" />
      </Link>

      <nav className="flex flex-col gap-1">
        <Link
          href="/dashboard"
          className={`flex items-center gap-4 rounded-full px-4 py-2.5 text-sm transition duration-200 ${
            onDashboard
              ? "bg-sand font-semibold text-ink"
              : "text-ink/70 hover:bg-sand/80 hover:text-ink"
          }`}
        >
          <HomeIcon />
          Dashboard
        </Link>
        <Link
          href="/dashboard/files"
          className={`flex items-center gap-4 rounded-full px-4 py-2.5 text-sm transition duration-200 ${
            onFiles
              ? "bg-sand font-semibold text-ink"
              : "text-ink/70 hover:bg-sand/80 hover:text-ink"
          }`}
        >
          <FilesIcon />
          File Management
        </Link>
        <Link
          href="/dashboard/analytics"
          className={`flex items-center gap-4 rounded-full px-4 py-2.5 text-sm transition duration-200 ${
            onAnalytics
              ? "bg-sand font-semibold text-ink"
              : "text-ink/70 hover:bg-sand/80 hover:text-ink"
          }`}
        >
          <ChartIcon />
          Analytics
        </Link>
      </nav>

      <button
        type="button"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setOpen(false);
          openNewMenu(rect.left, rect.top);
        }}
        className="mt-4 inline-flex h-14 w-fit items-center gap-3 rounded-2xl bg-white pl-4 pr-6 text-sm font-medium text-ink shadow-[0_1px_2px_rgba(41,45,48,0.12),0_1px_3px_1px_rgba(41,45,48,0.06)] transition duration-200 hover:-translate-y-0.5 hover:bg-sand hover:shadow-[0_10px_24px_-12px_rgba(165,139,96,0.55)]"
      >
        <PlusIcon className="h-6 w-6 text-gold" />
        New
      </button>

      <div className="mt-auto rounded-2xl bg-white p-3 shadow-[0_1px_2px_rgba(41,45,48,0.08)] sm:hidden">
        <div className="flex items-center gap-3">
          <UserAvatar name={user.name} size={36} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{user.name}</p>
            <p className="truncate text-xs text-ink/60">{user.email}</p>
          </div>
        </div>
        <div className="mt-3 [&_button]:w-full">
          <LogoutButton />
        </div>
      </div>
    </aside>
  );
}

/** The New menu button for small screens, where the sidebar is tucked away. */
export function MobileNewButton() {
  const { openNewMenu } = useDrive();
  return (
    <button
      type="button"
      aria-label="New"
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        openNewMenu(rect.right, rect.bottom + 4);
      }}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-gold shadow-[0_1px_2px_rgba(41,45,48,0.12),0_1px_3px_1px_rgba(41,45,48,0.06)] transition hover:bg-sand lg:hidden"
    >
      <PlusIcon className="h-6 w-6" />
    </button>
  );
}
