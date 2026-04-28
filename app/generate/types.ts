/**
 * Client-side types for the generation screen. Mirrors the SSE wire
 * events emitted by /api/plan-stream.
 */
import type { PlanToolRef } from "@/lib/plan-types";

export type ServerEvent =
  | { type: "phase"; phase: "analyzing" | "selecting" | "building" | "finalizing" }
  | { type: "feed"; line: string }
  | { type: "summary"; summary: string }
  | { type: "totals"; minutes?: number; cost?: number }
  | { type: "step_started"; step_number: number; title: string }
  | { type: "step_tools"; step_number: number; tools: PlanToolRef[] }
  | { type: "step_rationale_delta"; step_number: number; rationale: string }
  | {
      type: "step_code_delta";
      step_number: number;
      code: string;
      language?: string;
    }
  | { type: "step_setup_commands"; step_number: number; commands: string[] }
  | {
      type: "step_alternatives";
      step_number: number;
      alternatives: Array<{ name: string; rejected_because: string }>;
    }
  | { type: "step_done"; step_number: number }
  | { type: "clarify"; slug: string }
  | { type: "done"; slug: string }
  | { type: "failed"; message: string };

/** Per-step state we accumulate from the stream. */
export type StreamingStep = {
  step_number: number;
  title: string;
  tools: PlanToolRef[];
  rationale: string;
  code: string;
  language?: string;
  setup_commands: string[];
  alternatives: Array<{ name: string; rejected_because: string }>;
  done: boolean;
};

/** Payload the client stuffs into sessionStorage before navigating. */
export type GenPayload = {
  goal?: string;
  draftSlug?: string;
  clarifications?: Array<{ question: string; answer: string }>;
};

export const GEN_STORAGE_KEY = "loadout:gen";
