"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type MobileNavState = { open: boolean; setOpen: (open: boolean) => void };

const MobileNavContext = createContext<MobileNavState>({ open: false, setOpen: () => {} });

export function MobileNavProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [openedOn, setOpenedOn] = useState(pathname);

  if (open && openedOn !== pathname) setOpen(false);
  if (openedOn !== pathname) setOpenedOn(pathname);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return <MobileNavContext.Provider value={{ open, setOpen }}>{children}</MobileNavContext.Provider>;
}

export function useMobileNav() {
  return useContext(MobileNavContext);
}

/** Opens the sidebar drawer. Hidden on large screens, where the sidebar is always visible. */
export function MobileNavButton({ className = "" }: { className?: string }) {
  const { open, setOpen } = useMobileNav();
  return (
    <button
      type="button"
      aria-label="Open menu"
      aria-expanded={open}
      onClick={() => setOpen(true)}
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink transition hover:bg-sand lg:hidden ${className}`}
    >
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
        <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
      </svg>
    </button>
  );
}

/** Wraps a sidebar: a slide-in drawer on small screens, a normal column on large screens. */
export function MobileNavPanel({ children }: { children: ReactNode }) {
  const { open, setOpen } = useMobileNav();
  return (
    <>
      <div
        aria-hidden
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-40 bg-ink/40 transition-opacity duration-200 lg:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <div
        className={`fixed inset-y-0 left-0 z-40 flex bg-cream shadow-[0_12px_40px_rgba(41,45,48,0.25)] transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0 lg:bg-transparent lg:shadow-none lg:transition-none ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {children}
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
          className="absolute right-2 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full text-ink/70 transition hover:bg-sand lg:hidden"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </>
  );
}
