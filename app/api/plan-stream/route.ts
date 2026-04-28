/**
 * Server-sent events endpoint that drives the live generation screen.
 *
 * Accepts:
 *   POST /api/plan-stream
 *   { goal: string, draftSlug?: string,
 *     clarifications?: Array<{question, answer}> }
 *
 * Behavior:
 *   1. If no clarifications passed AND no draftSlug, run the clarifier.
 *      If it asks questions, store a recipe_drafts row, emit
 *      `{type:"clarify", slug}`, and end. The client navigates to
 *      /clarify/<slug>.
 *   2. If draftSlug is passed, look up the draft (the /clarify form
 *      having stored answers in it) and use draft.goal + answers.
 *   3. Stream the planner. As partial JSON arrives, emit structured
 *      events for the right-panel skeleton + feed lines for the left
 *      panel.
 *   4. When the stream finishes, persist the recipe, then emit
 *      `{type:"done", slug}`.
 *
 * Wire format: text/event-stream, one `data: <json>\n\n` per event. The
 * client parses each line with `JSON.parse`. Error events surface as
 * `{type:"failed", message}`.
 */
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { recipeDrafts } from "@/db/schema";
import { ensureUserProfile } from "@/lib/auth-helpers";
import { checkForClarification } from "@/lib/clarifier";
import { streamPlan, type StreamEvent } from "@/lib/anthropic-stream";
import {
  gatherPlanningInputs,
  persistPlan,
} from "@/lib/plan-and-persist";
import { recipeSlug } from "@/lib/slug";

export const runtime = "nodejs";
// Cap the request lifetime; planner streams typically finish in 5-25s.
export const maxDuration = 60;

type Body = {
  goal?: string;
  draftSlug?: string;
  clarifications?: Array<{ question: string; answer: string }>;
};

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) {
    return new Response("invalid body", { status: 400 });
  }

  const profile = await ensureUserProfile();
  const contributorUserId = profile?.id ?? null;

  // Resolve goal + clarifications. Either:
  //   - draftSlug → load draft, use its goal + passed answers.
  //   - else → use body.goal directly.
  let goal = (body.goal ?? "").trim();
  let clarifications = body.clarifications ?? [];
  let draftIdToDelete: number | null = null;

  if (body.draftSlug) {
    const [draft] = await db
      .select()
      .from(recipeDrafts)
      .where(eq(recipeDrafts.slug, body.draftSlug))
      .limit(1);
    if (!draft) {
      return new Response("draft not found", { status: 404 });
    }
    goal = draft.goalDescription;
    // If client passed answers, use them; otherwise fall back to whatever
    // is stored on the draft (in case of refresh).
    if (clarifications.length === 0 && draft.clarifyingQuestions.length) {
      clarifications = draft.clarifyingQuestions.map((q, i) => ({
        question: q,
        answer: draft.clarifyingAnswers?.[i] ?? "",
      }));
    }
    draftIdToDelete = draft.id;
  }

  if (!goal) {
    return new Response("missing goal", { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: StreamEvent | { type: string; [k: string]: unknown }) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
        );
      };

      try {
        // 1. Clarifier + directory lookup run in parallel.
        // Clarifier is only needed on fresh goals (no draftSlug, no answers
        // already passed). Both are independent of each other so we fire
        // them together and wait for both before starting the planner.
        send({ type: "phase", phase: "analyzing" });
        const needsClarifier =
          clarifications.length === 0 && !body.draftSlug;
        if (needsClarifier) {
          send({ type: "feed", line: "Analyzing goal" });
        } else if (clarifications.length > 0) {
          send({
            type: "feed",
            line: `Reading ${clarifications.length} clarification${clarifications.length === 1 ? "" : "s"}`,
          });
        }

        const [clar, inputs] = await Promise.all([
          needsClarifier
            ? checkForClarification(goal).catch((err) => {
                console.warn("[plan-stream] clarifier failed", err);
                return { needs_clarification: false, questions: [] };
              })
            : Promise.resolve({ needs_clarification: false, questions: [] }),
          gatherPlanningInputs({ goal, contributorUserId }),
        ]);

        if (clar.needs_clarification && clar.questions.length > 0) {
          const draftSlug = recipeSlug(goal.slice(0, 40) || "draft");
          await db.insert(recipeDrafts).values({
            slug: draftSlug,
            contributorUserId,
            goalDescription: goal,
            clarifyingQuestions: clar.questions,
            clarifyingAnswers: [],
          });
          send({ type: "clarify", slug: draftSlug });
          controller.close();
          return;
        }
        send({
          type: "feed",
          line: `Found ${inputs.directorySubset.length} candidate tools in directory`,
        });

        // 3. Stream the planner.
        const planStream = streamPlan({
          goal,
          directorySubset: inputs.directorySubset,
          preferencesBlock: inputs.preferencesBlock,
          clarifications,
        });

        let finalPlan: import("@/lib/plan-types").Plan | null = null;
        for await (const event of planStream) {
          if (event.type === "complete") {
            finalPlan = event.plan;
            // Don't forward "complete" as-is — we'll send "done" with
            // the slug once persisted.
            continue;
          }
          if (event.type === "failed") {
            send(event);
            controller.close();
            return;
          }
          send(event);
        }

        if (!finalPlan) {
          send({
            type: "failed",
            message: "Planner stream ended without a complete plan.",
          });
          controller.close();
          return;
        }

        // 4. Persist + emit done.
        send({ type: "feed", line: "Saving recipe" });
        const recipe = await persistPlan({
          plan: finalPlan,
          goal,
          directorySubset: inputs.directorySubset,
          contributorUserId,
        });
        if (draftIdToDelete) {
          await db
            .delete(recipeDrafts)
            .where(eq(recipeDrafts.id, draftIdToDelete))
            .catch(() => {});
        }
        send({ type: "done", slug: recipe.slug });
        controller.close();
      } catch (err) {
        console.error("[plan-stream] fatal", err);
        send({
          type: "failed",
          message:
            err instanceof Error ? err.message : "Unknown planner error",
        });
        controller.close();
      }
    },
    cancel() {
      // Client disconnected — nothing to clean up beyond GC. The Anthropic
      // stream will throw on next iteration which we already handle.
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
