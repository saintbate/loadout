import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { tools, userPreferences } from "@/db/schema";

export const PREFERENCE_CATEGORIES = [
  "database",
  "orm",
  "auth",
  "llm_provider",
  "deployment",
  "frontend_framework",
  "styling",
  "payment",
  "email",
  "observability",
  "vector_db",
  "search",
] as const;

export type PreferenceCategory = (typeof PREFERENCE_CATEGORIES)[number];

export const PREFERENCE_LABELS: Record<PreferenceCategory, string> = {
  database: "Database",
  orm: "ORM",
  auth: "Authentication",
  llm_provider: "LLM provider",
  deployment: "Deployment",
  frontend_framework: "Frontend framework",
  styling: "Styling",
  payment: "Payments",
  email: "Email",
  observability: "Observability",
  vector_db: "Vector DB",
  search: "Search",
};

/**
 * Heuristic for offering a starting set of directory tools per category.
 * The /settings page also lets the user pick anything that matches by
 * search, but having sane defaults reduces the typing burden.
 */
export const PREFERENCE_TAG_HINTS: Record<PreferenceCategory, string[]> = {
  database: ["database", "postgres", "sql"],
  orm: ["orm", "database"],
  auth: ["auth", "authentication"],
  llm_provider: ["llm", "ai", "anthropic", "openai"],
  deployment: ["deployment", "hosting"],
  frontend_framework: ["frontend", "framework", "react"],
  styling: ["styling", "css"],
  payment: ["payment", "billing"],
  email: ["email"],
  observability: ["observability", "monitoring", "logging"],
  vector_db: ["vector", "embedding"],
  search: ["search", "retrieval"],
};

export type LoadedPreference = {
  category: PreferenceCategory;
  preferredToolSlug: string | null;
  preferredToolName: string | null;
  /** Resolved name to show in prompts/UI. Falls back to slug, then text input, then null. */
  displayName: string | null;
};

/** Returns one entry per category (empty if user has nothing set there). */
export async function loadUserPreferences(
  userId: number,
): Promise<LoadedPreference[]> {
  const rows = await db
    .select({
      category: userPreferences.category,
      preferredToolSlug: userPreferences.preferredToolSlug,
      preferredToolName: userPreferences.preferredToolName,
    })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId));

  if (rows.length === 0) return [];

  // Resolve directory names for any rows pinned to a slug.
  const slugs = rows
    .map((r) => r.preferredToolSlug)
    .filter((s): s is string => Boolean(s));
  let nameBySlug = new Map<string, string>();
  if (slugs.length > 0) {
    const dir = await db
      .select({ slug: tools.slug, name: tools.name })
      .from(tools);
    nameBySlug = new Map(
      dir
        .filter((d) => slugs.includes(d.slug))
        .map((d) => [d.slug, d.name]),
    );
  }

  return rows.map((r) => ({
    category: r.category as PreferenceCategory,
    preferredToolSlug: r.preferredToolSlug,
    preferredToolName: r.preferredToolName,
    displayName:
      (r.preferredToolSlug && nameBySlug.get(r.preferredToolSlug)) ||
      r.preferredToolName ||
      null,
  }));
}

/**
 * Format prefs for the planner system message. Empty string if nothing set.
 *
 * Example output:
 *   USER PREFERENCES:
 *     database = neon
 *     orm = drizzle-orm
 *     llm_provider = anthropic-sdk-typescript (Anthropic SDK for TypeScript)
 */
export function formatPreferencesForPrompt(prefs: LoadedPreference[]): string {
  const meaningful = prefs.filter(
    (p) => p.preferredToolSlug || p.preferredToolName,
  );
  if (meaningful.length === 0) return "";

  const lines = meaningful.map((p) => {
    const label = p.preferredToolSlug ?? p.preferredToolName!;
    const display =
      p.displayName && p.displayName !== label ? ` (${p.displayName})` : "";
    return `  ${p.category} = ${label}${display}`;
  });
  return ["USER PREFERENCES:", ...lines].join("\n");
}
