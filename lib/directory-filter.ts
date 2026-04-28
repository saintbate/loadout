import { inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { toolCapabilities, tools } from "@/db/schema";
import type { DirectoryToolForPlanner } from "./planner-prompt";

const STOPWORDS = new Set([
  "a", "an", "and", "or", "the", "to", "of", "for", "in", "on", "with",
  "build", "make", "create", "want", "need", "i", "my", "me", "is", "are",
  "be", "that", "this", "it", "as", "by", "at", "from", "use", "using",
]);

function keywordsFromGoal(goal: string): string[] {
  return Array.from(
    new Set(
      goal
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !STOPWORDS.has(w)),
    ),
  );
}

/**
 * Returns up to `limit` directory tools whose name or category_tags match
 * any keyword from the goal. Always includes any `pinSlugs` so the user's
 * preferred tools surface regardless of keyword overlap.
 *
 * Filters out 'discovered' and 'deprecated' tools per the trust ladder.
 *
 * For now this is a cheap LIKE / array overlap. Once the directory grows,
 * swap for embedding similarity.
 */
export async function findRelevantTools(
  goal: string,
  limit = 30,
  pinSlugs: string[] = [],
): Promise<DirectoryToolForPlanner[]> {
  const keywords = keywordsFromGoal(goal);

  let matched: Array<typeof tools.$inferSelect>;
  if (keywords.length === 0) {
    // Fallback: return some recommendable tools so the model sees the
    // directory exists. Use raw SQL for the NOT IN clause to bypass the
    // strict enum typing that fights with our string array.
    matched = await db
      .select()
      .from(tools)
      .where(
        sql`${tools.status} NOT IN ('discovered', 'deprecated')`,
      )
      .limit(limit);
  } else {
    // Build a single SQL: (name ILIKE …) OR (category_tags && ARRAY[…])
    const namePattern = sql.join(
      keywords.map((k) => sql`${tools.name} ILIKE ${"%" + k + "%"}`),
      sql` OR `,
    );
    const tagsArray = sql`ARRAY[${sql.join(
      keywords.map((k) => sql`${k}`),
      sql`, `,
    )}]::text[]`;

    matched = await db
      .select()
      .from(tools)
      .where(
        sql`((${namePattern}) OR (${tools.categoryTags} && ${tagsArray})) AND ${tools.status} NOT IN ('discovered', 'deprecated')`,
      )
      .limit(limit);
  }

  // Pin user-preferred slugs even if the keyword search missed them.
  if (pinSlugs.length > 0) {
    const matchedSlugs = new Set(matched.map((m) => m.slug));
    const missing = pinSlugs.filter((s) => !matchedSlugs.has(s));
    if (missing.length > 0) {
      const pins = await db
        .select()
        .from(tools)
        .where(inArray(tools.slug, missing));
      matched = [...pins, ...matched];
    }
  }

  return enrichWithCapabilities(matched);
}

async function enrichWithCapabilities(
  rows: Array<typeof tools.$inferSelect>,
): Promise<DirectoryToolForPlanner[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const caps = await db
    .select()
    .from(toolCapabilities)
    .where(inArray(toolCapabilities.toolId, ids));

  const capsByTool = new Map<number, string[]>();
  for (const c of caps) {
    const list = capsByTool.get(c.toolId) ?? [];
    list.push(c.capability);
    capsByTool.set(c.toolId, list);
  }

  return rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    kind: r.kind,
    status: r.status,
    description: r.description,
    category_tags: r.categoryTags,
    capabilities: capsByTool.get(r.id) ?? [],
  }));
}
