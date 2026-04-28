"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { bulkAction, promoteFromQueue, rejectFromQueue } from "./actions";

type Row = {
  id: number;
  slugSuggestion: string;
  name: string;
  kind: string | null;
  homepageUrl: string | null;
  repoUrl: string | null;
  description: string | null;
  categoryTags: string[];
  capabilities: string[];
  source: string;
  sourceContext: Record<string, unknown>;
  proposalCount: number;
  lastProposedAt: string;
  firstProposedAt: string;
  status: string;
  reviewerClerkId: string | null;
  reviewedAt: string | null;
  notes: string | null;
};

type Props = {
  rows: Row[];
  tab: "pending" | "promoted" | "rejected";
};

export function QueueTable({ rows, tab }: Props) {
  const [cursor, setCursor] = useState(0);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const promoteFormRefs = useRef<Map<number, HTMLFormElement>>(new Map());
  const rejectFormRefs = useRef<Map<number, HTMLFormElement>>(new Map());

  // Reset on tab change.
  useEffect(() => {
    setCursor(0);
    setExpanded(new Set());
    setEditing(null);
    setSelected(new Set());
  }, [tab]);

  // Keyboard shortcuts (only when not typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (rows.length === 0) return;
      const row = rows[cursor];
      if (!row) return;

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setCursor((c) => Math.min(rows.length - 1, c + 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) => Math.max(0, c - 1));
      } else if (e.key === "p" && tab === "pending") {
        e.preventDefault();
        promoteFormRefs.current.get(row.id)?.requestSubmit();
      } else if (e.key === "r" && tab !== "rejected") {
        e.preventDefault();
        rejectFormRefs.current.get(row.id)?.requestSubmit();
      } else if (e.key === "e") {
        e.preventDefault();
        setEditing((cur) => (cur === row.id ? null : row.id));
        setExpanded((s) => {
          const n = new Set(s);
          n.add(row.id);
          return n;
        });
      } else if (e.key === "Enter") {
        e.preventDefault();
        setExpanded((s) => {
          const n = new Set(s);
          if (n.has(row.id)) n.delete(row.id);
          else n.add(row.id);
          return n;
        });
      } else if (e.key === "x") {
        e.preventDefault();
        setSelected((s) => {
          const n = new Set(s);
          if (n.has(row.id)) n.delete(row.id);
          else n.add(row.id);
          return n;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, cursor, tab]);

  if (rows.length === 0) {
    return (
      <p className="mt-8 text-sm text-neutral-500">
        Nothing in the {tab} queue.
      </p>
    );
  }

  return (
    <div className="mt-6 space-y-3">
      {selected.size > 0 && tab === "pending" && (
        <form
          action={bulkAction}
          className="flex items-center gap-3 rounded-md border border-neutral-300 bg-neutral-50 px-3 py-2 text-xs"
        >
          {Array.from(selected).map((id) => (
            <input
              key={id}
              type="hidden"
              name="selected_ids"
              value={String(id)}
            />
          ))}
          <span className="font-medium text-neutral-700">
            {selected.size} selected
          </span>
          <button
            name="bulk_action"
            value="promote"
            className="rounded-md bg-neutral-900 px-2.5 py-1 text-white hover:bg-neutral-800"
          >
            Promote all
          </button>
          <button
            name="bulk_action"
            value="reject"
            className="rounded-md bg-white px-2.5 py-1 text-neutral-700 ring-1 ring-inset ring-neutral-200 hover:bg-neutral-100"
          >
            Reject all
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="ml-auto text-neutral-500 hover:text-neutral-900"
          >
            clear
          </button>
        </form>
      )}

      <ul className="divide-y divide-neutral-200 rounded-md border border-neutral-200 bg-white">
        {rows.map((row, i) => {
          const isOpen = expanded.has(row.id);
          const isEditing = editing === row.id;
          return (
            <li
              key={row.id}
              className={cn(
                "transition",
                cursor === i &&
                  "ring-2 ring-inset ring-neutral-900 rounded-md",
              )}
              onClick={() => setCursor(i)}
            >
              <div className="flex items-start gap-3 px-4 py-3 text-sm">
                {tab === "pending" && (
                  <input
                    type="checkbox"
                    checked={selected.has(row.id)}
                    onChange={(e) => {
                      setSelected((s) => {
                        const n = new Set(s);
                        if (e.target.checked) n.add(row.id);
                        else n.delete(row.id);
                        return n;
                      });
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1.5 h-3.5 w-3.5 cursor-pointer"
                  />
                )}

                <button
                  type="button"
                  onClick={() => {
                    setExpanded((s) => {
                      const n = new Set(s);
                      if (n.has(row.id)) n.delete(row.id);
                      else n.add(row.id);
                      return n;
                    });
                  }}
                  className="mt-0.5 shrink-0 text-neutral-400 hover:text-neutral-900"
                >
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform",
                      isOpen && "rotate-180",
                    )}
                  />
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate font-medium text-neutral-900">
                      {row.name}
                    </span>
                    <span className="font-mono text-[10px] text-neutral-500">
                      {row.slugSuggestion}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-neutral-500">
                    <Badge variant="default">{row.source}</Badge>
                    {row.kind && (
                      <span className="font-mono">{row.kind}</span>
                    )}
                    <span>×{row.proposalCount} proposals</span>
                    <span>
                      last{" "}
                      {row.lastProposedAt
                        .slice(0, 10)
                        .replace(/-/g, "/")}
                    </span>
                    {row.reviewerClerkId && (
                      <span>
                        by {row.reviewerClerkId.slice(0, 12)}…
                      </span>
                    )}
                  </div>
                  {row.description && !isOpen && (
                    <p className="mt-1 line-clamp-1 text-xs text-neutral-600">
                      {row.description}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 gap-1.5">
                  {tab === "pending" && (
                    <>
                      <form
                        action={promoteFromQueue}
                        ref={(el) => {
                          if (el) promoteFormRefs.current.set(row.id, el);
                        }}
                      >
                        <input type="hidden" name="id" value={row.id} />
                        <Button type="submit" size="sm">
                          Promote
                        </Button>
                      </form>
                      <form
                        action={rejectFromQueue}
                        ref={(el) => {
                          if (el) rejectFormRefs.current.set(row.id, el);
                        }}
                      >
                        <input type="hidden" name="id" value={row.id} />
                        <Button type="submit" size="sm" variant="ghost">
                          Reject
                        </Button>
                      </form>
                    </>
                  )}
                  {tab === "rejected" && (
                    <form action={promoteFromQueue}>
                      <input type="hidden" name="id" value={row.id} />
                      <Button type="submit" size="sm" variant="secondary">
                        Restore
                      </Button>
                    </form>
                  )}
                </div>
              </div>

              {isOpen && (
                <div className="border-t border-neutral-100 bg-neutral-50 px-4 py-3 text-xs">
                  {isEditing ? (
                    <EditPromoteForm row={row} onCancel={() => setEditing(null)} />
                  ) : (
                    <ReadOnlyDetails row={row} />
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-2 text-[10px] text-neutral-400">
        Shortcuts: J/K next/prev · Enter expand · E edit · P promote · R
        reject · X select
      </p>
    </div>
  );
}

function ReadOnlyDetails({ row }: { row: Row }) {
  return (
    <dl className="grid grid-cols-1 gap-y-1.5 sm:grid-cols-2">
      <Field label="Description">{row.description || "—"}</Field>
      <Field label="Homepage">
        {row.homepageUrl ? (
          <a
            href={row.homepageUrl}
            target="_blank"
            rel="noreferrer"
            className="break-all text-blue-700 hover:underline"
          >
            {row.homepageUrl}
          </a>
        ) : (
          "—"
        )}
      </Field>
      <Field label="Repo">
        {row.repoUrl ? (
          <a
            href={row.repoUrl}
            target="_blank"
            rel="noreferrer"
            className="break-all text-blue-700 hover:underline"
          >
            {row.repoUrl}
          </a>
        ) : (
          "—"
        )}
      </Field>
      <Field label="Tags">
        {row.categoryTags.length > 0 ? row.categoryTags.join(", ") : "—"}
      </Field>
      <Field label="Capabilities">
        {row.capabilities.length > 0 ? row.capabilities.join("; ") : "—"}
      </Field>
      <Field label="Source context">
        <pre className="mt-1 max-h-40 overflow-auto rounded bg-white p-2 text-[10px] ring-1 ring-inset ring-neutral-200">
          {JSON.stringify(row.sourceContext, null, 2)}
        </pre>
      </Field>
    </dl>
  );
}

function EditPromoteForm({
  row,
  onCancel,
}: {
  row: Row;
  onCancel: () => void;
}) {
  return (
    <form action={promoteFromQueue} className="space-y-2">
      <input type="hidden" name="id" value={row.id} />

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Input name="slug" label="Slug" defaultValue={row.slugSuggestion} />
        <Input name="name" label="Name" defaultValue={row.name} />
        <Select
          name="kind"
          label="Kind"
          defaultValue={row.kind ?? "service"}
          options={[
            "mcp_server",
            "cli",
            "api",
            "library",
            "sdk",
            "service",
          ]}
        />
        <Input
          name="homepage_url"
          label="Homepage URL"
          defaultValue={row.homepageUrl ?? ""}
        />
        <Input
          name="repo_url"
          label="Repo URL"
          defaultValue={row.repoUrl ?? ""}
        />
        <Input
          name="category_tags"
          label="Tags (comma-separated)"
          defaultValue={row.categoryTags.join(", ")}
        />
      </div>
      <Textarea
        name="description"
        label="Description"
        defaultValue={row.description ?? ""}
      />
      <Textarea
        name="capabilities"
        label="Capabilities (comma-separated)"
        defaultValue={row.capabilities.join(", ")}
        rows={2}
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm">
          Save & promote
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
        {label}
      </dt>
      <dd className="text-neutral-700">{children}</dd>
    </div>
  );
}

function Input({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-600">
        {label}
      </span>
      <input
        name={name}
        defaultValue={defaultValue}
        className="mt-0.5 w-full rounded-md border border-neutral-300 bg-white px-2 py-1 font-mono text-[11px] outline-none focus:border-neutral-900"
      />
    </label>
  );
}

function Textarea({
  label,
  name,
  defaultValue,
  rows = 3,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  rows?: number;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-600">
        {label}
      </span>
      <textarea
        name={name}
        defaultValue={defaultValue}
        rows={rows}
        className="mt-0.5 w-full resize-none rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs outline-none focus:border-neutral-900"
      />
    </label>
  );
}

function Select({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  options: string[];
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-600">
        {label}
      </span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="mt-0.5 w-full rounded-md border border-neutral-300 bg-white px-2 py-1 font-mono text-[11px] outline-none focus:border-neutral-900"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
