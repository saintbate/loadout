import type { Plan } from "./plan-types";

export class PlanValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanValidationError";
  }
}

/**
 * Runtime validation of plan_json shape. Used by:
 *   - the planner (lib/anthropic.ts) to verify Claude's tool-use output
 *   - the /submit JSON-paste path to verify user-supplied JSON
 */
export function validatePlan(plan: unknown): asserts plan is Plan {
  if (!plan || typeof plan !== "object") {
    throw new PlanValidationError("Plan is not an object");
  }
  const p = plan as Partial<Plan>;
  if (typeof p.summary !== "string" || !p.summary.trim()) {
    throw new PlanValidationError("Plan.summary missing or empty");
  }
  if (typeof p.estimated_time_minutes !== "number") {
    throw new PlanValidationError("Plan.estimated_time_minutes missing");
  }
  if (typeof p.estimated_monthly_cost_usd !== "number") {
    throw new PlanValidationError("Plan.estimated_monthly_cost_usd missing");
  }
  if (!Array.isArray(p.steps) || p.steps.length === 0) {
    throw new PlanValidationError("Plan.steps must be a non-empty array");
  }
  for (const step of p.steps) {
    if (
      typeof step.step_number !== "number" ||
      !step.title ||
      !step.rationale
    ) {
      throw new PlanValidationError("Plan step missing required fields");
    }
    if (!Array.isArray(step.tools) || step.tools.length === 0) {
      throw new PlanValidationError(`Step ${step.step_number} has no tools`);
    }
    for (const t of step.tools) {
      if (!t.slug || !t.role || typeof t.proposed_tool !== "boolean") {
        throw new PlanValidationError(
          `Step ${step.step_number} tool ref malformed: ${JSON.stringify(t)}`,
        );
      }
      if (
        t.proposed_tool &&
        (!t.proposed_homepage_url || !t.proposed_kind)
      ) {
        throw new PlanValidationError(
          `Step ${step.step_number} proposed tool ${t.slug} missing homepage_url/kind`,
        );
      }
      if (t.preference_override) {
        const o = t.preference_override;
        if (!o.preferred || !o.chosen || !o.reason) {
          throw new PlanValidationError(
            `Step ${step.step_number} preference_override on ${t.slug} missing fields`,
          );
        }
      }
    }
    const valid = ["verified", "untested", "proposed"];
    if (step.trust_signal && !valid.includes(step.trust_signal)) {
      throw new PlanValidationError(
        `Step ${step.step_number} trust_signal invalid`,
      );
    }
  }
}
