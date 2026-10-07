import type { ReactNode } from "react";
import Image from "next/image";
import { Logo } from "./logo";

const ARTWORK_URL =
  "https://assets.nexuses.xyz/Screenshot_2026-10-07_121835_1791365718666_mxlx.png";

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="flex min-h-screen flex-1 bg-cream text-ink">
      <section className="flex w-full flex-col px-6 py-10 sm:px-12 lg:w-1/2 xl:px-20">
        <div className="flex flex-1 items-center">
          <div className="mx-auto w-full max-w-[420px]">
            <Logo priority className="mb-10 h-auto w-[120px]" />
            <h1 className="text-[30px] font-semibold leading-tight tracking-tight">{title}</h1>
            {subtitle && <p className="mt-2 text-[15px] text-ink/60">{subtitle}</p>}
            <div className="mt-8">{children}</div>
          </div>
        </div>
        {footer && <div className="mt-10 text-center text-xs text-ink/50">{footer}</div>}
      </section>

      <section className="hidden p-4 lg:block lg:w-1/2">
        <div className="relative h-full overflow-hidden rounded-[28px] bg-ink shadow-[0_20px_50px_-24px_rgba(41,45,48,0.45)]">
          <Image
            src={ARTWORK_URL}
            alt=""
            fill
            priority
            sizes="50vw"
            className="object-cover"
          />
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-ink/95 via-ink/50 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-10 xl:p-12">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-white/70">
              Intellect Juris Law Offices
            </p>
            <p className="mt-3 max-w-md text-[28px] font-semibold leading-snug text-white">
              Your firm&apos;s documents, secure and organized in one place.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
