"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LoadedPreference, PreferenceCategory } from "@/lib/preferences";

type ToolOption = { slug: string; name: string };

type Row = {
  key: PreferenceCategory;
  label: string;
  suggestions: ToolOption[];
  current: LoadedPreference | null;
};

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  categories: Row[];
  allTools: ToolOption[];
};

export function PreferencesForm({ action, categories, allTools }: Props) {
  return (
    <form action={action} className="mt-8 space-y-6">
      <div className="divide-y divide-neutral-200 rounded-md border border-neutral-200 bg-white">
        {categories.map((row) => (
          <PreferenceRow
            key={row.key}
            row={row}
            allTools={allTools}
          />
        ))}
      </div>

      <div className="flex items-center justify-end">
        <Button type="submit">Save preferences</Button>
      </div>
    </form>
  );
}

function PreferenceRow({
  row,
  allTools,
}: {
  row: Row;
  allTools: ToolOption[];
}) {
  const [slug, setSlug] = useState(row.current?.preferredToolSlug ?? "");
  const [name, setName] = useState(row.current?.preferredToolName ?? "");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const directorySlug = new Set(allTools.map((t) => t.slug));

  // Search across the WHOLE directory; suggestions come first when query is empty.
  const visible = useMemo(() => {
    if (!query.trim()) return row.suggestions.slice(0, 12);
    const q = query.toLowerCase();
    return allTools
      .filter(
        (t) =>
          t.slug.toLowerCase().includes(q) || t.name.toLowerCase().includes(q),
      )
      .slice(0, 20);
  }, [query, row.suggestions, allTools]);

  const selectedLabel =
    slug && directorySlug.has(slug)
      ? `${row.suggestions.find((s) => s.slug === slug)?.name ?? slug}`
      : null;

  return (
    <div className="space-y-2 px-4 py-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-neutral-900">{row.label}</p>
          {row.suggestions.length > 0 && !slug && !name && (
            <p className="text-xs text-neutral-500">
              {row.suggestions.length} matching tool
              {row.suggestions.length === 1 ? "" : "s"} in the directory
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {selectedLabel && (
            <span className="rounded-md bg-emerald-50 px-2 py-0.5 font-mono text-xs text-emerald-800 ring-1 ring-inset ring-emerald-200">
              {slug}
            </span>
          )}
          {!selectedLabel && name && (
            <span className="rounded-md bg-amber-50 px-2 py-0.5 font-mono text-xs text-amber-800 ring-1 ring-inset ring-amber-200">
              custom: {name}
            </span>
          )}
          {(slug || name) && (
            <button
              type="button"
              onClick={() => {
                setSlug("");
                setName("");
                setOpen(false);
              }}
              className="text-xs text-neutral-500 hover:text-neutral-900"
            >
              clear
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs hover:bg-neutral-50"
          >
            {open ? "close" : selectedLabel || name ? "change" : "set"}
          </button>
        </div>
      </div>

      {open && (
        <div className="space-y-2 rounded-md border border-neutral-200 bg-neutral-50 p-3">
          <input
            type="text"
            placeholder="Search the directory…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-neutral-900"
          />
          <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {visible.map((opt) => (
              <li key={opt.slug}>
                <button
                  type="button"
                  onClick={() => {
                    setSlug(opt.slug);
                    setName("");
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition",
                    slug === opt.slug
                      ? "border-neutral-900 bg-white"
                      : "border-neutral-200 bg-white hover:bg-neutral-100",
                  )}
                >
                  <span className="truncate font-medium text-neutral-900">
                    {opt.name}
                  </span>
                  <span className="font-mono text-[10px] text-neutral-500">
                    {opt.slug}
                  </span>
                </button>
              </li>
            ))}
            {visible.length === 0 && (
              <li className="col-span-full py-1.5 text-xs text-neutral-500">
                No tools match.
              </li>
            )}
          </ul>
          <div className="border-t border-neutral-200 pt-2">
            <label className="block">
              <span className="text-[11px] uppercase tracking-wide text-neutral-500">
                Or type a tool not listed
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (e.target.value.trim()) setSlug("");
                }}
                placeholder="e.g. Datasette, Defer, …"
                className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-neutral-900"
              />
            </label>
          </div>
        </div>
      )}

      {/* Hidden inputs that actually submit. */}
      <input type="hidden" name={`${row.key}__slug`} value={slug} />
      <input type="hidden" name={`${row.key}__name`} value={name} />
    </div>
  );
}
