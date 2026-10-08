"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/actions/auth";
import { Logo } from "@/app/ui/logo";
import { UserAvatar } from "@/app/ui/user-avatar";

const NAV_ITEMS = [
  {
    href: "/admin/dashboard",
    label: "Dashboard",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
        <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />
      </svg>
    ),
  },
  {
    href: "/admin/analytics",
    label: "Analytics",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
        <path d="M4 9h4v11H4zm6-5h4v16h-4zm6 8h4v8h-4z" />
      </svg>
    ),
  },
  {
    href: "/admin/users",
    label: "User Management",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
        <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
      </svg>
    ),
  },
];

export function AdminSidebar({ name, email }: { name: string; email: string }) {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col overflow-hidden px-3 py-4">
      <Link href="/admin/dashboard" className="mb-6 flex justify-center pt-1">
        <Logo priority className="h-auto w-[120px]" />
      </Link>

      <nav className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-4 rounded-full px-4 py-2.5 text-sm transition duration-200 ${
                active
                  ? "bg-sand font-semibold text-ink"
                  : "text-ink/70 hover:bg-sand/80 hover:text-ink"
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>

        <div className="rounded-2xl bg-white p-3 shadow-[0_1px_2px_rgba(41,45,48,0.08)] transition hover:shadow-[0_8px_24px_-16px_rgba(41,45,48,0.35)]">
        <div className="flex items-center gap-3">
          <UserAvatar name={name} size={36} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{name}</p>
            <p className="truncate text-xs text-ink/60">{email}</p>
          </div>
        </div>
        <form action={logout} className="mt-3">
          <button
            type="submit"
            className="w-full rounded-full border border-sand px-4 py-1.5 text-sm font-medium text-ink transition hover:border-gold hover:bg-sand"
          >
            Log out
          </button>
        </form>
      </div>
    </aside>
  );
}
