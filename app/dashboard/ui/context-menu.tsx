"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export type MenuEntry =
  | { label: string; icon: ReactNode; onSelect: () => void; danger?: boolean }
  | "divider";

export function ContextMenu({
  x,
  y,
  entries,
  onClose,
}: {
  x: number;
  y: number;
  entries: MenuEntry[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y, visible: false });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const margin = 8;
    const left = x + width > window.innerWidth - margin ? Math.max(margin, x - width) : x;
    const top = y + height > window.innerHeight - margin ? Math.max(margin, y - height) : y;
    setPosition({ left, top, visible: true });
  }, [x, y]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) onClose();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onClose);
    window.addEventListener("blur", onClose);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      onContextMenu={(event) => event.preventDefault()}
      className="fixed z-50 min-w-[240px] rounded-lg bg-white py-2 shadow-[0_2px_6px_2px_rgba(60,64,67,0.15),0_1px_2px_rgba(60,64,67,0.3)]"
      style={{
        left: position.left,
        top: position.top,
        visibility: position.visible ? "visible" : "hidden",
      }}
    >
      {entries.map((entry, index) =>
        entry === "divider" ? (
          <div key={`divider-${index}`} className="my-2 border-t border-sand" />
        ) : (
          <button
            key={entry.label}
            type="button"
            role="menuitem"
            onClick={() => {
              onClose();
              entry.onSelect();
            }}
            className={`flex h-9 w-full items-center gap-4 px-4 text-left text-sm transition hover:bg-sand ${
              entry.danger ? "text-[#8c3a32]" : "text-ink"
            }`}
          >
            <span className={entry.danger ? "text-[#8c3a32]" : "text-gold"}>{entry.icon}</span>
            {entry.label}
          </button>
        ),
      )}
    </div>
  );
}
