/**
 * Streaming version of the planner. Same prompt + tools as `generatePlan`,
 * but yields incremental events derived from the partial JSON delta as it
 * arrives. The caller (the SSE route) translates these into events for the
 * generation UI.
 *
 * Two layers of events are yielded:
 *
 *   - "raw" structural events: `summary`, `step_started`, `step_tools`,
 *     `step_rationale_delta`, `step_code_delta`, `step_done`.
 *     These drive the right-panel skeleton + streaming fields.
 *
 *   - "feed" lines: short narration like "Selected: neon" or "Building
 *     step 2: Provision database". These drive the left-panel decision feed.
 *
 *   - terminal: `complete` carries the final validated Plan. `failed`
 *     carries an error.
 */
import Anthropic from "@anthropic-ai/sdk";
import {
  PLAN_TOOL_NAME,
  PLAN_TOOL_SCHEMA,
  PLANNER_MODEL,
  PLANNER_SYSTEM_PROMPT,
  buildPlannerUserMessage,
  type DirectoryToolForPlanner,
} from "./planner-prompt";
import { parsePartialJson } from "./partial-json";
import type { Plan, PlanStep, PlanToolRef } from "./plan-types";
import { PlanValidationError, validatePlan } from "./plan-validator";

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

// ---- event types ----------------------------------------------------------

export type StreamEvent =
  | { type: "phase"; phase: PlanPhase }
  | { type: "feed"; line: string }
  | { type: "summary"; summary: string }
  | { type: "totals"; minutes?: number; cost?: number }
  | {
      type: "step_started";
      step_number: number;
      title: string;
    }
  | {
      type: "step_tools";
      step_number: number;
      tools: PlanToolRef[];
    }
  | {
      type: "step_rationale_delta";
      step_number: number;
      rationale: string;
    }
  | {
      type: "step_code_delta";
      step_number: number;
      code: string;
      language?: string;
    }
  | {
      type: "step_setup_commands";
      step_number: number;
      commands: string[];
    }
  | {
      type: "step_alternatives";
      step_number: number;
      alternatives: Array<{ name: string; rejected_because: string }>;
    }
  | { type: "step_done"; step_number: number }
  | { type: "complete"; plan: Plan }
  | { type: "failed"; message: string };

export type PlanPhase =
  | "analyzing"
  | "selecting"
  | "building"
  | "finalizing";

// ---- main stream ----------------------------------------------------------

export async function* streamPlan(args: {
  goal: string;
  directorySubset: DirectoryToolForPlanner[];
  preferencesBlock?: string;
  clarifications?: Array<{ question: string; answer: string }>;
}): AsyncGenerator<StreamEvent, void, unknown> {
  const client = getClient();
  const userMessage = buildPlannerUserMessage(args);

  yield { type: "phase", phase: "selecting" };
  yield {
    type: "feed",
    line: `Reviewing ${args.directorySubset.length} directory tools for fit`,
  };

  const stream = client.messages.stream({
    model: PLANNER_MODEL,
    max_tokens: 8192,
    system: PLANNER_SYSTEM_PROMPT,
    tools: [
      {
        name: PLAN_TOOL_NAME,
        description:
          "Emit the structured plan. This is the only way to respond.",
        input_schema:
          PLAN_TOOL_SCHEMA as unknown as Anthropic.Tool["input_schema"],
      },
    ],
    tool_choice: { type: "tool", name: PLAN_TOOL_NAME },
    messages: [{ role: "user", content: userMessage }],
  });

  // Buffer of accumulated tool-use input JSON.
  let buffer = "";
  // Tracker holds the diff state — what we've already emitted vs what's
  // newly visible in the latest partial parse.
  const tracker = new EmissionTracker();
  // Heuristic: emit "building" phase the first time we see a step.
  let buildingEmitted = false;

  for await (const event of stream) {
    if (
      event.type === "content_block_start" &&
      event.content_block.type === "tool_use"
    ) {
      yield { type: "phase", phase: "building" };
      yield { type: "feed", line: "Drafting plan structure" };
    }
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "input_json_delta"
    ) {
      buffer += event.delta.partial_json;
      const parsed = parsePartialJson(buffer);
      if (parsed && typeof parsed === "object") {
        if (!buildingEmitted) {
          buildingEmitted = true;
        }
        yield* tracker.emitDiff(parsed as Record<string, unknown>);
      }
    }
  }

  // Stream done — get the final message and validate.
  const final = await stream.finalMessage();
  const toolUse = final.content.find(
    (b): b is Anthropic.ToolUseBlock =>
      b.type === "tool_use" && b.name === PLAN_TOOL_NAME,
  );
  if (!toolUse) {
    yield {
      type: "failed",
      message: "Planner did not emit a plan via emit_plan.",
    };
    return;
  }

  const plan = toolUse.input as Plan;
  try {
    validatePlan(plan);
  } catch (err) {
    if (err instanceof PlanValidationError) {
      yield { type: "failed", message: err.message };
      return;
    }
    throw err;
  }

  yield { type: "phase", phase: "finalizing" };
  yield { type: "feed", line: "Plan ready" };
  yield { type: "complete", plan };
}

// ---- emission tracker -----------------------------------------------------

/**
 * Diffs successive partial-parsed snapshots of the plan and yields events
 * for each newly-visible piece. Holds the *last emitted* state so the
 * caller doesn't see duplicates.
 *
 * Streaming behaviors:
 *  - summary: emit once, when present.
 *  - steps[i].title: emit `step_started` when title first appears.
 *  - steps[i].tools: re-emit `step_tools` whenever the array length grows
 *    or any tool gains its core fields (slug+role+proposed_tool).
 *  - steps[i].rationale: emit deltas as the string grows.
 *  - steps[i].code: emit deltas as the string grows.
 *  - steps[i].setup_commands: emit when new entries appear.
 *  - steps[i].alternatives_considered: emit when new entries appear.
 *  - steps[i].trust_signal: triggers `step_done` (last field per step in
 *    the schema, so it being present means the step is finalized).
 */
class EmissionTracker {
  private summaryEmitted = false;
  private totalsEmitted = false;
  private perStep = new Map<
    number,
    {
      titleEmitted: boolean;
      toolCount: number;
      lastToolsHash: string;
      rationaleEmittedLen: number;
      codeEmittedLen: number;
      setupEmittedCount: number;
      altsEmittedCount: number;
      doneEmitted: boolean;
    }
  >();

  *emitDiff(plan: Record<string, unknown>): Generator<StreamEvent> {
    if (
      !this.summaryEmitted &&
      typeof plan.summary === "string" &&
      plan.summary.length > 0
    ) {
      this.summaryEmitted = true;
      yield { type: "summary", summary: plan.summary };
    }

    if (
      !this.totalsEmitted &&
      typeof plan.estimated_time_minutes === "number" &&
      typeof plan.estimated_monthly_cost_usd === "number"
    ) {
      this.totalsEmitted = true;
      yield {
        type: "totals",
        minutes: plan.estimated_time_minutes as number,
        cost: plan.estimated_monthly_cost_usd as number,
      };
    }

    const steps = plan.steps;
    if (!Array.isArray(steps)) return;

    for (const stepRaw of steps) {
      if (!stepRaw || typeof stepRaw !== "object") continue;
      const step = stepRaw as Partial<PlanStep>;
      const n = step.step_number;
      if (typeof n !== "number") continue;

      let s = this.perStep.get(n);
      if (!s) {
        s = {
          titleEmitted: false,
          toolCount: 0,
          lastToolsHash: "",
          rationaleEmittedLen: 0,
          codeEmittedLen: 0,
          setupEmittedCount: 0,
          altsEmittedCount: 0,
          doneEmitted: false,
        };
        this.perStep.set(n, s);
      }

      // Title — emit once when non-empty.
      if (!s.titleEmitted && typeof step.title === "string" && step.title) {
        s.titleEmitted = true;
        yield { type: "step_started", step_number: n, title: step.title };
        yield {
          type: "feed",
          line: `Building step ${n}: ${step.title}`,
        };
      }

      // Tools — re-emit when set of complete tool refs grows.
      if (Array.isArray(step.tools)) {
        // Only consider "complete" tool refs (have slug+role+proposed_tool).
        const complete = step.tools.filter(
          (t): t is PlanToolRef =>
            !!t &&
            typeof (t as PlanToolRef).slug === "string" &&
            typeof (t as PlanToolRef).role === "string" &&
            typeof (t as PlanToolRef).proposed_tool === "boolean",
        );
        const hash = complete
          .map((t) => `${t.slug}|${t.role}|${t.status ?? ""}`)
          .join(",");
        if (
          (complete.length > s.toolCount || hash !== s.lastToolsHash) &&
          complete.length > 0
        ) {
          // Feed line for newly-added tools only. Trim long roles —
          // the role is sometimes a full sentence, which is too noisy
          // for the terminal-style feed.
          for (let i = s.toolCount; i < complete.length; i++) {
            const role = complete[i].role;
            const shortRole =
              role.length > 50 ? role.slice(0, 47).trimEnd() + "…" : role;
            yield {
              type: "feed",
              line: `Selected: ${complete[i].slug} — ${shortRole}`,
            };
          }
          s.toolCount = complete.length;
          s.lastToolsHash = hash;
          yield { type: "step_tools", step_number: n, tools: complete };
        }
      }

      // Rationale — stream deltas.
      if (typeof step.rationale === "string") {
        const cur = step.rationale;
        if (cur.length > s.rationaleEmittedLen) {
          // Avoid emitting if we somehow shrank (shouldn't happen).
          yield {
            type: "step_rationale_delta",
            step_number: n,
            rationale: cur,
          };
          s.rationaleEmittedLen = cur.length;
        }
      }

      // Code — stream deltas.
      if (typeof step.code === "string") {
        const cur = step.code;
        if (cur.length > s.codeEmittedLen) {
          yield {
            type: "step_code_delta",
            step_number: n,
            code: cur,
            language:
              typeof step.language === "string" ? step.language : undefined,
          };
          s.codeEmittedLen = cur.length;
        }
      }

      // Setup commands.
      if (Array.isArray(step.setup_commands)) {
        const arr = step.setup_commands.filter(
          (c): c is string => typeof c === "string" && c.length > 0,
        );
        if (arr.length > s.setupEmittedCount) {
          s.setupEmittedCount = arr.length;
          yield {
            type: "step_setup_commands",
            step_number: n,
            commands: arr,
          };
        }
      }

      // Alternatives.
      if (Array.isArray(step.alternatives_considered)) {
        const arr = step.alternatives_considered.filter(
          (a) =>
            a &&
            typeof a === "object" &&
            typeof (a as { name?: unknown }).name === "string" &&
            typeof (a as { rejected_because?: unknown })
              .rejected_because === "string",
        ) as Array<{ name: string; rejected_because: string }>;
        if (arr.length > s.altsEmittedCount) {
          s.altsEmittedCount = arr.length;
          yield {
            type: "step_alternatives",
            step_number: n,
            alternatives: arr,
          };
        }
      }

      // trust_signal is the last required field — its presence means the
      // step is fully formed.
      if (
        !s.doneEmitted &&
        typeof step.trust_signal === "string" &&
        step.trust_signal
      ) {
        s.doneEmitted = true;
        yield { type: "step_done", step_number: n };
      }
    }
  }
}
