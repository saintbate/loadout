"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

type ResearchData = {
  prior_art: string;
  missed_by_obvious: string;
  differentiation_pick: string;
};

type State =
  | { phase: "loading" }
  | { phase: "ready"; data: ResearchData; generatedAt: string }
  | { phase: "error" };

type Props = { recipeSlug: string };

export function ResearchSection({ recipeSlug }: Props) {
  const [state, setState] = useState<State>({ phase: "loading" });
  // Start open on desktop (≥768 px), closed on mobile — resolved after mount
  // to avoid hydration mismatch.
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const hasFetched = useRef(false);

  // Set initial open/closed state based on viewport after mount.
  useEffect(() => {
    setOpen(window.innerWidth >= 768);
  }, []);

  // Fetch (or generate) the research result via SSE stream.
  // The server sends {status:"pending"} immediately (within the Edge
  // Runtime's 25 s deadline), then {status:"ready"|"error"} when done.
  async function fetchResearch() {
    setState({ phase: "loading" });
    try {
      const res = await fetch(
        `/api/research/${encodeURIComponent(recipeSlug)}`,
      );
      if (!res.ok || !res.body) {
        setState({ phase: "error" });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const chunk = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const dataLine = chunk
            .split("\n")
            .find((l) => l.startsWith("data: "));
          if (!dataLine) continue;
          try {
            const event = JSON.parse(dataLine.slice(6)) as {
              status: string;
              data?: ResearchData;
              generatedAt?: string;
            };
            if (event.status === "ready" && event.data) {
              setState({
                phase: "ready",
                data: event.data,
                generatedAt: event.generatedAt ?? new Date().toISOString(),
              });
            } else if (event.status === "error") {
              setState({ phase: "error" });
            }
            // "pending" events are silently ignored — skeleton stays visible.
          } catch {
            // malformed event line — skip
          }
        }
      }
    } catch {
      setState({ phase: "error" });
    }
  }

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    void fetchResearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeSlug]);

  async function handleRefresh() {
    setRefreshing(true);
    // Clear the cached row first (best-effort).
    try {
      await fetch(`/api/research/${encodeURIComponent(recipeSlug)}`, {
        method: "DELETE",
      });
    } catch {
      // ignore — the GET will re-detect stale data anyway
    }
    setRefreshing(false);
    hasFetched.current = false;
    void fetchResearch();
  }

  // ── Loading skeleton ────────────────────────────────────────────────
  if (state.phase === "loading") {
    return (
      <div className="mt-6 rounded-md border border-neutral-200 bg-white p-5">
        <p className="mb-4 text-[11px] font-medium uppercase tracking-wider text-neutral-400">
          Researching similar implementations…
        </p>
        <div className="space-y-5">
          {[70, 90, 75].map((w, i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-32 animate-pulse rounded bg-neutral-100" />
              <div className={`h-3 w-[${w}%] animate-pulse rounded bg-neutral-100`} />
              <div className="h-3 w-4/5 animate-pulse rounded bg-neutral-100" />
              <div className="h-3 w-3/5 animate-pulse rounded bg-neutral-100" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Error state ──────────────────────────────────────────────────────
  if (state.phase === "error") {
    return (
      <div className="mt-6 rounded-md border border-neutral-200 bg-white px-5 py-4">
        <p className="text-sm text-neutral-400">
          Research unavailable for this recipe.
        </p>
      </div>
    );
  }

  // ── Ready ────────────────────────────────────────────────────────────
  const { data, generatedAt } = state;
  const genDate = new Date(generatedAt);
  const genLabel = isNaN(genDate.getTime())
    ? ""
    : genDate.toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <section
      className={cn(
        "mt-6 rounded-md border border-neutral-200 bg-white transition-opacity duration-500",
        "animate-research-in",
      )}
    >
      {/* Header / toggle */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 px-5 py-4 text-left"
      >
        <div className="flex-1 space-y-0.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-neutral-400">
            Prior art + differentiation
          </p>
          <h2 className="text-base font-semibold text-neutral-900">
            How similar systems have been built — and where yours can be better
          </h2>
        </div>
        <ChevronDown
          className={cn(
            "mt-1 h-4 w-4 shrink-0 text-neutral-400 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="border-t border-neutral-100 px-5 pb-5 pt-4">
          <div className="space-y-6">
            <ResearchBlock
              label="How others built this"
              body={data.prior_art}
              accent="sky"
            />
            <ResearchBlock
              label="Where the standard approach falls short"
              body={data.missed_by_obvious}
              accent="amber"
            />
            <ResearchBlock
              label="The one thing worth doing differently"
              body={data.differentiation_pick}
              accent="emerald"
            />
          </div>

          {/* Footer: refresh + timestamp */}
          <div className="mt-6 flex items-center justify-between gap-4 border-t border-neutral-100 pt-4">
            <button
              type="button"
              disabled={refreshing}
              onClick={handleRefresh}
              className="inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-700 disabled:opacity-50"
            >
              <RotateCcw
                className={cn("h-3 w-3", refreshing && "animate-spin")}
              />
              {refreshing ? "Refreshing…" : "Refresh research"}
            </button>
            {genLabel && (
              <span className="text-[11px] text-neutral-300">
                Generated {genLabel}
              </span>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes research-in {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: none; }
        }
        .animate-research-in {
          animation: research-in 400ms ease-out both;
        }
      `}</style>
    </section>
  );
}

function ResearchBlock({
  label,
  body,
  accent,
}: {
  label: string;
  body: string;
  accent: "sky" | "amber" | "emerald";
}) {
  const dotClass = {
    sky: "bg-sky-400",
    amber: "bg-amber-400",
    emerald: "bg-emerald-500",
  }[accent];

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotClass)} />
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
          {label}
        </p>
      </div>
      <p className="pl-3.5 text-sm leading-relaxed text-neutral-700">{body}</p>
    </div>
  );
}
