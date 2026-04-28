"use server";

import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { recipeTools, recipes, tools } from "@/db/schema";
import { generatePlan, PlannerError } from "@/lib/anthropic";
import { ensureUserProfile } from "@/lib/auth-helpers";
import { findRelevantTools } from "@/lib/directory-filter";
import type { Plan } from "@/lib/plan-types";
import { PlanValidationError, validatePlan } from "@/lib/plan-validator";
import { recipeSlug } from "@/lib/slug";

/**
 * Submit a community recipe.
 *   mode=goal: run the planner over the goal description
 *   mode=json: parse + validate the pasted JSON, take it as-is
 *
 * Inserts with status=community and contributor_user_id set.
 * Auth-gated — server action redirects to sign-in if not authenticated.
 */
export async function submitCommunityRecipe(formData: FormData) {
  const profile = await ensureUserProfile();
  if (!profile) {
    redirect("/sign-in?redirect_url=/submit");
  }

  const mode = String(formData.get("mode") ?? "goal");
  const titleInput = String(formData.get("title") ?? "").trim();
  const tagsInput = String(formData.get("tags") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 8);

  let plan: Plan;
  let goalDescription: string;

  if (mode === "json") {
    const raw = String(formData.get("plan_json") ?? "").trim();
    if (!raw) redirect("/submit?error=missing_json");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      redirect("/submit?error=invalid_json");
    }
    try {
      validatePlan(parsed);
    } catch (e) {
      const msg = e instanceof PlanValidationError ? e.message : "shape";
      redirect(`/submit?error=plan_shape&detail=${encodeURIComponent(msg)}`);
    }
    plan = parsed as Plan;
    goalDescription =
      String(formData.get("goal") ?? "").trim() || plan.summary.slice(0, 200);
  } else {
    const goal = String(formData.get("goal") ?? "").trim();
    if (!goal) redirect("/submit?error=missing_goal");
    goalDescription = goal;
    const directorySubset = await findRelevantTools(goal);
    try {
      plan = await generatePlan({ goal, directorySubset });
    } catch (err) {
      console.error("[submitCommunityRecipe] planner failed", err);
      const code = err instanceof PlannerError ? "planner" : "unknown";
      redirect(`/submit?error=${code}`);
    }
  }

  const title =
    titleInput ||
    plan.steps[0]?.title?.slice(0, 80) ||
    plan.summary.slice(0, 80) ||
    "Recipe";
  const slug = recipeSlug(title);

  const [recipe] = await db
    .insert(recipes)
    .values({
      slug,
      title,
      goalDescription,
      planJson: plan,
      categoryTags: tagsInput,
      status: "community",
      contributorUserId: profile.id,
    })
    .returning();

  // Link recipe_tools for any in-directory tools referenced in the plan.
  const referencedSlugs = new Set<string>();
  const stepTools: Array<{
    slug: string;
    stepNumber: number;
    role: string;
    rationale: string;
  }> = [];
  for (const step of plan.steps) {
    for (const t of step.tools) {
      if (t.proposed_tool) continue;
      referencedSlugs.add(t.slug);
      stepTools.push({
        slug: t.slug,
        stepNumber: step.step_number,
        role: t.role,
        rationale: step.rationale,
      });
    }
  }
  if (referencedSlugs.size > 0) {
    const dirRows = await db
      .select({ id: tools.id, slug: tools.slug })
      .from(tools);
    const idBySlug = new Map<string, number>();
    for (const r of dirRows) {
      if (referencedSlugs.has(r.slug)) idBySlug.set(r.slug, r.id);
    }
    const inserts = stepTools
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

  redirect(`/recipe/${recipe.slug}`);
}
