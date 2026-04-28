import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: false });
loadEnv({ path: ".env" });

import { eq, inArray } from "drizzle-orm";
import { db } from "./client";
import {
  recipeTools,
  recipes,
  toolCapabilities,
  tools,
} from "./schema";
import { SEED_TOOLS } from "../lib/seed-tools";
import { SEED_RECIPES } from "../lib/seed-recipes";

async function seed() {
  console.log("[seed] starting");

  // ---- tools ----
  for (const t of SEED_TOOLS) {
    const existing = await db
      .select({ id: tools.id })
      .from(tools)
      .where(eq(tools.slug, t.slug))
      .limit(1);

    let toolId: number;
    if (existing[0]) {
      toolId = existing[0].id;
      await db
        .update(tools)
        .set({
          name: t.name,
          kind: t.kind,
          description: t.description,
          homepageUrl: t.homepage_url,
          repoUrl: t.repo_url ?? null,
          status: t.status ?? "verified",
          categoryTags: t.category_tags,
          authRequired: t.auth_required,
          pricingModel: t.pricing_model,
          updatedAt: new Date(),
        })
        .where(eq(tools.id, toolId));
    } else {
      const [created] = await db
        .insert(tools)
        .values({
          slug: t.slug,
          name: t.name,
          kind: t.kind,
          description: t.description,
          homepageUrl: t.homepage_url,
          repoUrl: t.repo_url,
          status: t.status ?? "verified",
          categoryTags: t.category_tags,
          authRequired: t.auth_required,
          pricingModel: t.pricing_model,
        })
        .returning();
      toolId = created.id;
    }

    // Replace capabilities (cheap; small N).
    await db
      .delete(toolCapabilities)
      .where(eq(toolCapabilities.toolId, toolId));
    if (t.capabilities.length > 0) {
      await db
        .insert(toolCapabilities)
        .values(
          t.capabilities.map((c) => ({ toolId, capability: c, notes: null })),
        );
    }
  }
  console.log(`[seed] tools: upserted ${SEED_TOOLS.length}`);

  // ---- recipes ----
  for (const r of SEED_RECIPES) {
    const existing = await db
      .select({ id: recipes.id })
      .from(recipes)
      .where(eq(recipes.slug, r.slug))
      .limit(1);

    let recipeId: number;
    if (existing[0]) {
      recipeId = existing[0].id;
      await db
        .update(recipes)
        .set({
          title: r.title,
          goalDescription: r.goal_description,
          planJson: r.plan,
          categoryTags: r.category_tags,
          status: "verified",
          verifiedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(recipes.id, recipeId));
    } else {
      const [created] = await db
        .insert(recipes)
        .values({
          slug: r.slug,
          title: r.title,
          goalDescription: r.goal_description,
          planJson: r.plan,
          categoryTags: r.category_tags,
          status: "verified",
          verifiedAt: new Date(),
        })
        .returning();
      recipeId = created.id;
    }

    // Replace recipe_tools links.
    await db
      .delete(recipeTools)
      .where(eq(recipeTools.recipeId, recipeId));

    const slugsInPlan = new Set<string>();
    for (const step of r.plan.steps) {
      for (const t of step.tools) {
        if (!t.proposed_tool) slugsInPlan.add(t.slug);
      }
    }
    if (slugsInPlan.size > 0) {
      const dirRows = await db
        .select({ id: tools.id, slug: tools.slug })
        .from(tools)
        .where(inArray(tools.slug, Array.from(slugsInPlan)));
      const idBySlug = new Map(dirRows.map((row) => [row.slug, row.id]));
      const inserts: Array<{
        recipeId: number;
        toolId: number;
        stepNumber: number;
        role: string;
        justification: string;
      }> = [];
      for (const step of r.plan.steps) {
        for (const t of step.tools) {
          if (t.proposed_tool) continue;
          const id = idBySlug.get(t.slug);
          if (!id) continue;
          inserts.push({
            recipeId,
            toolId: id,
            stepNumber: step.step_number,
            role: t.role,
            justification: step.rationale,
          });
        }
      }
      if (inserts.length > 0) {
        await db.insert(recipeTools).values(inserts);
      }
    }
  }
  console.log(`[seed] recipes: upserted ${SEED_RECIPES.length}`);

  console.log("[seed] done");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[seed] failed", err);
    process.exit(1);
  });
