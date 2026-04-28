"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { recipeProgress, recipes, savedRecipes } from "@/db/schema";
import { ensureUserProfile } from "@/lib/auth-helpers";

async function requireProfile(slug: string) {
  const profile = await ensureUserProfile();
  if (!profile) redirect(`/sign-in?redirect_url=/recipe/${slug}`);
  return profile;
}

async function findRecipe(slug: string) {
  const [recipe] = await db
    .select({ id: recipes.id })
    .from(recipes)
    .where(eq(recipes.slug, slug))
    .limit(1);
  if (!recipe) throw new Error(`Recipe ${slug} not found`);
  return recipe;
}

/** Idempotent: if already saved, just bumps last_opened_at. */
export async function saveRecipe(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const profile = await requireProfile(slug);
  const recipe = await findRecipe(slug);

  const existing = await db
    .select({ id: savedRecipes.id })
    .from(savedRecipes)
    .where(
      and(
        eq(savedRecipes.userId, profile.id),
        eq(savedRecipes.recipeId, recipe.id),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(savedRecipes)
      .set({ lastOpenedAt: new Date() })
      .where(eq(savedRecipes.id, existing[0].id));
  } else {
    await db
      .insert(savedRecipes)
      .values({ userId: profile.id, recipeId: recipe.id });
  }
  revalidatePath(`/recipe/${slug}`);
  revalidatePath("/my-recipes");
}

export async function unsaveRecipe(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const profile = await requireProfile(slug);
  const recipe = await findRecipe(slug);
  await db
    .delete(savedRecipes)
    .where(
      and(
        eq(savedRecipes.userId, profile.id),
        eq(savedRecipes.recipeId, recipe.id),
      ),
    );
  revalidatePath(`/recipe/${slug}`);
  revalidatePath("/my-recipes");
}

/**
 * Toggle a step's completion. If the user hasn't saved this recipe yet,
 * we save it implicitly — checking off a step is enough engagement.
 */
export async function toggleStepCompletion(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const stepNumber = Number(formData.get("step_number"));
  const completed = formData.get("completed") === "true";
  const notes = String(formData.get("notes") ?? "").trim();
  if (!Number.isFinite(stepNumber)) throw new Error("step_number invalid");

  const profile = await requireProfile(slug);
  const recipe = await findRecipe(slug);

  // Auto-save (idempotent).
  const existingSave = await db
    .select({ id: savedRecipes.id })
    .from(savedRecipes)
    .where(
      and(
        eq(savedRecipes.userId, profile.id),
        eq(savedRecipes.recipeId, recipe.id),
      ),
    )
    .limit(1);
  if (!existingSave[0]) {
    await db
      .insert(savedRecipes)
      .values({ userId: profile.id, recipeId: recipe.id });
  }

  const existing = await db
    .select({ id: recipeProgress.id })
    .from(recipeProgress)
    .where(
      and(
        eq(recipeProgress.userId, profile.id),
        eq(recipeProgress.recipeId, recipe.id),
        eq(recipeProgress.stepNumber, stepNumber),
      ),
    )
    .limit(1);

  if (completed) {
    if (existing[0]) {
      // Already complete — just update notes if they changed.
      await db
        .update(recipeProgress)
        .set({ notes: notes || null })
        .where(eq(recipeProgress.id, existing[0].id));
    } else {
      await db.insert(recipeProgress).values({
        userId: profile.id,
        recipeId: recipe.id,
        stepNumber,
        notes: notes || null,
      });
    }
  } else if (existing[0]) {
    await db
      .delete(recipeProgress)
      .where(eq(recipeProgress.id, existing[0].id));
  }

  revalidatePath(`/recipe/${slug}`);
  revalidatePath("/my-recipes");
}
