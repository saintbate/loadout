// The Loadout planner prompt. This is the contract between the user's goal
// and a structured plan-view recipe. Tuning the planner shouldn't require
// touching call sites — only edits to this file.
//
// The PLAN_TOOL_SCHEMA below is passed to Anthropic as the input_schema of
// a tool named `emit_plan`. With tool_choice forced to that tool, the model
// must emit JSON matching this shape.

export const PLANNER_MODEL = "claude-sonnet-4-6";

export const PLAN_TOOL_NAME = "emit_plan";

export const PLAN_TOOL_SCHEMA = {
  type: "object",
  required: [
    "summary",
    "estimated_time_minutes",
    "estimated_monthly_cost_usd",
    "steps",
  ],
  properties: {
    summary: {
      type: "string",
      description: "One-sentence description of what this build does.",
    },
    estimated_time_minutes: { type: "integer", minimum: 0 },
    estimated_monthly_cost_usd: { type: "number", minimum: 0 },
    steps: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: [
          "step_number",
          "title",
          "tools",
          "rationale",
          "trust_signal",
        ],
        properties: {
          step_number: { type: "integer", minimum: 1 },
          title: { type: "string" },
          tools: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              required: ["slug", "role", "proposed_tool"],
              properties: {
                slug: {
                  type: "string",
                  description:
                    "Lowercase-kebab identifier. Must match a known tool slug from the provided directory unless proposed_tool is true.",
                },
                role: {
                  type: "string",
                  description: "What this tool does in this step.",
                },
                proposed_tool: {
                  type: "boolean",
                  description:
                    "True if this tool is NOT in the provided directory and you are suggesting it for inclusion.",
                },
                proposed_homepage_url: {
                  type: "string",
                  description: "Required when proposed_tool is true.",
                },
                proposed_kind: {
                  type: "string",
                  enum: [
                    "mcp_server",
                    "cli",
                    "api",
                    "library",
                    "sdk",
                    "service",
                  ],
                  description: "Required when proposed_tool is true.",
                },
                status: {
                  type: "string",
                  enum: [
                    "discovered",
                    "unverified",
                    "available",
                    "verified",
                    "featured",
                    "deprecated",
                    "not_in_directory",
                  ],
                  description:
                    "Trust-ladder status of this tool. Copy from the directory entry verbatim. For proposed_tool=true, set 'not_in_directory'.",
                },
                preference_match: {
                  type: "boolean",
                  description:
                    "Set true if this tool was chosen specifically because it matches a stated USER PREFERENCE.",
                },
                preference_override: {
                  type: "object",
                  required: ["preferred", "chosen", "reason"],
                  properties: {
                    preferred: { type: "string" },
                    chosen: { type: "string" },
                    reason: { type: "string" },
                  },
                  description:
                    "Set when you override a stated USER PREFERENCE. preferred = the preferred tool slug/name, chosen = the slug you picked, reason = a one-sentence technical justification.",
                },
              },
            },
          },
          rationale: {
            type: "string",
            description:
              "Why these tool choices for this step. Concrete and specific — cite features, maturity, ecosystem fit. 1-3 sentences.",
          },
          alternatives_considered: {
            type: "array",
            items: {
              type: "object",
              required: ["name", "rejected_because"],
              properties: {
                name: { type: "string" },
                rejected_because: { type: "string" },
              },
            },
          },
          code: {
            type: "string",
            description: "Working code snippet. Empty string if not applicable.",
          },
          language: {
            type: "string",
            description:
              "Language hint for syntax highlighting (e.g. python, typescript, bash, json). Empty string if no code.",
          },
          setup_commands: {
            type: "array",
            items: { type: "string" },
          },
          trust_signal: {
            type: "string",
            enum: ["verified", "untested", "proposed"],
            description:
              "Step-level trust. verified = every tool in this step has status>=available AND is in the directory. untested = at least one tool is unverified or discovered. proposed = at least one tool is proposed_tool=true.",
          },
        },
      },
    },
    open_questions: {
      type: "array",
      items: { type: "string" },
      description:
        "Genuinely undecidable items the user must confirm before / during implementation (e.g. 'Confirm with stakeholders that…'). Do NOT use this for clarifying questions about scope/architecture — those are asked up front via the clarifier. Empty array if there are no genuine open items.",
    },
  },
} as const;

// ---- system prompt ---------------------------------------------------------

export const PLANNER_SYSTEM_PROMPT = `You are the Loadout planner. You take a builder's goal — a sentence or paragraph describing what they want to build — and produce a step-by-step plan-view recipe that selects specific AI tools (MCP servers, CLIs, APIs, libraries, SDKs, services) and justifies each choice.

# Your job
1. Read the goal (and any clarifying answers) and decompose it into the smallest sensible set of ordered steps. Most goals are 3-7 steps. Don't pad.
2. For each step, pick the tool(s) that best fit. Prefer tools from the provided directory. If nothing in the directory fits, propose a new one (set proposed_tool: true) and provide its homepage_url and kind.
3. Justify every tool choice concretely — name features, maturity signals, ecosystem fit, integration ease. Avoid generic praise ("popular", "widely used") unless you can cite a specific reason.
4. For every step that involves a non-trivial decision, include at least one alternatives_considered entry with a real reason it was rejected. Skip alternatives only for trivially obvious choices.
5. Provide working code or commands when useful. The user should be able to copy-paste and run. Use the language idiomatic to the chosen tools, and set the language field accordingly.
6. Estimate total time and monthly cost realistically. Time is wall-clock to working prototype, not engineering effort. Cost assumes a SOLO USER, LOW TRAFFIC baseline; call out if costs scale aggressively beyond that.

# Trust ladder
The directory ranks tools on a trust ladder. Prefer tools higher on the ladder when more than one fits:

  featured > verified > available > unverified

Skip 'deprecated' entirely. Skip 'discovered' entirely (those haven't been reviewed yet — pretend they don't exist). When picking between two tools, ties go to the higher-status one.

For each tool entry, set 'status' to whatever the directory says (copy verbatim from the directory listing). For proposed tools, set status='not_in_directory'.

For each step, set 'trust_signal':
- "verified": every tool in this step is in the directory AND has status in {available, verified, featured}.
- "untested": at least one tool is in the directory but is 'unverified' or 'discovered'.
- "proposed": at least one tool in this step is proposed_tool=true.

# User preferences
If a USER PREFERENCES block is provided, the user has stated their preferred tool for certain categories (database, orm, llm_provider, etc.). Respect those preferences unless there's a specific technical reason to override.

When you pick a tool because it matches a preference, set 'preference_match': true on that tool entry.

When you override a preference, you MUST:
  1. Pick the override deliberately, not by accident.
  2. Set 'preference_override': { preferred: "<their preferred slug or name>", chosen: "<your chosen slug>", reason: "<one technical sentence>" }.
  3. Mention the override in the step's rationale text too.

If a user preference would clearly conflict with the goal (e.g., they prefer Stripe but the goal is a cash-only app), prefer the goal — but explain via preference_override.

# Hard rules
- ONLY return the structured plan via the emit_plan tool. No prose, no markdown, no code fences in your response — code goes inside the structured "code" field.
- slug must be lowercase-kebab and stable. If the tool is in the directory, use the directory's slug verbatim.
- proposed_tool=true REQUIRES proposed_homepage_url and proposed_kind, and status='not_in_directory'.
- Never invent a directory tool. If a tool isn't in the provided list, it must be proposed_tool=true.
- Steps are 1-indexed and contiguous.
- open_questions: ONLY genuinely undecidable items (e.g. "Confirm with stakeholders…", "Verify the API token has access to the org's repos"). Do NOT use it for things you could have asked up front. For a clear goal with no real open items, return [].

# Style
- Concrete over generic. "PyGithub handles ETag-based rate limiting transparently" beats "PyGithub is popular".
- Brief. Each rationale is 1-3 sentences. Each alternatives_considered.rejected_because is one sentence.
- Code blocks are minimal but runnable — imports, the key call, a sane example. Not full applications.
`;

// ---- user-turn builder -----------------------------------------------------

export type DirectoryToolForPlanner = {
  slug: string;
  name: string;
  kind: string;
  status: string;
  description: string | null;
  category_tags: string[];
  capabilities: string[];
};

export function buildPlannerUserMessage(args: {
  goal: string;
  directorySubset: DirectoryToolForPlanner[];
  /** Pre-formatted "USER PREFERENCES: …" block from lib/preferences.ts. Empty string if none. */
  preferencesBlock?: string;
  /** Q/A pairs from /clarify, if any. */
  clarifications?: Array<{ question: string; answer: string }>;
}): string {
  const dir = args.directorySubset.length
    ? args.directorySubset
        .map(
          (t) =>
            `- ${t.slug} (${t.kind}, status=${t.status}) — ${t.name}: ${t.description ?? ""}\n  tags: [${t.category_tags.join(", ")}]\n  capabilities: [${t.capabilities.join("; ")}]`,
        )
        .join("\n")
    : "(no directory matches — propose tools as needed, with proposed_tool=true)";

  const prefs = args.preferencesBlock?.trim()
    ? `\n\n# ${args.preferencesBlock}`
    : "";

  const clarifications =
    args.clarifications && args.clarifications.length > 0
      ? "\n\n# Clarifications (Q/A from the user)\n" +
        args.clarifications
          .map(
            (c, i) =>
              `Q${i + 1}: ${c.question}\nA${i + 1}: ${c.answer || "(no preference)"}`,
          )
          .join("\n")
      : "";

  return `# Goal
${args.goal}${clarifications}${prefs}

# Directory subset (tools available for selection)
${dir}

Produce the plan now via the emit_plan tool.`;
}
