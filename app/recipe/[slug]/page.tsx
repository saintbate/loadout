import { notFound } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  apiKeys,
  recipeProgress,
  recipes,
  savedRecipes,
  tools,
} from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import { ensureUserProfile } from "@/lib/auth-helpers";
import { highlight } from "@/lib/highlight";
import type { Plan, PlanStep, PlanToolStatus } from "@/lib/plan-types";
import {
  RECIPE_STATUS_COPY,
  computeRecipeOverallStatus,
} from "@/lib/trust";
import { RunRecipeButton } from "./_run-recipe-button";
import { SaveButton } from "./_save-button";
import { StepCard } from "./_step-card";
import { IntegrationBanner } from "./_integration-banner";

export const dynamic = "force-dynamic";

export default async function RecipePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [recipe] = await db
    .select()
    .from(recipes)
    .where(eq(recipes.slug, slug))
    .limit(1);
  if (!recipe) notFound();

  const plan = recipe.planJson as Plan;
  const profile = await ensureUserProfile();

  // Resolve homepage urls + live directory status for in-directory slugs.
  const directorySlugs = Array.from(
    new Set(
      plan.steps.flatMap((s) =>
        s.tools.filter((t) => !t.proposed_tool).map((t) => t.slug),
      ),
    ),
  );
  let homepageBySlug = new Map<string, string | null>();
  let statusBySlug = new Map<string, PlanToolStatus>();
  if (directorySlugs.length > 0) {
    const rows = await db
      .select({
        slug: tools.slug,
        homepageUrl: tools.homepageUrl,
        status: tools.status,
      })
      .from(tools)
      .where(inArray(tools.slug, directorySlugs));
    homepageBySlug = new Map(rows.map((r) => [r.slug, r.homepageUrl]));
    statusBySlug = new Map(
      rows.map((r) => [r.slug, r.status as PlanToolStatus]),
    );
  }

  // Per-user state: saved? has API key? completed steps?
  let isSaved = false;
  let hasApiKey = false;
  let progressByStep = new Map<
    number,
    { completedAt: Date; notes: string | null }
  >();
  if (profile) {
    const [savedRow] = await db
      .select({ id: savedRecipes.id })
      .from(savedRecipes)
      .where(
        and(
          eq(savedRecipes.userId, profile.id),
          eq(savedRecipes.recipeId, recipe.id),
        ),
      )
      .limit(1);
    isSaved = Boolean(savedRow);

    const keyRow = await db
      .select({ id: apiKeys.id })
      .from(apiKeys)
      .where(eq(apiKeys.userId, profile.id))
      .limit(1);
    hasApiKey = keyRow.some((k) => k);

    const progressRows = await db
      .select({
        stepNumber: recipeProgress.stepNumber,
        completedAt: recipeProgress.completedAt,
        notes: recipeProgress.notes,
      })
      .from(recipeProgress)
      .where(
        and(
          eq(recipeProgress.userId, profile.id),
          eq(recipeProgress.recipeId, recipe.id),
        ),
      );
    progressByStep = new Map(
      progressRows.map((r) => [
        r.stepNumber,
        { completedAt: r.completedAt, notes: r.notes },
      ]),
    );
  }

  const totalToolCount = new Set(
    plan.steps.flatMap((s) => s.tools.map((t) => t.slug)),
  ).size;

  const overall = computeRecipeOverallStatus(plan, statusBySlug);
  const overallCopy = RECIPE_STATUS_COPY[overall];

  // Pre-render code blocks server-side.
  const stepsWithHtml: Array<PlanStep & { codeHtml: string | null }> =
    await Promise.all(
      plan.steps.map(async (s) => ({
        ...s,
        codeHtml:
          s.code && s.code.trim()
            ? await highlight(s.code, s.language)
            : null,
      })),
    );

  const completedCount = progressByStep.size;

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-neutral-500">
          Recipe · {recipe.status}
        </p>
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {recipe.title}
          </h1>
          {profile && (
            <SaveButton slug={recipe.slug} isSaved={isSaved} />
          )}
        </div>
        <p className="text-sm text-neutral-600">{plan.summary}</p>
      </div>

      {/* MCP integration banner — only when saved. */}
      {isSaved && profile && (
        <IntegrationBanner
          recipeTitle={recipe.title}
          recipeSlug={recipe.slug}
          hasApiKey={hasApiKey}
        />
      )}

      {/* Recipe-level status banner */}
      <div className="mt-4 flex items-start gap-3 rounded-md border border-neutral-200 bg-white p-3">
        <Badge variant={overallCopy.tone}>{overallCopy.label}</Badge>
        <p className="text-xs text-neutral-600">{overallCopy.explanation}</p>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-neutral-200 py-3 text-sm text-neutral-600">
        <Stat label="Time" value={`${plan.estimated_time_minutes ?? 0} min`} />
        <Stat
          label="Cost"
          value={`$${(plan.estimated_monthly_cost_usd ?? 0).toFixed(2)}/mo`}
        />
        <Stat label="Steps" value={plan.steps.length} />
        <Stat label="Tools" value={totalToolCount} />
        {profile && (
          <Stat
            label="Done"
            value={`${completedCount}/${plan.steps.length}`}
          />
        )}
        <div className="ml-auto">
          <RunRecipeButton recipeId={recipe.id} />
        </div>
      </div>

      {plan.open_questions && plan.open_questions.length > 0 && (
        <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-amber-800">
            Open questions
          </p>
          <ul className="mt-2 list-disc pl-5 text-sm text-amber-900">
            {plan.open_questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      )}

      <ol className="mt-8 space-y-4">
        {stepsWithHtml.map((step) => (
          <StepCard
            key={step.step_number}
            slug={recipe.slug}
            step={step}
            homepageBySlug={homepageBySlug}
            statusBySlug={statusBySlug}
            authenticated={Boolean(profile)}
            progress={progressByStep.get(step.step_number) ?? null}
          />
        ))}
      </ol>

      <p className="mt-12 text-xs text-neutral-400">
        Goal: <span className="text-neutral-600">{recipe.goalDescription}</span>
      </p>
    </main>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-xs uppercase tracking-wide text-neutral-400">
        {label}
      </span>
      <span className="font-medium text-neutral-900">{value}</span>
    </div>
  );
}
