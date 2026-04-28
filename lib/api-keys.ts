import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { apiKeys } from "@/db/schema";

/**
 * API key shape:
 *   lo_<12-char prefix>_<48-char secret>
 *
 *   prefix: random base64url, stored unhashed for O(1) lookup at auth time.
 *   secret: random 36 bytes base64url. Only the scrypt hash is stored.
 *
 * The raw key is shown once on generation. After that we keep:
 *   - prefix (for the lookup)
 *   - secret_hash + salt (for verification)
 *   - last_four (so the UI can show "lo_abc…wxyz" later)
 */

const SCRYPT_N = 16384; // CPU/memory cost
const SCRYPT_KEYLEN = 32;

function base64url(bytes: Buffer): string {
  return bytes
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function generatePrefix(): string {
  return base64url(randomBytes(9)).slice(0, 12);
}

function generateSecret(): string {
  return base64url(randomBytes(36)).slice(0, 48);
}

function hashSecret(secret: string, saltHex: string): string {
  const salt = Buffer.from(saltHex, "hex");
  const derived = scryptSync(secret, salt, SCRYPT_KEYLEN, { N: SCRYPT_N });
  return derived.toString("hex");
}

/** Generate a fresh key for `userId`. Returns the raw key (show once). */
export async function createApiKey(args: {
  userId: number;
  name?: string;
}): Promise<{ rawKey: string; prefix: string; lastFour: string; id: number }> {
  // Retry on the unlikely prefix collision.
  let prefix = generatePrefix();
  for (let i = 0; i < 4; i++) {
    const dup = await db
      .select({ id: apiKeys.id })
      .from(apiKeys)
      .where(eq(apiKeys.prefix, prefix))
      .limit(1);
    if (dup.length === 0) break;
    prefix = generatePrefix();
  }

  const secret = generateSecret();
  const saltHex = randomBytes(16).toString("hex");
  const secretHash = hashSecret(secret, saltHex);
  const rawKey = `lo_${prefix}_${secret}`;
  const lastFour = secret.slice(-4);

  const [row] = await db
    .insert(apiKeys)
    .values({
      userId: args.userId,
      prefix,
      secretHash,
      salt: saltHex,
      name: args.name ?? null,
      lastFour,
    })
    .returning({ id: apiKeys.id });

  return { rawKey, prefix, lastFour, id: row.id };
}

/**
 * Validate a raw key from a Bearer header. Returns the user_id on success
 * or null on any failure (bad format, unknown prefix, wrong secret, revoked).
 *
 * Side effect: bumps `last_used_at` on success (best-effort, fire-and-forget).
 */
export async function authenticateApiKey(
  rawKey: string,
): Promise<{ userId: number; keyId: number } | null> {
  if (!rawKey) return null;
  if (!rawKey.startsWith("lo_")) return null;

  const parts = rawKey.split("_");
  // Expect: ["lo", prefix, secret]. Extra underscores in the secret would
  // get split, so rejoin from index 2.
  if (parts.length < 3) return null;
  const prefix = parts[1];
  const secret = parts.slice(2).join("_");
  if (!prefix || !secret) return null;

  const [row] = await db
    .select({
      id: apiKeys.id,
      userId: apiKeys.userId,
      secretHash: apiKeys.secretHash,
      salt: apiKeys.salt,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.prefix, prefix))
    .limit(1);
  if (!row) return null;
  if (row.revokedAt) return null;

  let candidateHash: string;
  try {
    candidateHash = hashSecret(secret, row.salt);
  } catch {
    return null;
  }
  const a = Buffer.from(candidateHash, "hex");
  const b = Buffer.from(row.secretHash, "hex");
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  // Best-effort last_used_at bump. Don't await.
  void db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, row.id))
    .catch(() => {});

  return { userId: row.userId, keyId: row.id };
}

/** Revoke (soft-delete) all keys for a user — used when generating a fresh one. */
export async function revokeAllKeysForUser(userId: number): Promise<void> {
  await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(eq(apiKeys.userId, userId));
}

/** UI-friendly listing of a user's keys (no secrets). */
export async function listKeysForUser(userId: number) {
  return db
    .select({
      id: apiKeys.id,
      prefix: apiKeys.prefix,
      lastFour: apiKeys.lastFour,
      name: apiKeys.name,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.userId, userId));
}
