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
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center text-xl text-ink sm:text-2xl">
      {parents.map((crumb, index) => (
        <Fragment key={crumb.id ?? "root"}>
          <Link
            href={hrefFor(crumb.id)}
            className={`max-w-[96px] truncate rounded-full px-2 py-1 text-ink/60 transition hover:bg-sand hover:text-ink sm:max-w-[220px] sm:px-3 ${
              index < parents.length - 1 ? "hidden sm:block" : ""
            }`}
          >
            {crumb.name}
          </Link>
          <ChevronRightIcon
            className={`h-5 w-5 shrink-0 text-gold sm:h-6 sm:w-6 ${index < parents.length - 1 ? "hidden sm:block" : ""}`}
          />
        </Fragment>
      ))}
      <button
        type="button"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          openNewMenu(rect.left, rect.bottom + 4);
        }}
        className="flex min-w-0 items-center gap-1 rounded-full py-1 pl-2 pr-1 transition hover:bg-sand sm:pl-3 sm:pr-2"
      >
        <span className="truncate">{current.name}</span>
        <CaretDownIcon className="h-5 w-5 shrink-0 sm:h-6 sm:w-6" />
      </button>
    </nav>
  );
}
