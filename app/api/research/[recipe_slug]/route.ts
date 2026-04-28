/**
 * GET  /api/research/[recipe_slug]
 *   Returns cached research immediately, or runs the Anthropic web-search
 *   call synchronously (15-20 s) if no cache exists, then caches and returns.
 *
 * DELETE /api/research/[recipe_slug]
 *   Clears the cached row so the next GET re-runs fresh research.
 *   Used by the "Refresh research" button.
 *
 * Edge Runtime — no streaming timeout. All deps (Neon HTTP, Anthropic SDK)
 * are Edge-compatible.
 */
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/db/client";
import { recipeResearch, recipes } from "@/db/schema";

export const runtime = "edge";

const RESEARCH_MODEL = "claude-sonnet-4-6";

const RESEARCH_SYSTEM = `You are a tactical build advisor. Given a build plan, search \
the web for real implementations of similar systems and return a JSON object with exactly \
these three fields:

prior_art: 2-3 sentences on how real existing products or open-source projects have \
implemented this. Be specific — name actual products, repos, or postmortems. No generic \
category descriptions.

missed_by_obvious: 2-3 sentences on where the standard implementation approach (the one \
this plan takes) has known failure modes or gaps, based on what you find in real \
postmortems, GitHub issues, or community discussions. If no specific failure modes are \
documented, say so.

differentiation_pick: 2-3 sentences on the single most defensible thing the user could \
build differently, grounded in a specific gap you found in existing implementations. Must \
be tied to something real you found, not generic advice. If no clear differentiation \
signal exists, say "The standard implementation is well-covered in this space. Focus on \
execution quality over differentiation."

Return ONLY valid JSON. No preamble, no markdown fences.`;

type ResearchResult = {
  prior_art: string;
  missed_by_obvious: string;
  differentiation_pick: string;
};

/** ── helpers ──────────────────────────────────────────────────────── */

function buildUserMessage(
  goal: string,
  planSummary: string,
  toolSlugs: string[],
): string {
  const toolList = toolSlugs.slice(0, 20).join(", ");
  return [
    `## Build goal\n${goal}`,
    `## Plan summary\n${planSummary}`,
    `## Key tools in this plan\n${toolList || "not specified"}`,
    "",
    "Search the web for real prior art and implementation gaps for this specific \
build. Return the JSON object as instructed.",
  ].join("\n\n");
}

async function runResearch(
  goal: string,
  planSummary: string,
  toolSlugs: string[],
): Promise<ResearchResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const client = new Anthropic({ apiKey });
  const userMessage = buildUserMessage(goal, planSummary, toolSlugs);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await client.messages.create({
        model: RESEARCH_MODEL,
        max_tokens: 1024,
        // web_search_20250305 is a server-side tool — Anthropic performs the
        // searches and returns the synthesised response in one API call.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tools: [{ type: "web_search_20250305", name: "web_search" } as any],
        system: RESEARCH_SYSTEM,
        messages: [{ role: "user", content: userMessage }],
      });

      // Collect all text blocks; the final one is the JSON answer.
      const texts = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text);

      if (texts.length === 0) continue;

      // Strip optional markdown fences the model sometimes adds.
      const raw = texts[texts.length - 1]
        .replace(/^```(?:json)?\s*/im, "")
        .replace(/\s*```\s*$/im, "")
        .trim();

      const parsed = JSON.parse(raw) as ResearchResult;

      if (
        typeof parsed.prior_art !== "string" ||
        typeof parsed.missed_by_obvious !== "string" ||
        typeof parsed.differentiation_pick !== "string"
      ) {
        throw new Error("Missing required fields");
      }

      return {
        prior_art: parsed.prior_art.trim(),
        missed_by_obvious: parsed.missed_by_obvious.trim(),
        differentiation_pick: parsed.differentiation_pick.trim(),
      };
    } catch (err) {
      console.error(`[research] attempt ${attempt + 1} failed:`, err);
    }
  }

  return null;
}

/** ── GET ──────────────────────────────────────────────────────────── */

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ recipe_slug: string }> },
) {
  const { recipe_slug } = await params;

  // 1. Resolve recipe.
  const [recipe] = await db
    .select({
      id: recipes.id,
      goalDescription: recipes.goalDescription,
      planJson: recipes.planJson,
      updatedAt: recipes.updatedAt,
    })
    .from(recipes)
    .where(eq(recipes.slug, recipe_slug))
    .limit(1);

  if (!recipe) {
    return new Response("not found", { status: 404 });
  }

  // 2. Check for a valid cached result.
  const [cached] = await db
    .select()
    .from(recipeResearch)
    .where(eq(recipeResearch.recipeId, recipe.id))
    .limit(1);

  if (cached) {
    // Invalidate if the recipe plan was updated after the research ran.
    const stale = recipe.updatedAt > cached.generatedAt;
    if (!stale) {
      return Response.json({
        status: "ready",
        data: {
          prior_art: cached.priorArt,
          missed_by_obvious: cached.missedByObvious,
          differentiation_pick: cached.differentiationPick,
        } satisfies ResearchResult,
        generatedAt: cached.generatedAt,
      });
    }
    // Stale — delete so we regenerate below.
    await db
      .delete(recipeResearch)
      .where(eq(recipeResearch.recipeId, recipe.id));
  }

  // 3. Run the research call.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plan = recipe.planJson as any;
  const planSummary: string = plan?.summary ?? "";
  const toolSlugs: string[] = (plan?.steps ?? []).flatMap(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (s: any) => (s.tools ?? []).map((t: any) => t.slug as string),
  );

  const result = await runResearch(
    recipe.goalDescription,
    planSummary,
    [...new Set(toolSlugs)],
  );

  if (!result) {
    return Response.json({ status: "error" });
  }

  // 4. Cache with upsert semantics (another concurrent request may have
  //    already inserted — onConflictDoNothing prevents a duplicate-key error).
  await db
    .insert(recipeResearch)
    .values({
      recipeId: recipe.id,
      priorArt: result.prior_art,
      missedByObvious: result.missed_by_obvious,
      differentiationPick: result.differentiation_pick,
      modelUsed: RESEARCH_MODEL,
    })
    .onConflictDoNothing();

  return Response.json({
    status: "ready",
    data: result,
    generatedAt: new Date().toISOString(),
  });
}

/** ── DELETE ────────────────────────────────────────────────────────── */

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ recipe_slug: string }> },
) {
  const { recipe_slug } = await params;

  const [recipe] = await db
    .select({ id: recipes.id })
    .from(recipes)
    .where(eq(recipes.slug, recipe_slug))
    .limit(1);

  if (!recipe) return new Response("not found", { status: 404 });

  await db
    .delete(recipeResearch)
    .where(eq(recipeResearch.recipeId, recipe.id));

  return new Response(null, { status: 204 });
}
