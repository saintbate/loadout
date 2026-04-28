"use server";

import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { userRecipeRuns, users } from "@/db/schema";

/**
 * Records that a logged-in user started running a recipe. Used by the
 * "Run this recipe" button on the recipe page.
 *
 * Goal-submission moved to the streaming /generate flow — see
 * /api/plan-stream and app/generate/.
 */
export async function recordRecipeRun(recipeId: number) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return { ok: false as const, reason: "unauthenticated" };
  }
  let userRow = (
    await db.select().from(users).where(eq(users.clerkId, clerkId)).limit(1)
  )[0];
  if (!userRow) {
    [userRow] = await db.insert(users).values({ clerkId }).returning();
  }
  await db.insert(userRecipeRuns).values({
    userId: userRow.id,
    recipeId,
    status: "started",
  });
  return { ok: true as const };
}
