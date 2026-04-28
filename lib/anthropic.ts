import Anthropic from "@anthropic-ai/sdk";
import {
  PLAN_TOOL_NAME,
  PLAN_TOOL_SCHEMA,
  PLANNER_MODEL,
  PLANNER_SYSTEM_PROMPT,
  buildPlannerUserMessage,
  type DirectoryToolForPlanner,
} from "./planner-prompt";
import type { Plan } from "./plan-types";
import { PlanValidationError, validatePlan } from "./plan-validator";

if (!process.env.ANTHROPIC_API_KEY) {
  // Don't throw at import — only when the planner is actually called.
  // Lets the rest of the app build without this env var.
}

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

export class PlannerError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "PlannerError";
  }
}

export async function generatePlan(args: {
  goal: string;
  directorySubset: DirectoryToolForPlanner[];
  preferencesBlock?: string;
  clarifications?: Array<{ question: string; answer: string }>;
}): Promise<Plan> {
  const client = getClient();

  const baseUserMessage = buildPlannerUserMessage(args);

  /**
   * @param retryNote   Extra instructions to glue onto the user message on
   *                    a retry — e.g. "your previous attempt returned an
   *                    empty steps array; emit at least one step".
   */
  const callOnce = async (retryNote?: string): Promise<Plan> => {
    const userMessage = retryNote
      ? `${baseUserMessage}\n\n# Retry note\n${retryNote}`
      : baseUserMessage;

    const response = await client.messages.create({
      model: PLANNER_MODEL,
      // 4096 tokens was tight for plans with code samples + alternatives.
      // 8192 fits ~6 step plans comfortably.
      max_tokens: 8192,
      system: PLANNER_SYSTEM_PROMPT,
      tools: [
        {
          name: PLAN_TOOL_NAME,
          description:
            "Emit the structured plan. This is the only way to respond.",
          // Cast: SDK's Tool.input_schema typing is loose; our schema is valid JSON Schema.
          input_schema:
            PLAN_TOOL_SCHEMA as unknown as Anthropic.Tool["input_schema"],
        },
      ],
      tool_choice: { type: "tool", name: PLAN_TOOL_NAME },
      messages: [{ role: "user", content: userMessage }],
    });

    if (response.stop_reason === "max_tokens") {
      console.warn(
        "[planner] hit max_tokens — output may be truncated",
        { usage: response.usage },
      );
    }

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock =>
        block.type === "tool_use" && block.name === PLAN_TOOL_NAME,
    );
    if (!toolUse) {
      console.error(
        "[planner] no tool_use block in response",
        JSON.stringify(response.content).slice(0, 1000),
      );
      throw new PlannerError("Planner did not call emit_plan");
    }
    const plan = toolUse.input as Plan;
    try {
      validatePlan(plan);
    } catch (e) {
      if (e instanceof PlanValidationError) {
        // Log the actual returned payload so we can diagnose what Claude
        // emitted. Truncate to keep logs readable.
        console.error(
          "[planner] validation failed:",
          e.message,
          "\nreturned payload (truncated):",
          JSON.stringify(plan).slice(0, 2000),
        );
        throw new PlannerError(e.message, e);
      }
      throw e;
    }
    return plan;
  };

  try {
    return await callOnce();
  } catch (err) {
    if (err instanceof PlannerError) {
      // Targeted retry: tell the model exactly what went wrong so the
      // second attempt isn't a re-roll of the same coin.
      const note = err.message.includes("steps")
        ? "Your previous attempt returned an empty or missing 'steps' array. The plan MUST contain at least one step. If the goal is too vague, pick the most plausible interpretation and explain in step 1's rationale."
        : err.message.includes("trust_signal")
          ? "Your previous attempt was missing 'trust_signal' on a step. Set it on every step (verified | untested | proposed)."
          : `Your previous attempt failed validation: ${err.message}. Re-emit a complete plan that satisfies the schema.`;
      try {
        return await callOnce(note);
      } catch (retryErr) {
        throw new PlannerError(
          "Planner returned malformed output after retry",
          retryErr,
        );
      }
    }
    throw err;
  }
}
