"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/app/ui/logo";
import { useDrive } from "./drive-provider";
import { HomeIcon, PlusIcon } from "./icons";

export function DriveSidebar() {
  const pathname = usePathname();
  const { openNewMenu } = useDrive();
  const onDashboard = pathname === "/dashboard" || pathname.startsWith("/dashboard/folders");

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col px-3 py-4">
      <Link href="/dashboard" className="mb-6 flex justify-center pt-1">
        <Logo priority className="h-auto w-[120px]" />
      </Link>

      <nav>
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
      </nav>

      <button
        type="button"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          openNewMenu(rect.left, rect.top);
        }}
        className="mt-4 inline-flex h-14 w-fit items-center gap-3 rounded-2xl bg-white pl-4 pr-6 text-sm font-medium text-ink shadow-[0_1px_2px_rgba(41,45,48,0.12),0_1px_3px_1px_rgba(41,45,48,0.06)] transition duration-200 hover:-translate-y-0.5 hover:bg-sand hover:shadow-[0_10px_24px_-12px_rgba(165,139,96,0.55)]"
      >
        <PlusIcon className="h-6 w-6 text-gold" />
        New
      </button>
    </aside>
  );
}
