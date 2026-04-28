"use client";

import { useState, useTransition } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlanStep, PlanToolRef, PlanToolStatus } from "@/lib/plan-types";
import { STATUS_META, resolveToolStatus } from "@/lib/trust";
import { toggleStepCompletion } from "./actions";

type Props = {
  slug: string;
  step: PlanStep & { codeHtml: string | null };
  homepageBySlug: Map<string, string | null>;
  statusBySlug: Map<string, PlanToolStatus>;
  authenticated: boolean;
  progress: { completedAt: Date; notes: string | null } | null;
};

export function StepCard({
  slug,
  step,
  homepageBySlug,
  statusBySlug,
  authenticated,
  progress,
}: Props) {
  const [altsOpen, setAltsOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(Boolean(progress?.notes));
  const [pending, startTransition] = useTransition();
  const completed = Boolean(progress);

  function toggle(next: boolean, notes?: string) {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("slug", slug);
      fd.set("step_number", String(step.step_number));
      fd.set("completed", next ? "true" : "false");
      if (notes !== undefined) fd.set("notes", notes);
      else if (progress?.notes) fd.set("notes", progress.notes);
      await toggleStepCompletion(fd);
    });
  }

  return (
    <li
      className={cn(
        "rounded-md border bg-white transition",
        completed ? "border-emerald-300 bg-emerald-50/30" : "border-neutral-200",
      )}
    >
      <div className="flex items-start gap-3 px-5 py-4">
        {/* Step number / checkbox */}
        {authenticated ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => toggle(!completed)}
            title={completed ? "Mark step incomplete" : "Mark step complete"}
            className={cn(
              "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium transition",
              completed
                ? "bg-emerald-500 text-white hover:bg-emerald-600"
                : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200",
              pending && "opacity-60",
            )}
          >
            {completed ? (
              <Check className="h-3.5 w-3.5" strokeWidth={3} />
            ) : (
              step.step_number
            )}
          </button>
        ) : (
          <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-medium text-neutral-700">
            {step.step_number}
          </div>
        )}

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h3
              className={cn(
                "text-base font-semibold",
                completed
                  ? "text-neutral-500 line-through decoration-neutral-300"
                  : "text-neutral-900",
              )}
            >
              {step.title}
            </h3>
            {completed && progress && (
              <span className="text-[10px] uppercase tracking-wide text-emerald-700">
                Done {timeAgo(progress.completedAt)}
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {step.tools.map((tool) => {
              const href = tool.proposed_tool
                ? tool.proposed_homepage_url
                : homepageBySlug.get(tool.slug);
              return (
                <ToolChip
                  key={`${step.step_number}-${tool.slug}`}
                  tool={tool}
                  status={resolveToolStatus(tool, statusBySlug)}
                  href={href ?? undefined}
                />
              );
            })}
          </div>

          <p className="text-sm leading-relaxed text-neutral-700">
            {step.rationale}
          </p>

          {step.tools.some(
            (t) => t.preference_match || t.preference_override,
          ) && (
            <div className="space-y-1.5">
              {step.tools.map((t, i) => {
                if (t.preference_match) {
                  return (
                    <p
                      key={`pm-${i}`}
                      className="rounded-md bg-emerald-50 px-2 py-1 text-xs text-emerald-900 ring-1 ring-inset ring-emerald-200"
                    >
                      Selected because you prefer{" "}
                      <span className="font-mono">{t.slug}</span> for this
                      category.
                    </p>
                  );
                }
                if (t.preference_override) {
                  return (
                    <p
                      key={`po-${i}`}
                      className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-900 ring-1 ring-inset ring-amber-200"
                    >
                      Considered{" "}
                      <span className="font-mono">
                        {t.preference_override.preferred}
                      </span>{" "}
                      (your preference); chose{" "}
                      <span className="font-mono">
                        {t.preference_override.chosen}
                      </span>{" "}
                      because {t.preference_override.reason}
                    </p>
                  );
                }
                return null;
              })}
            </div>
          )}

          {step.setup_commands && step.setup_commands.length > 0 && (
            <pre className="overflow-x-auto rounded-md bg-neutral-900 px-3 py-2 font-mono text-xs leading-relaxed text-neutral-100">
              {step.setup_commands.map((c) => `$ ${c}`).join("\n")}
            </pre>
          )}

          {step.codeHtml && (
            <div
              className="overflow-x-auto rounded-md border border-neutral-200 bg-neutral-50 p-3 font-mono text-[12px] [&_pre]:overflow-x-auto [&_pre]:bg-transparent [&_pre]:p-0"
              dangerouslySetInnerHTML={{ __html: step.codeHtml }}
            />
          )}

          {/* Build-journal note (only when authenticated). */}
          {authenticated && (
            <div className="border-t border-neutral-100 pt-2">
              {!notesOpen && !progress?.notes ? (
                <button
                  type="button"
                  onClick={() => setNotesOpen(true)}
                  className="text-[11px] text-neutral-500 hover:text-neutral-900"
                >
                  Add note
                </button>
              ) : (
                <NotesField
                  defaultValue={progress?.notes ?? ""}
                  pending={pending}
                  onSave={(v) => toggle(completed, v)}
                  onClose={() => setNotesOpen(false)}
                />
              )}
            </div>
          )}

          {step.alternatives_considered &&
            step.alternatives_considered.length > 0 && (
              <div className="border-t border-neutral-100 pt-3">
                <button
                  type="button"
                  onClick={() => setAltsOpen((v) => !v)}
                  className="flex items-center gap-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-900"
                >
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 transition-transform",
                      altsOpen && "rotate-180",
                    )}
                  />
                  Alternatives considered ({step.alternatives_considered.length})
                </button>
                {altsOpen && (
                  <ul className="mt-2 space-y-1.5 pl-5 text-xs text-neutral-600">
                    {step.alternatives_considered.map((alt, i) => (
                      <li key={i}>
                        <span className="font-medium text-neutral-800">
                          {alt.name}
                        </span>
                        <span className="text-neutral-500">
                          {" — "}
                          {alt.rejected_because}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
        </div>
      </div>
    </li>
  );
}

function NotesField({
  defaultValue,
  pending,
  onSave,
  onClose,
}: {
  defaultValue: string;
  pending: boolean;
  onSave: (value: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(defaultValue);
  return (
    <div className="space-y-1.5">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={2}
        placeholder="Notes for future-you (e.g. used pgvector instead, see PR #42)"
        className="w-full resize-none rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-neutral-900"
      />
      <div className="flex items-center gap-3 text-[11px]">
        <button
          type="button"
          disabled={pending || value === defaultValue}
          onClick={() => onSave(value)}
          className="rounded-md bg-neutral-900 px-2 py-0.5 text-white disabled:opacity-50 hover:bg-neutral-800"
        >
          {pending ? "Saving…" : "Save note"}
        </button>
        <button
          type="button"
          onClick={() => {
            setValue(defaultValue);
            onClose();
          }}
          className="text-neutral-500 hover:text-neutral-900"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function ToolChip({
  tool,
  status,
  href,
}: {
  tool: PlanToolRef;
  status: PlanToolStatus;
  href?: string;
}) {
  const meta = STATUS_META[status];
  const className = cn(
    "inline-flex items-center gap-1.5 rounded-md border bg-white px-2 py-0.5 text-xs font-mono",
    meta.chipBorder,
    href ? "hover:bg-neutral-50" : "",
  );
  const inner = (
    <>
      <span
        title={meta.label}
        className={cn("h-1.5 w-1.5 shrink-0 rounded-full", meta.dotClass)}
      />
      <span className="text-neutral-800">{tool.slug}</span>
      {status === "not_in_directory" && (
        <span
          title="Not yet in directory"
          className="text-[10px] text-neutral-400"
        >
          ?
        </span>
      )}
      <span className="text-neutral-300">·</span>
      <span className="font-sans text-[11px] text-neutral-500">
        {tool.role}
      </span>
    </>
  );
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {inner}
      </a>
    );
  }
  return <span className={className}>{inner}</span>;
}

function timeAgo(d: Date | string): string {
  // completedAt may arrive as an ISO string across the RSC boundary.
  const ts = typeof d === "string" ? new Date(d).getTime() : d.getTime();
  const ms = Date.now() - ts;
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const date = typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10);
  return date;
}
