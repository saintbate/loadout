"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { tools, userPreferences } from "@/db/schema";
import { ensureUserProfile } from "@/lib/auth-helpers";
import {
  PREFERENCE_CATEGORIES,
  type PreferenceCategory,
} from "@/lib/preferences";

const CATEGORY_SET = new Set<PreferenceCategory>(PREFERENCE_CATEGORIES);

/**
 * Saves the full settings form. Each category gets one row in
 * user_preferences, or no row if both fields are blank. We replace rather
 * than diff: simple, idempotent, fine for ~12 rows.
 */
export async function saveStackPreferences(formData: FormData) {
  const profile = await ensureUserProfile();
  if (!profile) redirect("/sign-in?redirect_url=/settings");

  // Build a map of category -> { slug, name } from form fields.
  // Form names: "<category>__slug", "<category>__name".
  const incoming = new Map<
    PreferenceCategory,
    { slug: string | null; name: string | null }
  >();

  for (const cat of PREFERENCE_CATEGORIES) {
    const slug = (formData.get(`${cat}__slug`) as string | null)?.trim() ?? "";
    const name = (formData.get(`${cat}__name`) as string | null)?.trim() ?? "";
    incoming.set(cat, {
      slug: slug || null,
      name: name || null,
    });
  }

  // Validate any provided slug actually exists in the directory.
  const slugsToCheck = Array.from(incoming.values())
    .map((v) => v.slug)
    .filter((s): s is string => Boolean(s));
  if (slugsToCheck.length > 0) {
    const real = await db.select({ slug: tools.slug }).from(tools);
    const realSet = new Set(real.map((r) => r.slug));
    for (const [cat, v] of incoming) {
      if (v.slug && !realSet.has(v.slug)) {
        // Fall back to text-only if a stale slug snuck in.
        incoming.set(cat, { slug: null, name: v.name ?? v.slug });
      }
    }
  }

  // Replace per-category. Single round trip per row is fine here (~12 max).
  for (const [category, v] of incoming) {
    if (!CATEGORY_SET.has(category)) continue;

    if (!v.slug && !v.name) {
      await db
        .delete(userPreferences)
        .where(
          and(
            eq(userPreferences.userId, profile.id),
            eq(userPreferences.category, category),
          ),
        );
      continue;
    }

    const existing = await db
      .select({ id: userPreferences.id })
      .from(userPreferences)
      .where(
        and(
          eq(userPreferences.userId, profile.id),
          eq(userPreferences.category, category),
        ),
      )
      .limit(1);

    if (existing[0]) {
      await db
        .update(userPreferences)
        .set({
          preferredToolSlug: v.slug,
          preferredToolName: v.slug ? null : v.name,
          updatedAt: new Date(),
        })
        .where(eq(userPreferences.id, existing[0].id));
    } else {
      await db.insert(userPreferences).values({
        userId: profile.id,
        category,
        preferredToolSlug: v.slug,
        preferredToolName: v.slug ? null : v.name,
      });
    }
  }

  revalidatePath("/settings");
  redirect("/settings?saved=1");
}
