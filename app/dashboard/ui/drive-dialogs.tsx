"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import type { DriveItem } from "@/app/lib/drive";
import { Modal } from "@/app/ui/modal";

const textButtonClass =
  "h-10 rounded-full px-4 text-sm font-medium text-gold transition hover:bg-gold/10 disabled:cursor-not-allowed disabled:opacity-50";

export function NameDialog({
  title,
  initialName,
  submitLabel,
  selectBaseName = false,
  onSubmit,
  onClose,
}: {
  title: string;
  initialName: string;
  submitLabel: string;
  selectBaseName?: boolean;
  onSubmit: (name: string) => Promise<string | undefined>;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    const dot = initialName.lastIndexOf(".");
    input.setSelectionRange(0, selectBaseName && dot > 0 ? dot : initialName.length);
  }, [initialName, selectBaseName]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name") ?? "").trim();
    if (!name) {
      setError("Please enter a name.");
      return;
    }
    startTransition(async () => {
      const message = await onSubmit(name);
      if (message) setError(message);
      else onClose();
    });
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          name="name"
          defaultValue={initialName}
          maxLength={255}
          aria-label="Name"
          className="h-12 w-full rounded-lg border border-sand px-4 text-[15px] text-ink outline-none transition hover:border-gold/70 focus:border-2 focus:border-gold focus:px-[15px]"
        />
        {error && <p className="mt-2 text-xs text-[#8c3a32]">{error}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={textButtonClass}>
            Cancel
          </button>
          <button type="submit" disabled={pending} className={textButtonClass}>
            {pending ? "Saving..." : submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function DeleteDialog({
  item,
  onConfirm,
  onClose,
}: {
  item: DriveItem;
  onConfirm: () => Promise<string | undefined>;
  onClose: () => void;
}) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const message = await onConfirm();
      if (message) setError(message);
      else onClose();
    });
  }

  return (
    <Modal title="Delete forever?" onClose={onClose}>
      <p className="text-sm text-ink/70">
        &ldquo;<span className="font-medium text-ink">{item.name}</span>&rdquo;
        {item.type === "folder" ? " and everything inside it" : ""} will be deleted forever.
        You can&apos;t undo this action.
      </p>
      {error && <p className="mt-2 text-xs text-[#8c3a32]">{error}</p>}
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" onClick={onClose} className={textButtonClass}>
          Cancel
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={pending}
          className="h-10 rounded-full bg-[#8c3a32] px-5 text-sm font-medium text-white transition hover:bg-[#6e2c26] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Deleting..." : "Delete forever"}
        </button>
      </div>
    </Modal>
  );
}
