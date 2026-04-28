"use client";

import { cn } from "@/lib/utils";
import { STATUS_META, resolveToolStatus } from "@/lib/trust";
import type { StreamingStep } from "./types";

/**
 * Right-panel step card while streaming. Mirrors the eventual recipe
 * step card visually but renders progressively from the streaming state.
 *
 * - Title + tool chips appear immediately as their fields arrive.
 * - Rationale streams in (with a blinking caret while it's still growing).
 * - Code block appears once any code text exists.
 *
 * The "done" flag (set when trust_signal arrives in the stream) makes
 * the card lose its in-progress glow.
 */
export function StreamingStepCard({ step }: { step: StreamingStep }) {
  return (
    <li
      className={cn(
        "rounded-md border bg-white px-5 py-4 transition",
        step.done
          ? "border-neutral-200"
          : "border-emerald-200 shadow-[0_0_0_3px_rgba(16,185,129,0.08)]",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium",
            step.done
              ? "bg-neutral-100 text-neutral-700"
              : "bg-emerald-500 text-white",
          )}
        >
          {step.step_number}
        </div>
        <div className="flex-1 space-y-3">
          <h3 className="text-base font-semibold text-neutral-900">
            {step.title}
            {!step.done && step.title && <BlinkingCaret />}
          </h3>

          {step.tools.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {step.tools.map((tool) => {
                const status = resolveToolStatus(tool);
                // Guard against AI emitting an unexpected status value —
                // fall back to "verified" appearance rather than crashing.
                const meta = STATUS_META[status] ?? STATUS_META["verified"];
                return (
                  <span
                    key={`${step.step_number}-${tool.slug}`}
                    className={cn(
                      "inline-flex animate-chip-in items-center gap-1.5 rounded-md border bg-white px-2 py-0.5 font-mono text-xs",
                      meta.chipBorder,
                    )}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 shrink-0 rounded-full",
                        meta.dotClass,
                      )}
                    />
                    <span className="text-neutral-800">{tool.slug}</span>
                    <span className="text-neutral-300">·</span>
                    <span className="font-sans text-[11px] text-neutral-500">
                      {tool.role}
                    </span>
                  </span>
                );
              })}
            </div>
          )}

          {step.rationale && (
            <p className="text-sm leading-relaxed text-neutral-700">
              {step.rationale}
              {!step.done && <BlinkingCaret />}
            </p>
          )}

          {step.setup_commands.length > 0 && (
            <pre className="overflow-x-auto rounded-md bg-neutral-900 px-3 py-2 font-mono text-xs leading-relaxed text-neutral-100">
              {step.setup_commands.map((c) => `$ ${c}`).join("\n")}
            </pre>
          )}

          {step.code && (
            <pre className="overflow-x-auto rounded-md border border-neutral-200 bg-neutral-50 p-3 font-mono text-[12px] leading-relaxed text-neutral-800">
              <code>{step.code}</code>
              {!step.done && <BlinkingCaret />}
            </pre>
          )}
        </div>
      </div>
      <style>{`
        @keyframes chip-in {
          from { opacity: 0; transform: translateY(2px) scale(0.96); }
          to   { opacity: 1; transform: none; }
        }
        .animate-chip-in {
          animation: chip-in 220ms ease-out both;
        }
      `}</style>
    </li>
  );
}

/**
 * Skeleton/ghost card shown for steps that haven't streamed yet.
 * Pulsing pale rectangles. Visually suggests "more coming".
 */
export function GhostStepCard({ index }: { index: number }) {
  return (
    <li className="rounded-md border border-dashed border-neutral-200 bg-white/40 px-5 py-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 h-6 w-6 shrink-0 animate-pulse rounded-full bg-neutral-100" />
        <div className="flex-1 space-y-3">
          <div className="h-4 w-2/3 animate-pulse rounded bg-neutral-100" />
          <div className="flex gap-1.5">
            <div className="h-5 w-16 animate-pulse rounded-md bg-neutral-100" />
            <div className="h-5 w-20 animate-pulse rounded-md bg-neutral-100" />
          </div>
          <div className="space-y-1.5">
            <div className="h-3 w-full animate-pulse rounded bg-neutral-100" />
            <div className="h-3 w-5/6 animate-pulse rounded bg-neutral-100" />
            <div className="h-3 w-3/4 animate-pulse rounded bg-neutral-100" />
          </div>
        </div>
      </div>
      {/* index used by parent for keying, kept for clarity */}
      <span className="sr-only">step {index} placeholder</span>
    </li>
  );
}

function BlinkingCaret() {
  return (
    <span className="ml-0.5 inline-block h-[1em] w-[2px] -translate-y-[1px] animate-caret bg-emerald-500 align-middle">
      <style>{`
        @keyframes caret {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
        .animate-caret { animation: caret 1s step-end infinite; }
      `}</style>
    </span>
  );
}
