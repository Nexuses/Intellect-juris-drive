"use client";

import { useActionState, useState } from "react";
import { addUser } from "@/app/actions/users";
import type { FormState } from "@/app/lib/validation";
import {
  FieldError,
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "./form-styles";

export function AddUserForm() {
  const [state, formAction, pending] = useActionState(addUser, undefined);
  const [dismissed, setDismissed] = useState<FormState>(undefined);
  const [formKey, setFormKey] = useState(0);

  const view = state === dismissed ? undefined : state;

  function handleCancel() {
    setDismissed(state);
    setFormKey((key) => key + 1);
  }

  return (
    <form key={formKey} action={formAction} className="space-y-5">
      {view?.error && (
        <div role="alert" className="rounded-lg bg-[#f6ebe7] px-3 py-2 text-sm text-[#8c3a32]">
          {view.error}
        </div>
      )}
      {view?.success && (
        <div role="status" className="rounded-lg bg-sand px-3 py-2 text-sm text-ink">
          {view.success}
        </div>
      )}

      <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
        <div>
          <label htmlFor="name" className={labelClass}>
            Name
          </label>
          <input
            id="name"
            name="name"
            placeholder="e.g. Priya Sharma"
            defaultValue={view?.values?.name}
            required
            className={inputClass}
          />
          <FieldError message={view?.fieldErrors?.name} />
        </div>

        <div>
          <label htmlFor="email" className={labelClass}>
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            placeholder="name@company.com"
            defaultValue={view?.values?.email}
            required
            className={inputClass}
          />
          <FieldError message={view?.fieldErrors?.email} />
        </div>

        <div>
          <label htmlFor="password" className={labelClass}>
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            required
            className={inputClass}
          />
          <FieldError message={view?.fieldErrors?.password} />
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? "Creating..." : "Create User"}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={pending}
          className={secondaryButtonClass}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
