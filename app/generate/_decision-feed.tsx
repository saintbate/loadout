"use client";

import { useEffect, useRef } from "react";

type FeedItem = { id: number; line: string };

/**
 * Left-panel decision feed. Each line fades in from below, with older
 * lines fading out so the most recent stays prominent. Monospace, dark.
 *
 * Auto-scrolls to keep the latest line visible.
 */
export function DecisionFeed({
  items,
  phase,
}: {
  items: FeedItem[];
  phase: "analyzing" | "selecting" | "building" | "finalizing";
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [items.length]);

  const phaseLabel = {
    analyzing: "Analyzing",
    selecting: "Selecting",
    building: "Building",
    finalizing: "Finalizing",
  }[phase];

  return (
    <aside className="flex h-full flex-col bg-neutral-950 text-neutral-300">
      <div className="border-b border-neutral-800 px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
          planner
        </p>
        <p className="mt-0.5 flex items-center gap-2 font-mono text-xs">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          {phaseLabel}
        </p>
      </div>
      <div
        ref={scrollerRef}
        className="flex-1 space-y-1 overflow-y-auto px-4 py-3 font-mono text-[11px] leading-relaxed"
      >
        {items.map((item, i) => {
          const distance = items.length - 1 - i;
          // Fade older lines: 100% for last, 90, 75, 60, 45 for 4 back.
          const opacity =
            distance === 0
              ? 1
              : distance === 1
                ? 0.7
                : distance === 2
                  ? 0.5
                  : distance === 3
                    ? 0.35
                    : 0.25;
          return (
            <div
              key={item.id}
              style={{ opacity }}
              className="animate-feed-in transition-opacity duration-700"
            >
              <span className="text-neutral-600">›</span>{" "}
              <span className="text-neutral-300">{item.line}</span>
            </div>
          );
        })}
      </div>
      <style>{`
        @keyframes feed-in {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: var(--tw-opacity, 1); transform: none; }
        }
        .animate-feed-in {
          animation: feed-in 240ms ease-out both;
        }
      `}</style>
    </aside>
  );
}
