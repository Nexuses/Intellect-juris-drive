"use client";

import Link from "next/link";
import { Fragment } from "react";
import { useDrive } from "./drive-provider";
import { CaretDownIcon, ChevronRightIcon } from "./icons";

export type BreadcrumbItem = { id: string | null; name: string };

function hrefFor(id: string | null) {
  return id ? `/dashboard/folders/${id}` : "/dashboard";
}

export function Breadcrumbs({ crumbs }: { crumbs: BreadcrumbItem[] }) {
  const { openNewMenu } = useDrive();
  const parents = crumbs.slice(0, -1);
  const current = crumbs[crumbs.length - 1];

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center text-2xl text-ink">
      {parents.map((crumb) => (
        <Fragment key={crumb.id ?? "root"}>
          <Link
            href={hrefFor(crumb.id)}
            className="max-w-[220px] truncate rounded-full px-3 py-1 text-ink/60 transition hover:bg-sand hover:text-ink"
          >
            {crumb.name}
          </Link>
          <ChevronRightIcon className="h-6 w-6 shrink-0 text-gold" />
        </Fragment>
      ))}
      <button
        type="button"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          openNewMenu(rect.left, rect.bottom + 4);
        }}
        className="flex min-w-0 items-center gap-1 rounded-full py-1 pl-3 pr-2 transition hover:bg-sand"
      >
        <span className="truncate">{current.name}</span>
        <CaretDownIcon className="h-6 w-6 shrink-0" />
      </button>
    </nav>
  );
}
