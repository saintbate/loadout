import { db } from "@/db/client";
import { recipeTools, recipes, tools } from "@/db/schema";
import { generatePlan, PlannerError } from "./anthropic";
import { findRelevantTools } from "./directory-filter";
import {
  formatPreferencesForPrompt,
  loadUserPreferences,
} from "./preferences";
import type { Plan } from "./plan-types";
import { recipeSlug } from "./slug";
import type { DirectoryToolForPlanner } from "./planner-prompt";

/**
 * Common path for "given a goal (and optional clarifications), produce a
 * plan and store it as a recipe". Used by the JSON-paste submit and the
 * legacy non-streaming path; the streaming SSE route uses
 * `gatherPlanningInputs` + `persistPlan` directly.
 *
 * Returns the new recipe row.
 */
export async function planAndPersist(args: {
  goal: string;
  clarifications?: Array<{ question: string; answer: string }>;
  contributorUserId: number | null;
}): Promise<{ slug: string; id: number }> {
  const inputs = await gatherPlanningInputs({
    goal: args.goal,
    contributorUserId: args.contributorUserId,
  });

  let plan: Plan;
  try {
    plan = await generatePlan({
      goal: args.goal,
      directorySubset: inputs.directorySubset,
      preferencesBlock: inputs.preferencesBlock,
      clarifications: args.clarifications,
    });
  } catch (err) {
    if (err instanceof PlannerError) throw err;
    throw new PlannerError("Planner failed", err);
  }

  return persistPlan({
    plan,
    goal: args.goal,
    directorySubset: inputs.directorySubset,
    contributorUserId: args.contributorUserId,
  });
}

/**
 * Pre-flight inputs the planner needs (directory subset + user prefs).
 * Pulled out so the streaming endpoint can run them once and pass the
 * same subset to the persistence step.
 */
export async function gatherPlanningInputs(args: {
  goal: string;
  contributorUserId: number | null;
}): Promise<{
  directorySubset: DirectoryToolForPlanner[];
  preferencesBlock: string;
}> {
  let preferencesBlock = "";
  const pinSlugs: string[] = [];
  if (args.contributorUserId) {
    const prefs = await loadUserPreferences(args.contributorUserId);
    preferencesBlock = formatPreferencesForPrompt(prefs);
    for (const p of prefs) {
      if (p.preferredToolSlug) pinSlugs.push(p.preferredToolSlug);
    }
  }
  const directorySubset = await findRelevantTools(args.goal, 30, pinSlugs);
  return { directorySubset, preferencesBlock };
}

/**
 * Persist a complete validated Plan as a recipe + recipe_tools rows, and
 * queue any planner-proposed tools.
 */
export async function persistPlan(args: {
  plan: Plan;
  goal: string;
  directorySubset: DirectoryToolForPlanner[];
  contributorUserId: number | null;
}): Promise<{ slug: string; id: number }> {
  const { plan } = args;
  const title =
    plan.steps[0]?.title?.slice(0, 80) ||
    plan.summary.slice(0, 80) ||
    "Recipe";
  const slug = recipeSlug(title);

  const [recipe] = await db
    .insert(recipes)
    .values({
      slug,
      title,
      goalDescription: args.goal,
      planJson: plan,
      status: "draft",
      contributorUserId: args.contributorUserId,
    })
    .returning();

  // Link recipe_tools for in-directory tools (proposed_tool=false).
  const directorySlugs = new Set(args.directorySubset.map((t) => t.slug));
  type StepLink = {
    slug: string;
    stepNumber: number;
    role: string;
    rationale: string;
  };
  const stepLinks: StepLink[] = [];
  const proposed: Array<{
    slug: string;
    name: string;
    homepageUrl?: string;
    kind?: string;
  }> = [];
  for (const step of plan.steps) {
    for (const t of step.tools) {
      if (t.proposed_tool) {
        proposed.push({
          slug: t.slug,
          name: t.slug,
          homepageUrl: t.proposed_homepage_url,
          kind: t.proposed_kind,
        });
        continue;
      }
      if (!directorySlugs.has(t.slug)) continue;
      stepLinks.push({
        slug: t.slug,
        stepNumber: step.step_number,
        role: t.role,
        rationale: step.rationale,
      });
    }
  }

  if (stepLinks.length > 0) {
    const dirRows = await db
      .select({ id: tools.id, slug: tools.slug })
      .from(tools);
    const idBySlug = new Map<string, number>();
    for (const r of dirRows) idBySlug.set(r.slug, r.id);
    const inserts = stepLinks
      .filter((s) => idBySlug.has(s.slug))
      .map((s) => ({
        recipeId: recipe.id,
        toolId: idBySlug.get(s.slug)!,
        stepNumber: s.stepNumber,
        role: s.role,
        justification: s.rationale,
      }));
    if (inserts.length > 0) {
      await db.insert(recipeTools).values(inserts);
    }
  }

  // Queue any planner-proposed tools (best-effort; failures don't block save).
  if (proposed.length > 0) {
    try {
      const { queueProposedTools } = await import("./proposal-queue");
      await queueProposedTools(proposed, {
        goal: args.goal,
        recipe_id: recipe.id,
        user_id: args.contributorUserId ?? null,
      });
    } catch (e) {
      console.error("[persistPlan] queueProposedTools failed", e);
    }
  }

  return { slug: recipe.slug, id: recipe.id };
}
