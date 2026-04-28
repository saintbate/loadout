import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { proposedToolsQueue, tools } from "@/db/schema";
import { slugify } from "./slug";

export type ProposedToolInput = {
  slug: string;
  name: string;
  homepageUrl?: string | null;
  repoUrl?: string | null;
  description?: string | null;
  categoryTags?: string[];
  capabilities?: string[];
  kind?: string;
};

type Source = "planner" | "crawler" | "manual";

/**
 * Idempotent insert into proposed_tools_queue.
 *
 * - If a tool with the same slug already exists in `tools`, skip silently
 *   (it's already in the directory).
 * - If a queue row with the same slug exists, increment proposal_count and
 *   bump last_proposed_at.
 * - Otherwise insert a new row.
 *
 * Caller passes a flat list of proposed tools; this function does N round
 * trips (one per tool) — fine for the planner path (1-3 proposed/recipe)
 * and the crawler path (handles its own batching upstream).
 */
export async function queueProposedTools(
  proposals: ProposedToolInput[],
  context: Record<string, unknown>,
  source: Source = "planner",
): Promise<{ inserted: number; bumped: number; skipped: number }> {
  let inserted = 0;
  let bumped = 0;
  let skipped = 0;

  // Pre-load existing slugs in tools to short-circuit duplicates.
  const existingTools = new Set(
    (await db.select({ slug: tools.slug }).from(tools)).map((r) => r.slug),
  );

  for (const p of proposals) {
    const slug = slugify(p.slug || p.name);
    if (!slug) continue;
    if (existingTools.has(slug)) {
      skipped++;
      continue;
    }

    const existing = await db
      .select({ id: proposedToolsQueue.id })
      .from(proposedToolsQueue)
      .where(eq(proposedToolsQueue.slugSuggestion, slug))
      .limit(1);

    if (existing[0]) {
      await db
        .update(proposedToolsQueue)
        .set({
          proposalCount: sql`${proposedToolsQueue.proposalCount} + 1`,
          lastProposedAt: new Date(),
        })
        .where(eq(proposedToolsQueue.id, existing[0].id));
      bumped++;
    } else {
      await db.insert(proposedToolsQueue).values({
        slugSuggestion: slug,
        name: p.name || slug,
        kind:
          (p.kind as
            | "mcp_server"
            | "cli"
            | "api"
            | "library"
            | "sdk"
            | "service"
            | undefined) ?? null,
        homepageUrl: p.homepageUrl ?? null,
        repoUrl: p.repoUrl ?? null,
        description: p.description ?? null,
        categoryTags: p.categoryTags ?? [],
        capabilities: p.capabilities ?? [],
        source,
        sourceContext: context,
      });
      inserted++;
    }
  }

  return { inserted, bumped, skipped };
}
