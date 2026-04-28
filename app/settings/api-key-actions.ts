"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createApiKey, revokeAllKeysForUser } from "@/lib/api-keys";
import { ensureUserProfile } from "@/lib/auth-helpers";

const RAW_KEY_COOKIE = "loadout_raw_key";

/**
 * Generate a fresh API key for the current user. Existing keys are
 * revoked (one-key-per-user policy from the prompt).
 *
 * The raw key is stored briefly in a httpOnly cookie so the next render of
 * /settings can show it once. The cookie is single-use: the page reads
 * and clears it.
 */
export async function generateApiKey() {
  const profile = await ensureUserProfile();
  if (!profile) redirect("/sign-in?redirect_url=/settings");

  try {
    await revokeAllKeysForUser(profile.id);
    const { rawKey } = await createApiKey({
      userId: profile.id,
      name: "MCP integration",
    });

    const c = await cookies();
    c.set(RAW_KEY_COOKIE, rawKey, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/settings",
      maxAge: 60 * 5, // 5 minutes
    });
  } catch (err) {
    console.error("[generateApiKey] failed:", err);
    redirect("/settings?error=keygen#api-keys");
  }

  revalidatePath("/settings");
  redirect("/settings#api-keys");
}

export async function revokeApiKey() {
  const profile = await ensureUserProfile();
  if (!profile) redirect("/sign-in?redirect_url=/settings");
  await revokeAllKeysForUser(profile.id);
  revalidatePath("/settings");
  redirect("/settings#api-keys");
}

export async function consumeRawKeyCookie(): Promise<string | null> {
  const c = await cookies();
  const v = c.get(RAW_KEY_COOKIE)?.value ?? null;
  if (v) {
    c.delete(RAW_KEY_COOKIE);
  }
  return v;
}
