import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { recipeTools, recipes, tools, users } from "@/db/schema";
import { generatePlan, PlannerError } from "@/lib/anthropic";
import { findRelevantTools } from "@/lib/directory-filter";
import { recipeSlug } from "@/lib/slug";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const goal =
    body && typeof body === "object" && "goal" in body
      ? String((body as { goal: unknown }).goal ?? "")
      : "";
  if (!goal.trim()) {
    return NextResponse.json({ error: "Goal is required" }, { status: 400 });
  }

  // Optional contributor link.
  let contributorUserId: number | null = null;
  try {
    const { userId: clerkId } = await auth();
    if (clerkId) {
      const existing = await db
        .select()
        .from(users)
        .where(eq(users.clerkId, clerkId))
        .limit(1);
      if (existing[0]) {
        contributorUserId = existing[0].id;
      } else {
        const [created] = await db
          .insert(users)
          .values({ clerkId })
          .returning();
        contributorUserId = created.id;
      }
    }
  } catch {
    // Auth optional for v1.
  }

  // Fetch directory subset.
  const directorySubset = await findRelevantTools(goal);

  // Call planner.
  let plan;
  try {
    plan = await generatePlan({ goal, directorySubset });
  } catch (err) {
    const message = err instanceof PlannerError ? err.message : "Planner error";
    console.error("[plan] planner failed", err);
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // Pull a title from the first step or fall back to truncated summary.
  const title =
    plan.steps[0]?.title?.slice(0, 80) || plan.summary.slice(0, 80) || "Recipe";
  const slug = recipeSlug(title);

  const [recipe] = await db
    .insert(recipes)
    .values({
      slug,
      title,
      goalDescription: goal,
      planJson: plan,
      status: "draft",
      contributorUserId,
    })
    .returning();

  // Link recipe_tools rows for each in-directory tool used.
  const directorySlugs = new Set(directorySubset.map((t) => t.slug));
  const referencedSlugs = new Set<string>();
  const stepTools: Array<{
    slug: string;
    stepNumber: number;
    role: string;
  }> = [];
  for (const step of plan.steps) {
    for (const t of step.tools) {
      if (t.proposed_tool) continue;
      if (!directorySlugs.has(t.slug)) continue;
      referencedSlugs.add(t.slug);
      stepTools.push({
        slug: t.slug,
        stepNumber: step.step_number,
        role: t.role,
      });
    }
  }

  if (referencedSlugs.size > 0) {
    const dirRows = await db
      .select({ id: tools.id, slug: tools.slug })
      .from(tools);
    // Cheap in-memory filter rather than building a big WHERE.
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
        justification:
          plan.steps.find((p) => p.step_number === s.stepNumber)?.rationale ??
          "",
      }));
    if (inserts.length > 0) {
      await db.insert(recipeTools).values(inserts);
    }
  }

  return NextResponse.json({ recipe_id: recipe.id, slug: recipe.slug });
}
