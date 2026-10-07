export const inputClass =
  "h-10 w-full rounded-lg border border-sand bg-white px-3 text-sm text-ink outline-none transition duration-200 placeholder:text-ink/35 hover:border-gold/70 focus:border-gold focus:ring-[3px] focus:ring-gold/15";

export const labelClass = "mb-1.5 block text-[13px] font-medium text-ink";

export const primaryButtonClass =
  "h-9 rounded-lg bg-ink px-4 text-sm font-medium text-cream shadow-sm transition duration-200 hover:-translate-y-0.5 hover:bg-gold disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-ink";

export const secondaryButtonClass =
  "h-9 rounded-lg border border-sand bg-white px-4 text-sm font-medium text-ink transition hover:border-gold hover:bg-sand disabled:cursor-not-allowed disabled:opacity-60";

export const dangerButtonClass =
  "h-9 rounded-lg bg-[#8c3a32] px-4 text-sm font-medium text-white shadow-sm transition hover:bg-[#6e2c26] disabled:cursor-not-allowed disabled:opacity-60";

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1.5 text-xs text-[#8c3a32]">{message}</p>;
}
