/**
 * MCP tool implementations. Used by both:
 *   - the HTTP transport at app/api/mcp/route.ts (Cursor)
 *   - the stdio transport at mcp/server.ts (Claude Code via npx)
 *
 * Each function takes a userId (resolved by the transport from the API
 * key) and the tool args, returns a plain JSON object. Errors are thrown;
 * the transport layer maps them to JSON-RPC errors.
 */

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  recipeProgress,
  recipes,
  savedRecipes,
  toolCapabilities,
  tools,
} from "@/db/schema";
import type { Plan, PlanStep } from "./plan-types";

// ---- shared types ---------------------------------------------------------

export const MCP_TOOL_DEFS = [
  {
    name: "get_recipe",
    description:
      "Returns the full plan for a Loadout recipe including per-step completion status for the authenticated user.",
    inputSchema: {
      type: "object",
      required: ["recipe_slug"],
      properties: {
        recipe_slug: {
          type: "string",
          description:
            "The recipe slug as it appears in the URL: /recipe/<slug>.",
        },
      },
    },
  },
  {
    name: "get_step",
    description:
      "Returns one step from a recipe with full detail. Call this when implementing a specific step.",
    inputSchema: {
      type: "object",
      required: ["recipe_slug", "step_number"],
      properties: {
        recipe_slug: { type: "string" },
        step_number: { type: "integer", minimum: 1 },
      },
    },
  },
  {
    name: "list_my_recipes",
    description:
      "Lists every recipe the user has saved to their Loadout account, with completion progress.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "mark_step_complete",
    description:
      "Marks a step as done. Optionally records a short note (e.g. how the user actually implemented it). Auto-saves the recipe to the user's account if not already saved.",
    inputSchema: {
      type: "object",
      required: ["recipe_slug", "step_number"],
      properties: {
        recipe_slug: { type: "string" },
        step_number: { type: "integer", minimum: 1 },
        notes: { type: "string" },
      },
    },
  },
  {
    name: "get_tool_info",
    description:
      "Returns directory metadata for a tool — description, capabilities, links, status. Useful when needing to know how to use a tool from a plan.",
    inputSchema: {
      type: "object",
      required: ["tool_slug"],
      properties: { tool_slug: { type: "string" } },
    },
  },
  {
    name: "suggest_next_step",
    description:
      "Returns the lowest-numbered incomplete step of a saved recipe, with full detail. Use this for 'what should I do next?' prompts.",
    inputSchema: {
      type: "object",
      required: ["recipe_slug"],
      properties: { recipe_slug: { type: "string" } },
    },
  },
] as const;

// ---- helpers --------------------------------------------------------------

async function fetchRecipeBySlug(slug: string) {
  const [row] = await db
    .select()
    .from(recipes)
    .where(eq(recipes.slug, slug))
    .limit(1);
  if (!row) throw new Error(`No recipe with slug "${slug}"`);
  return row;
}

async function fetchProgressMap(
  userId: number,
  recipeId: number,
): Promise<Map<number, { completedAt: Date; notes: string | null }>> {
  const rows = await db
    .select({
      stepNumber: recipeProgress.stepNumber,
      completedAt: recipeProgress.completedAt,
      notes: recipeProgress.notes,
    })
    .from(recipeProgress)
    .where(
      and(
        eq(recipeProgress.userId, userId),
        eq(recipeProgress.recipeId, recipeId),
      ),
    );
  return new Map(
    rows.map((r) => [
      r.stepNumber,
      { completedAt: r.completedAt, notes: r.notes },
    ]),
  );
}

async function ensureSaved(userId: number, recipeId: number) {
  const existing = await db
    .select({ id: savedRecipes.id })
    .from(savedRecipes)
    .where(
      and(
        eq(savedRecipes.userId, userId),
        eq(savedRecipes.recipeId, recipeId),
      ),
    )
    .limit(1);
  if (existing[0]) {
    await db
      .update(savedRecipes)
      .set({ lastOpenedAt: new Date() })
      .where(eq(savedRecipes.id, existing[0].id));
    return existing[0].id;
  }
  const [created] = await db
    .insert(savedRecipes)
    .values({ userId, recipeId })
    .returning({ id: savedRecipes.id });
  return created.id;
}

function shapeStep(
  step: PlanStep,
  progress?: { completedAt: Date; notes: string | null },
  toolNameBySlug?: Map<string, string>,
) {
  return {
    step_number: step.step_number,
    title: step.title,
    tools: step.tools.map((t) => ({
      slug: t.slug,
      name: toolNameBySlug?.get(t.slug) ?? t.slug,
      role: t.role,
      proposed_tool: t.proposed_tool,
      status: t.status ?? null,
    })),
    rationale: step.rationale,
    code: step.code ?? "",
    language: step.language ?? "",
    setup_commands: step.setup_commands ?? [],
    trust_signal: step.trust_signal,
    alternatives_considered: step.alternatives_considered ?? [],
    completed: Boolean(progress),
    completed_at: progress ? progress.completedAt.toISOString() : null,
    notes: progress?.notes ?? null,
  };
}

// ---- tool implementations -------------------------------------------------

export async function getRecipe(args: { userId: number; recipe_slug: string }) {
  const recipe = await fetchRecipeBySlug(args.recipe_slug);
  const plan = recipe.planJson as Plan;

  const [progressMap, toolRows] = await Promise.all([
    fetchProgressMap(args.userId, recipe.id),
    db
      .select({ slug: tools.slug, name: tools.name })
      .from(tools)
      .where(
        inArray(
          tools.slug,
          Array.from(
            new Set(
              plan.steps.flatMap((s) =>
                s.tools.filter((t) => !t.proposed_tool).map((t) => t.slug),
              ),
            ),
          ),
        ),
      ),
  ]);
  const toolNameBySlug = new Map(toolRows.map((r) => [r.slug, r.name]));

  return {
    slug: recipe.slug,
    title: recipe.title,
    summary: plan.summary,
    goal: recipe.goalDescription,
    estimated_time_minutes: plan.estimated_time_minutes,
    estimated_monthly_cost_usd: plan.estimated_monthly_cost_usd,
    status: recipe.status,
    steps: plan.steps.map((s) =>
      shapeStep(s, progressMap.get(s.step_number), toolNameBySlug),
    ),
    open_questions: plan.open_questions ?? [],
    web_url: `${publicBaseUrl()}/recipe/${recipe.slug}`,
  };
}

export async function getStep(args: {
  userId: number;
  recipe_slug: string;
  step_number: number;
}) {
  const recipe = await fetchRecipeBySlug(args.recipe_slug);
  const plan = recipe.planJson as Plan;
  const step = plan.steps.find((s) => s.step_number === args.step_number);
  if (!step) {
    throw new Error(
      `Step ${args.step_number} not found in recipe "${args.recipe_slug}" (this recipe has ${plan.steps.length} steps).`,
    );
  }
  const [progressMap, toolRows] = await Promise.all([
    fetchProgressMap(args.userId, recipe.id),
    db
      .select({ slug: tools.slug, name: tools.name })
      .from(tools)
      .where(
        inArray(
          tools.slug,
          step.tools.filter((t) => !t.proposed_tool).map((t) => t.slug),
        ),
      ),
  ]);
  const nameMap = new Map(toolRows.map((r) => [r.slug, r.name]));
  return {
    recipe: {
      slug: recipe.slug,
      title: recipe.title,
      total_steps: plan.steps.length,
    },
    step: shapeStep(step, progressMap.get(step.step_number), nameMap),
  };
}

export async function listMyRecipes(args: { userId: number }) {
  const rows = await db
    .select({
      slug: recipes.slug,
      title: recipes.title,
      planJson: recipes.planJson,
      status: recipes.status,
      savedAt: savedRecipes.savedAt,
      lastOpenedAt: savedRecipes.lastOpenedAt,
      recipeId: recipes.id,
    })
    .from(savedRecipes)
    .innerJoin(recipes, eq(savedRecipes.recipeId, recipes.id))
    .where(eq(savedRecipes.userId, args.userId))
    .orderBy(desc(savedRecipes.lastOpenedAt));

  if (rows.length === 0) return { recipes: [] };

  // Batch the progress lookup.
  const recipeIds = rows.map((r) => r.recipeId);
  const progress = await db
    .select({
      recipeId: recipeProgress.recipeId,
      stepNumber: recipeProgress.stepNumber,
    })
    .from(recipeProgress)
    .where(
      and(
        eq(recipeProgress.userId, args.userId),
        inArray(recipeProgress.recipeId, recipeIds),
      ),
    );
  const completedByRecipe = new Map<number, number>();
  for (const p of progress) {
    completedByRecipe.set(
      p.recipeId,
      (completedByRecipe.get(p.recipeId) ?? 0) + 1,
    );
  }

  return {
    recipes: rows.map((r) => {
      const plan = r.planJson as Plan;
      const total = plan.steps.length;
      const completed = completedByRecipe.get(r.recipeId) ?? 0;
      return {
        slug: r.slug,
        title: r.title,
        summary: plan.summary,
        steps_total: total,
        steps_completed: completed,
        is_complete: completed === total,
        last_opened_at: r.lastOpenedAt.toISOString(),
        saved_at: r.savedAt.toISOString(),
        status: r.status,
        web_url: `${publicBaseUrl()}/recipe/${r.slug}`,
      };
    }),
  };
}

export async function markStepComplete(args: {
  userId: number;
  recipe_slug: string;
  step_number: number;
  notes?: string;
}) {
  const recipe = await fetchRecipeBySlug(args.recipe_slug);
  const plan = recipe.planJson as Plan;
  if (!plan.steps.some((s) => s.step_number === args.step_number)) {
    throw new Error(
      `Step ${args.step_number} doesn't exist in this recipe.`,
    );
  }

  // Auto-save on first interaction.
  await ensureSaved(args.userId, recipe.id);

  const existing = await db
    .select({ id: recipeProgress.id })
    .from(recipeProgress)
    .where(
      and(
        eq(recipeProgress.userId, args.userId),
        eq(recipeProgress.recipeId, recipe.id),
        eq(recipeProgress.stepNumber, args.step_number),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(recipeProgress)
      .set({
        notes: args.notes ?? null,
        completedAt: new Date(),
      })
      .where(eq(recipeProgress.id, existing[0].id));
  } else {
    await db.insert(recipeProgress).values({
      userId: args.userId,
      recipeId: recipe.id,
      stepNumber: args.step_number,
      notes: args.notes ?? null,
    });
  }

  // Return updated overall progress.
  const totalSteps = plan.steps.length;
  const completed = await db
    .select({ stepNumber: recipeProgress.stepNumber })
    .from(recipeProgress)
    .where(
      and(
        eq(recipeProgress.userId, args.userId),
        eq(recipeProgress.recipeId, recipe.id),
      ),
    );
  return {
    ok: true,
    recipe_slug: recipe.slug,
    step_number: args.step_number,
    completed_steps: completed.map((c) => c.stepNumber).sort((a, b) => a - b),
    total_steps: totalSteps,
    is_complete: completed.length === totalSteps,
  };
}

export async function getToolInfo(args: { tool_slug: string }) {
  const [tool] = await db
    .select()
    .from(tools)
    .where(eq(tools.slug, args.tool_slug))
    .limit(1);
  if (!tool) throw new Error(`No tool with slug "${args.tool_slug}".`);
  const caps = await db
    .select({ capability: toolCapabilities.capability })
    .from(toolCapabilities)
    .where(eq(toolCapabilities.toolId, tool.id));
  return {
    slug: tool.slug,
    name: tool.name,
    kind: tool.kind,
    description: tool.description,
    homepage_url: tool.homepageUrl,
    repo_url: tool.repoUrl,
    status: tool.status,
    auth_required: tool.authRequired,
    pricing_model: tool.pricingModel,
    category_tags: tool.categoryTags,
    capabilities: caps.map((c) => c.capability),
    web_url: `${publicBaseUrl()}/tool/${tool.slug}`,
  };
}

export async function suggestNextStep(args: {
  userId: number;
  recipe_slug: string;
}) {
  const recipe = await fetchRecipeBySlug(args.recipe_slug);
  const plan = recipe.planJson as Plan;
  const completed = new Set(
    (
      await db
        .select({ stepNumber: recipeProgress.stepNumber })
        .from(recipeProgress)
        .where(
          and(
            eq(recipeProgress.userId, args.userId),
            eq(recipeProgress.recipeId, recipe.id),
          ),
        )
        .orderBy(asc(recipeProgress.stepNumber))
    ).map((r) => r.stepNumber),
  );

  const next = plan.steps.find((s) => !completed.has(s.step_number));
  if (!next) {
    return {
      done: true,
      message: `You've completed all ${plan.steps.length} steps of "${recipe.title}". Nothing left to do.`,
    };
  }

  // Reuse the get_step shape for consistency with what Cursor receives mid-flight.
  return await getStep({
    userId: args.userId,
    recipe_slug: recipe.slug,
    step_number: next.step_number,
  }).then((res) => ({
    done: false,
    completed_so_far: Array.from(completed).sort((a, b) => a - b),
    ...res,
  }));
}

// ---- single dispatch fn ---------------------------------------------------

/**
 * Common dispatch used by both transports. Throws on bad tool name or
 * missing required args; returns the tool's JSON payload.
 */
export async function dispatchTool(
  toolName: string,
  args: Record<string, unknown>,
  userId: number,
): Promise<unknown> {
  switch (toolName) {
    case "get_recipe":
      requireString(args, "recipe_slug");
      return getRecipe({ userId, recipe_slug: String(args.recipe_slug) });
    case "get_step":
      requireString(args, "recipe_slug");
      requireNumber(args, "step_number");
      return getStep({
        userId,
        recipe_slug: String(args.recipe_slug),
        step_number: Number(args.step_number),
      });
    case "list_my_recipes":
      return listMyRecipes({ userId });
    case "mark_step_complete":
      requireString(args, "recipe_slug");
      requireNumber(args, "step_number");
      return markStepComplete({
        userId,
        recipe_slug: String(args.recipe_slug),
        step_number: Number(args.step_number),
        notes:
          typeof args.notes === "string" && args.notes.trim()
            ? args.notes
            : undefined,
      });
    case "get_tool_info":
      requireString(args, "tool_slug");
      return getToolInfo({ tool_slug: String(args.tool_slug) });
    case "suggest_next_step":
      requireString(args, "recipe_slug");
      return suggestNextStep({
        userId,
        recipe_slug: String(args.recipe_slug),
      });
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

function requireString(args: Record<string, unknown>, key: string) {
  const v = args[key];
  if (typeof v !== "string" || !v.trim()) {
    throw new Error(`Missing required string arg "${key}"`);
  }
}
function requireNumber(args: Record<string, unknown>, key: string) {
  const v = args[key];
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new Error(`Missing required number arg "${key}"`);
  }
}

function publicBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_LOADOUT_BASE_URL?.replace(/\/$/, "") ||
    "https://loadout.dev"
  );
}
