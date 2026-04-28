import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";

/**
 * Wraps Clerk's `auth()` so it returns `null` gracefully when called outside
 * the middleware (e.g. when Next renders the root layout for a static-asset
 * 404 like `/apple-touch-icon.png`, which the matcher excludes).
 */
async function safeClerkUserId(): Promise<string | null> {
  try {
    const { userId } = await auth();
    return userId ?? null;
  } catch {
    return null;
  }
}

export async function ensureUserProfile(): Promise<{
  id: number;
  clerkId: string;
} | null> {
  const clerkId = await safeClerkUserId();
  if (!clerkId) return null;
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (existing[0]) return { id: existing[0].id, clerkId };
  const [created] = await db.insert(users).values({ clerkId }).returning();
  return { id: created.id, clerkId };
}

export async function isAdmin(): Promise<boolean> {
  const clerkId = await safeClerkUserId();
  if (!clerkId) return false;
  const adminId = process.env.ADMIN_CLERK_USER_ID;
  return Boolean(adminId && adminId === clerkId);
}
