"use client";

import { useDrive } from "./drive-provider";
import { SparkIcon } from "./icons";

export function OrganizeButton({ looseCount }: { looseCount: number }) {
  const { organizeLooseFiles } = useDrive();
  if (looseCount === 0) return null;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-gold/40 bg-cream px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-ink/80">
        {looseCount === 1 ? "1 file is" : `${looseCount} files are`} outside any folder. AI can sort{" "}
        {looseCount === 1 ? "it" : "them"} into folders by name and type.
      </p>
      <button
        type="button"
        onClick={organizeLooseFiles}
        className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-full bg-ink px-4 text-sm font-medium text-cream transition hover:bg-gold"
      >
        <SparkIcon className="h-4 w-4" />
        Organize with AI
      </button>
    </div>
  );
}
