"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { recipes } from "@/db/schema";
import { ensureUserProfile, isAdmin } from "@/lib/auth-helpers";

async function requireAdmin() {
  if (!(await isAdmin())) {
    throw new Error("Forbidden");
  }
}

export async function promoteRecipe(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) throw new Error("Invalid id");
  const me = await ensureUserProfile();
  await db
    .update(recipes)
    .set({
      status: "verified",
      verifiedAt: new Date(),
      verifiedByUserId: me?.id ?? null,
      updatedAt: new Date(),
    })
    .where(eq(recipes.id, id));
  revalidatePath("/admin");
  revalidatePath("/browse");
}

export async function demoteRecipe(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) throw new Error("Invalid id");
  await db
    .update(recipes)
    .set({
      status: "community",
      verifiedAt: null,
      verifiedByUserId: null,
      updatedAt: new Date(),
    })
    .where(eq(recipes.id, id));
  revalidatePath("/admin");
  revalidatePath("/browse");
}

export async function deprecateRecipe(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) throw new Error("Invalid id");
  await db
    .update(recipes)
    .set({ status: "deprecated", updatedAt: new Date() })
    .where(eq(recipes.id, id));
  revalidatePath("/admin");
  revalidatePath("/browse");
}
