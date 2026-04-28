// The shape of plan_json — matches what the planner emits via emit_plan.
// Stored verbatim in recipes.plan_json (jsonb).

export type PlannerToolKind =
  | "mcp_server"
  | "cli"
  | "api"
  | "library"
  | "sdk"
  | "service";

/**
 * Step-level trust ladder. Computed from the constituent tools' status.
 * (Step-level "proposed" was retired in the trust-ladder change — proposed
 * tools now show as a per-tool "?" indicator, and the recipe-level status
 * captures the worst case across all steps.)
 */
export type PlannerTrustSignal = "verified" | "untested" | "proposed";

/**
 * Tool's status in the directory at plan-emission time. Carried into
 * plan_json so the recipe view can render the right indicator dot even if
 * the tool's status changes later.
 *
 * "not_in_directory" means the planner proposed it (proposed_tool=true)
 * — there's no row in `tools` for it yet.
 */
export type PlanToolStatus =
  | "discovered"
  | "unverified"
  | "available"
  | "verified"
  | "featured"
  | "deprecated"
  | "not_in_directory";

export type PlanToolRef = {
  slug: string;
  role: string;
  proposed_tool: boolean;
  proposed_homepage_url?: string;
  proposed_kind?: PlannerToolKind;
  /**
   * Optional. If absent, the recipe view computes a fallback (`verified` for
   * directory tools, `not_in_directory` for proposed). Newer plans set this
   * explicitly so the trust dot reflects what the planner actually saw.
   */
  status?: PlanToolStatus;
  /**
   * True when this tool was selected because it matches the user's saved
   * preference for its category. UI shows "you prefer …" pill.
   */
  preference_match?: boolean;
  /**
   * Set when the planner overrode a user preference. UI shows a yellow note.
   */
  preference_override?: {
    preferred: string;
    chosen: string;
    reason: string;
  };
};

export type PlanAlternative = {
  name: string;
  rejected_because: string;
};

export type PlanStep = {
  step_number: number;
  title: string;
  tools: PlanToolRef[];
  rationale: string;
  alternatives_considered?: PlanAlternative[];
  code?: string;
  language?: string;
  setup_commands?: string[];
  trust_signal: PlannerTrustSignal;
};

export type Plan = {
  summary: string;
  estimated_time_minutes: number;
  estimated_monthly_cost_usd: number;
  steps: PlanStep[];
  open_questions?: string[];
};
