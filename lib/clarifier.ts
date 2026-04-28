import Anthropic from "@anthropic-ai/sdk";

// The clarifier only needs to output a boolean + a few strings — Haiku is
// fast enough (typically <1s) and much cheaper than Sonnet for this task.
const CLARIFIER_MODEL = "claude-haiku-4-5";

/**
 * "Clarifier" pre-step. Decides whether the goal is ambiguous enough that
 * the planner needs answers before it can pick tools/architecture, and if so
 * returns 2-5 questions whose answers would meaningfully change the plan.
 *
 * Uses tool-use with a forced tool to get structured JSON, same pattern as
 * the planner.
 */

const CLARIFY_TOOL_NAME = "emit_clarification_decision";

const CLARIFY_TOOL_SCHEMA = {
  type: "object",
  required: ["needs_clarification", "questions"],
  properties: {
    needs_clarification: {
      type: "boolean",
      description:
        "True ONLY if at least one question would meaningfully change tool selection or architecture.",
    },
    questions: {
      type: "array",
      maxItems: 5,
      items: { type: "string" },
      description:
        "Empty array if needs_clarification is false. Otherwise 2-5 questions.",
    },
  },
} as const;

const CLARIFY_SYSTEM = `You are the Loadout clarifier. Your job is to decide whether a builder's goal needs clarification before a tools-and-architecture plan can be generated.

Ask questions ONLY when the answer would change tool selection or architecture in a concrete way.

GOOD clarifying questions (ask these):
- "Will users need real-time collaboration?" — changes db/infra (Postgres+Realtime vs plain CRUD).
- "On-prem or cloud deployment?" — eliminates managed services.
- "What's the expected daily volume of inputs?" — changes batch vs streaming.
- "Self-hosted, SaaS, or both?" — changes auth/payment/distribution choices.
- "Will this run as a background job, an interactive UI, a CLI?" — changes runtime stack.

BAD clarifying questions (skip these):
- "What should the UI look like?" — Loadout doesn't pick UI design.
- "What's your budget?" — costs are reported in the plan, not asked up front.
- "Which programming language do you prefer?" — that's a preference, fetched from the user's settings.
- "Do you have a database already?" — preference, not architecture.
- Anything that just rewords the goal.
- Anything trivially answerable from the goal text itself.

Default to NOT asking. If the goal is reasonably specific, return needs_clarification=false. Most goals (60-80%) shouldn't need clarification.

When you DO ask: 2-5 questions. Each one short and pointed. Return them in priority order — the most-impactful question first.

Output ONLY via the emit_clarification_decision tool.`;

export type ClarifierResult = {
  needs_clarification: boolean;
  questions: string[];
};

export async function checkForClarification(
  goal: string,
): Promise<ClarifierResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    // If no API key, skip clarification entirely.
    return { needs_clarification: false, questions: [] };
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: CLARIFIER_MODEL,
    max_tokens: 1024,
    system: CLARIFY_SYSTEM,
    tools: [
      {
        name: CLARIFY_TOOL_NAME,
        description:
          "Emit the clarification decision. This is the only way to respond.",
        input_schema:
          CLARIFY_TOOL_SCHEMA as unknown as Anthropic.Tool["input_schema"],
      },
    ],
    tool_choice: { type: "tool", name: CLARIFY_TOOL_NAME },
    messages: [
      {
        role: "user",
        content: `# Goal\n${goal}\n\nDecide whether to ask clarifying questions, via the emit_clarification_decision tool.`,
      },
    ],
  });

  const block = response.content.find(
    (b): b is Anthropic.ToolUseBlock =>
      b.type === "tool_use" && b.name === CLARIFY_TOOL_NAME,
  );
  if (!block) {
    return { needs_clarification: false, questions: [] };
  }
  const data = block.input as ClarifierResult;
  // Defensive: enforce upper bound and trim.
  const qs = (data.questions ?? [])
    .filter((q): q is string => typeof q === "string" && q.trim().length > 0)
    .map((q) => q.trim())
    .slice(0, 5);
  return {
    needs_clarification: Boolean(data.needs_clarification) && qs.length > 0,
    questions: qs,
  };
}
