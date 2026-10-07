"use client";

import { useActionState, useState } from "react";
import { editUser, removeUser } from "@/app/actions/users";
import type { FormState } from "@/app/lib/validation";
import type { Role } from "@/app/lib/users";
import { Modal } from "@/app/ui/modal";
import {
  FieldError,
  dangerButtonClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "./form-styles";

type EditableUser = { id: string; name: string; email: string; role: Role };

function ErrorBanner({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-lg bg-[#f6ebe7] px-3 py-2 text-sm text-[#8c3a32]">
      {message}
    </div>
  );
}

function EditUserDialog({ user, onClose }: { user: EditableUser; onClose: () => void }) {
  const [state, formAction, pending] = useActionState(
    async (prev: FormState, formData: FormData) => {
      const result = await editUser(prev, formData);
      if (result?.success) onClose();
      return result;
    },
    undefined,
  );

  return (
    <Modal title="Edit User" description="Update this user's details." onClose={onClose}>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="id" value={user.id} />
        <ErrorBanner message={state?.error} />

        <div>
          <label htmlFor="edit-name" className={labelClass}>
            Name
          </label>
          <input
            id="edit-name"
            name="name"
            defaultValue={state?.values?.name ?? user.name}
            required
            autoFocus
            className={inputClass}
          />
          <FieldError message={state?.fieldErrors?.name} />
        </div>

        <div>
          <label htmlFor="edit-email" className={labelClass}>
            Email
          </label>
          <input
            id="edit-email"
            name="email"
            type="email"
            defaultValue={state?.values?.email ?? user.email}
            required
            className={inputClass}
          />
          <FieldError message={state?.fieldErrors?.email} />
        </div>

        <div>
          <label htmlFor="edit-password" className={labelClass}>
            New password
          </label>
          <input
            id="edit-password"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="Leave blank to keep current password"
            className={inputClass}
          />
          <FieldError message={state?.fieldErrors?.password} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            Cancel
          </button>
          <button type="submit" disabled={pending} className={primaryButtonClass}>
            {pending ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteUserDialog({ user, onClose }: { user: EditableUser; onClose: () => void }) {
  const [state, formAction, pending] = useActionState(
    async (prev: FormState, formData: FormData) => {
      const result = await removeUser(prev, formData);
      if (result?.success) onClose();
      return result;
    },
    undefined,
  );

  return (
    <Modal title="Delete User" onClose={onClose}>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="id" value={user.id} />
        <ErrorBanner message={state?.error} />
        <p className="text-sm text-ink/80">
          Are you sure you want to delete <span className="font-medium">{user.name}</span> (
          {user.email})? They will no longer be able to sign in. This can&apos;t be undone.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            Cancel
          </button>
          <button type="submit" disabled={pending} className={dangerButtonClass}>
            {pending ? "Deleting..." : "Delete User"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

const iconButtonClass =
  "inline-flex h-8 w-8 items-center justify-center rounded-full text-ink/60 transition hover:bg-sand hover:text-ink disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent";

export function UserActions({ user }: { user: EditableUser }) {
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null);
  const close = () => setDialog(null);
  const isAdmin = user.role === "admin";

  return (
    <div className="flex items-center justify-end gap-1">
      <button
        type="button"
        onClick={() => setDialog("edit")}
        className={iconButtonClass}
        aria-label={`Edit ${user.name}`}
        title="Edit"
      >
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden>
          <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => setDialog("delete")}
        disabled={isAdmin}
        className={`${iconButtonClass} hover:bg-[#f6ebe7] hover:text-[#8c3a32]`}
        aria-label={`Delete ${user.name}`}
        title={isAdmin ? "The admin account can't be deleted" : "Delete"}
      >
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden>
          <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
        </svg>
      </button>

      {dialog === "edit" && <EditUserDialog user={user} onClose={close} />}
      {dialog === "delete" && <DeleteUserDialog user={user} onClose={close} />}
    </div>
  );
}
