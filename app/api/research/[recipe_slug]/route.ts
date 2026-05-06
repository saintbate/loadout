/**
 * GET  /api/research/[recipe_slug]
 *   SSE stream. Sends `{status:"pending"}` immediately (satisfying Vercel's
 *   25-second initial-response deadline), then runs the Anthropic web-search
 *   call (15-30 s), caches the result, and sends `{status:"ready", data:{...}}`.
 *
 *   If the result is already cached it sends `{status:"ready"}` in the first
 *   frame with no further delay.
 *
 * DELETE /api/research/[recipe_slug]
 *   Clears the cached row so the next GET re-runs fresh research.
 *
 * Edge Runtime — no streaming timeout.
 */
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/db/client";
import { recipeResearch, recipes } from "@/db/schema";

export const runtime = "edge";

const RESEARCH_MODEL = "claude-sonnet-4-6";

const RESEARCH_SYSTEM =
  "You are a tactical build advisor with deep knowledge of software architecture, " +
  "open-source projects, and real-world implementation postmortems. Given a build plan, " +
  "draw on your knowledge to return a JSON object with exactly these three fields:\n\n" +
  "prior_art: 2-3 sentences on how real existing products or open-source projects have " +
  "implemented this. Be specific — name actual products, repos, or postmortems. No generic " +
  "category descriptions.\n\n" +
  "missed_by_obvious: 2-3 sentences on where the standard implementation approach (the one " +
  "this plan takes) has known failure modes or gaps, based on real postmortems, GitHub " +
  "issues, or community discussions. If no specific failure modes are known, say so.\n\n" +
  "differentiation_pick: 2-3 sentences on the single most defensible thing the user could " +
  "build differently, grounded in a specific gap in existing implementations. Must " +
  "be tied to something concrete, not generic advice. If no clear differentiation " +
  'signal exists, say "The standard implementation is well-covered in this space. Focus on ' +
  'execution quality over differentiation."\n\n' +
  "Return ONLY valid JSON. No preamble, no markdown fences.";

type ResearchResult = {
  prior_art: string;
  missed_by_obvious: string;
  differentiation_pick: string;
};

type SseEvent =
  | { status: "pending" }
  | { status: "ready"; data: ResearchResult; generatedAt: string }
  | { status: "error" };

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
    "Search the web for real prior art and implementation gaps for this specific " +
      "build. Return the JSON object as instructed.",
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
        max_tokens: 2048,
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

/** ── GET (SSE) ─────────────────────────────────────────────────────── */

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ recipe_slug: string }> },
) {
  const { recipe_slug } = await params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: SseEvent) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
        );
      };

      try {
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
          send({ status: "error" });
          controller.close();
          return;
        }

        // 2. Check cache.
        const [cached] = await db
          .select()
          .from(recipeResearch)
          .where(eq(recipeResearch.recipeId, recipe.id))
          .limit(1);

        if (cached) {
          const stale = recipe.updatedAt > cached.generatedAt;
          if (!stale) {
            send({
              status: "ready",
              data: {
                prior_art: cached.priorArt,
                missed_by_obvious: cached.missedByObvious,
                differentiation_pick: cached.differentiationPick,
              },
              generatedAt: cached.generatedAt.toISOString(),
            });
            controller.close();
            return;
          }
          // Stale — delete and regenerate.
          await db
            .delete(recipeResearch)
            .where(eq(recipeResearch.recipeId, recipe.id));
        }

        // 3. Send the "pending" ping IMMEDIATELY so Vercel's 25 s initial-
        //    response deadline is satisfied before the Anthropic call starts.
        send({ status: "pending" });

        // 4. Run research.
        const plan = recipe.planJson as Record<string, unknown>;
        const planSummary =
          typeof plan?.summary === "string" ? plan.summary : "";
        const toolSlugs = (
          Array.isArray(plan?.steps) ? plan.steps : []
        ).flatMap((s: unknown) => {
          const step = s as Record<string, unknown>;
          return (Array.isArray(step.tools) ? step.tools : []).map(
            (t: unknown) =>
              ((t as Record<string, unknown>).slug as string) ?? "",
          );
        });

        const result = await runResearch(
          recipe.goalDescription,
          planSummary,
          [...new Set(toolSlugs)],
        );

        if (!result) {
          send({ status: "error" });
          controller.close();
          return;
        }

        // 5. Cache (race-safe).
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

        send({
          status: "ready",
          data: result,
          generatedAt: new Date().toISOString(),
        });
        controller.close();
      } catch (err) {
        console.error("[research] fatal", err);
        send({ status: "error" });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
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
