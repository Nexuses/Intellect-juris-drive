"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { readAllFilesAction } from "@/app/actions/documents";

export function ReadFilesButton({ running, disabled }: { running: boolean; disabled: boolean }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const busy = pending || running;

  return (
    <div className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        onClick={() => router.refresh()}
        className="rounded-full px-3 py-1.5 text-sm font-medium text-ink/70 transition hover:bg-sand"
      >
        Refresh
      </button>
      <button
        type="button"
        disabled={busy || disabled}
        onClick={() => startTransition(() => readAllFilesAction())}
        className="rounded-full bg-ink px-4 py-1.5 text-sm font-medium text-cream transition hover:bg-gold disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Reading files..." : "Read all files now"}
      </button>
    </div>
  );
}
