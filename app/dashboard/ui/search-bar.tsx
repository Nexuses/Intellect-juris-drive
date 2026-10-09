"use client";

import Form from "next/form";
import { useSearchParams } from "next/navigation";
import { SearchIcon } from "./icons";

export function SearchBar() {
  const query = useSearchParams().get("q") ?? "";

  return (
    <Form action="/dashboard/search" className="w-full max-w-[720px]">
      <div className="flex h-12 items-center gap-2 rounded-full bg-sand pl-2 pr-4 transition duration-200 focus-within:bg-white focus-within:shadow-[0_1px_3px_rgba(41,45,48,0.12),0_8px_24px_-8px_rgba(165,139,96,0.45)]">
        <button
          type="submit"
          aria-label="Search"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-ink/60 transition hover:bg-white/60 hover:text-gold"
        >
          <SearchIcon />
        </button>
        <input
          key={query}
          name="q"
          type="search"
          defaultValue={query}
          placeholder="Search by name, or describe what a document says"
          autoComplete="off"
          className="h-full flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink/45"
        />
      </div>
    </Form>
  );
}
