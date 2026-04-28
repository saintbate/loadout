"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  GEN_STORAGE_KEY,
  type GenPayload,
  type ServerEvent,
  type StreamingStep,
} from "./types";
import { GhostStepCard, StreamingStepCard } from "./_streaming-step-card";

const GHOST_COUNT = 4;

/**
 * Read the generation payload from sessionStorage exactly once — in the
 * useState lazy initialiser, which is synchronous and fires before any
 * effects. This survives React Strict Mode's double-effect invocation:
 * the second effect run still sees the payload (it's in state), so the
 * stream restarts cleanly after the first one is aborted by cleanup.
 */
function readPayload(): GenPayload | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(GEN_STORAGE_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(GEN_STORAGE_KEY);
  try {
    return JSON.parse(raw) as GenPayload;
  } catch {
    return null;
  }
}

export function GenerationScreen() {
  const router = useRouter();

  // Payload is read exactly once, synchronously, at component creation.
  const [payload] = useState<GenPayload | null>(readPayload);

  const [summary, setSummary] = useState("");
  const [steps, setSteps] = useState<StreamingStep[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function handleEvent(event: ServerEvent) {
    switch (event.type) {
      case "phase":
      case "feed":
      case "totals":
        // Feed/phase events are no-ops now that the side panel is removed.
        break;
      case "summary":
        setSummary(event.summary);
        break;
      case "step_started":
        setSteps((prev) =>
          upsertStep(prev, event.step_number, (s) => ({
            ...s,
            title: event.title,
          })),
        );
        break;
      case "step_tools":
        setSteps((prev) =>
          upsertStep(prev, event.step_number, (s) => ({
            ...s,
            tools: event.tools,
          })),
        );
        break;
      case "step_rationale_delta":
        setSteps((prev) =>
          upsertStep(prev, event.step_number, (s) => ({
            ...s,
            rationale: event.rationale,
          })),
        );
        break;
      case "step_code_delta":
        setSteps((prev) =>
          upsertStep(prev, event.step_number, (s) => ({
            ...s,
            code: event.code,
            language: event.language ?? s.language,
          })),
        );
        break;
      case "step_setup_commands":
        setSteps((prev) =>
          upsertStep(prev, event.step_number, (s) => ({
            ...s,
            setup_commands: event.commands,
          })),
        );
        break;
      case "step_alternatives":
        setSteps((prev) =>
          upsertStep(prev, event.step_number, (s) => ({
            ...s,
            alternatives: event.alternatives,
          })),
        );
        break;
      case "step_done":
        setSteps((prev) =>
          upsertStep(prev, event.step_number, (s) => ({
            ...s,
            done: true,
          })),
        );
        break;
      case "clarify":
        router.replace(`/clarify/${event.slug}`);
        break;
      case "done":
        setDone(true);
        window.setTimeout(() => {
          router.replace(`/recipe/${event.slug}`);
        }, 200);
        break;
      case "failed":
        setError(event.message);
        break;
    }
  }

  // Redirect immediately if there's no payload (direct navigation / refresh).
  useEffect(() => {
    if (!payload) {
      router.replace("/");
    }
  }, [payload, router]);

  // Stream effect. Runs (and re-runs) cleanly: cleanup aborts the
  // previous fetch, and the next invocation starts a fresh one. In
  // React Strict Mode (dev) this fires twice — first run is aborted,
  // second completes normally. In production it fires once.
  useEffect(() => {
    if (!payload) return;

    const controller = new AbortController();

    void runStream({
      payload,
      signal: controller.signal,
      onEvent: handleEvent,
      onError: (msg) => setError(msg),
    });

    return () => {
      controller.abort();
    };
    // payload is stable (set once from sessionStorage); handleEvent is
    // defined inline so listing it would cause an infinite loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload]);

  const visibleGhosts =
    error || done ? 0 : Math.max(0, GHOST_COUNT - steps.length);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-neutral-50 px-6 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
            {done ? "ready" : "generating plan"}
          </p>
          <h1
            className={cn(
              "min-h-[1.6em] text-2xl font-semibold tracking-tight",
              summary ? "text-neutral-900" : "text-neutral-300",
            )}
          >
            {summary || "Reading your goal…"}
          </h1>
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            <p className="font-medium">Plan generation failed.</p>
            <p className="mt-1 text-red-800">{error}</p>
            <button
              type="button"
              onClick={() => router.replace("/")}
              className="mt-3 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
            >
              Back to start
            </button>
          </div>
        )}

        <ol className="space-y-4">
          {steps
            .slice()
            .sort((a, b) => a.step_number - b.step_number)
            .map((step) => (
              <StreamingStepCard key={step.step_number} step={step} />
            ))}
          {Array.from({ length: visibleGhosts }).map((_, i) => (
            <GhostStepCard
              key={`ghost-${i}`}
              index={steps.length + i + 1}
            />
          ))}
        </ol>
      </div>
    </div>
  );
}

function upsertStep(
  prev: StreamingStep[],
  stepNumber: number,
  update: (existing: StreamingStep) => StreamingStep,
): StreamingStep[] {
  const idx = prev.findIndex((s) => s.step_number === stepNumber);
  if (idx === -1) {
    const fresh: StreamingStep = {
      step_number: stepNumber,
      title: "",
      tools: [],
      rationale: "",
      code: "",
      language: undefined,
      setup_commands: [],
      alternatives: [],
      done: false,
    };
    return [...prev, update(fresh)];
  }
  const next = prev.slice();
  next[idx] = update(prev[idx]);
  return next;
}

async function runStream(args: {
  payload: GenPayload;
  signal: AbortSignal;
  onEvent: (e: ServerEvent) => void;
  onError: (msg: string) => void;
}) {
  try {
    const res = await fetch("/api/plan-stream", {
      method: "POST",
      body: JSON.stringify(args.payload),
      headers: { "content-type": "application/json" },
      signal: args.signal,
    });
    if (!res.ok || !res.body) {
      args.onError(`HTTP ${res.status}: ${await res.text()}`);
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const chunk = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const dataLine = chunk
          .split("\n")
          .find((line) => line.startsWith("data: "));
        if (!dataLine) continue;
        try {
          const event = JSON.parse(dataLine.slice(6)) as ServerEvent;
          args.onEvent(event);
        } catch (err) {
          console.warn("[generate] bad event line", dataLine, err);
        }
      }
    }
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    args.onError(err instanceof Error ? err.message : "Stream failed");
  }
}
