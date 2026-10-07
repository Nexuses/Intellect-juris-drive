"use client";

import { useActionState, useState } from "react";
import type { FormState } from "@/app/lib/validation";

type AuthFormProps = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  pendingLabel: string;
  showName?: boolean;
};

const inputClass =
  "h-12 w-full rounded-xl border border-sand bg-white px-4 text-[15px] text-ink outline-none transition duration-200 placeholder:text-ink/35 hover:border-gold/70 focus:border-gold focus:ring-4 focus:ring-gold/15";

function Label({ htmlFor, children }: { htmlFor: string; children: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-2 block text-[15px] font-semibold text-ink">
      {children} <span className="text-gold">*</span>
    </label>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1.5 text-xs text-red-600">{message}</p>;
}

export function AuthForm({
  action,
  submitLabel,
  pendingLabel,
  showName = false,
}: AuthFormProps) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className="space-y-5">
      {state?.error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {state.error}
        </div>
      )}

      {showName && (
        <div>
          <Label htmlFor="name">Full name</Label>
          <input
            id="name"
            name="name"
            autoComplete="name"
            placeholder="Your full name"
            defaultValue={state?.values?.name}
            required
            className={inputClass}
          />
          <FieldError message={state?.fieldErrors?.name} />
        </div>
      )}

      <div>
        <Label htmlFor="email">Email address</Label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="name@company.com"
          defaultValue={state?.values?.email}
          required
          className={inputClass}
        />
        <FieldError message={state?.fieldErrors?.email} />
      </div>

      <div>
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete={showName ? "new-password" : "current-password"}
            placeholder="Enter your password"
            required
            className={`${inputClass} pr-12`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((shown) => !shown)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-ink/40 transition hover:text-gold"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
              {showPassword ? (
                <path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46A11.8 11.8 0 0 0 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78 3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z" />
              ) : (
                <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
              )}
            </svg>
          </button>
        </div>
        <FieldError message={state?.fieldErrors?.password} />
      </div>

      <div className="pt-2">
        <button
          type="submit"
          disabled={pending}
          className="h-12 w-full rounded-xl bg-ink px-4 text-[15px] font-semibold text-cream shadow-[0_10px_24px_-12px_rgba(41,45,48,0.7)] transition duration-200 hover:-translate-y-0.5 hover:bg-gold hover:shadow-[0_14px_28px_-12px_rgba(165,139,96,0.7)] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-ink"
        >
          {pending ? pendingLabel : submitLabel}
        </button>
      </div>
    </form>
  );
}
