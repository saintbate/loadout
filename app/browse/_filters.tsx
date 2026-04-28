"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  initialQ: string;
  activeTag: string;
  activeSort: "popular" | "recent";
  tags: string[];
};

export function BrowseFilters({ initialQ, activeTag, activeSort, tags }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(initialQ);

  const navigate = (next: Record<string, string | undefined>) => {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v && v.length > 0) params.set(k, v);
      else params.delete(k);
    }
    router.push(`/browse?${params.toString()}`);
  };

  return (
    <div className="mt-4 space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          navigate({ q });
        }}
        className="flex gap-2"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by goal or title…"
          className="flex-1 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-neutral-900"
        />
        <select
          value={activeSort}
          onChange={(e) => navigate({ sort: e.target.value })}
          className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-neutral-900"
        >
          <option value="popular">Most used</option>
          <option value="recent">Recent</option>
        </select>
      </form>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => navigate({ tag: undefined })}
            className={cn(
              "rounded-md px-2 py-0.5 text-xs",
              !activeTag
                ? "bg-neutral-900 text-white"
                : "bg-white text-neutral-600 ring-1 ring-inset ring-neutral-200 hover:bg-neutral-100",
            )}
          >
            all
          </button>
          {tags.map((t) => (
            <button
              key={t}
              onClick={() => navigate({ tag: t === activeTag ? undefined : t })}
              className={cn(
                "rounded-md px-2 py-0.5 text-xs font-mono",
                activeTag === t
                  ? "bg-neutral-900 text-white"
                  : "bg-white text-neutral-600 ring-1 ring-inset ring-neutral-200 hover:bg-neutral-100",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
