/**
 * Bulk-promote all pending queue entries into the tools directory.
 *
 * Skips entries with:
 *   - missing slug or name
 *   - slug that already exists in the tools table
 *   - invalid kind value
 *
 * Run:
 *   npm run promote
 *   npm run promote -- --dry-run   # log only, no writes
 */
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/client";
import { proposedToolsQueue, toolCapabilities, tools } from "../db/schema";

const DRY = process.argv.includes("--dry-run");

const ALLOWED_KINDS = [
  "mcp_server",
  "cli",
  "api",
  "library",
  "sdk",
  "service",
] as const;

async function main() {
  console.log(`[promote] mode=${DRY ? "dry-run" : "live"}`);

  const pending = await db
    .select()
    .from(proposedToolsQueue)
    .where(eq(proposedToolsQueue.status, "pending"));

  console.log(`[promote] ${pending.length} pending entries`);

  // Pre-load existing slugs to avoid duplicate inserts.
  const existingRows = await db.select({ slug: tools.slug }).from(tools);
  const existingSlugs = new Set(existingRows.map((r) => r.slug));

  let promoted = 0;
  let skippedDup = 0;
  let skippedBad = 0;
  const promotedIds: number[] = [];

  for (const row of pending) {
    const slug = row.slugSuggestion?.trim();
    const name = row.name?.trim();

    if (!slug || !name) {
      skippedBad++;
      continue;
    }

    if (existingSlugs.has(slug)) {
      skippedDup++;
      if (!DRY) {
        await db
          .update(proposedToolsQueue)
          .set({ status: "duplicate", reviewedAt: new Date() })
          .where(eq(proposedToolsQueue.id, row.id));
      }
      continue;
    }

    const kind = (ALLOWED_KINDS as readonly string[]).includes(row.kind ?? "")
      ? (row.kind as (typeof ALLOWED_KINDS)[number])
      : "service";

    if (!DRY) {
      try {
        const [created] = await db
          .insert(tools)
          .values({
            slug,
            name,
            kind,
            description: row.description ?? null,
            homepageUrl: row.homepageUrl ?? null,
            repoUrl: row.repoUrl ?? null,
            categoryTags: row.categoryTags ?? [],
            status: "available",
          })
          .returning({ id: tools.id });

        if (row.capabilities && row.capabilities.length > 0) {
          await db.insert(toolCapabilities).values(
            row.capabilities.map((c) => ({ toolId: created.id, capability: c })),
          );
        }

        existingSlugs.add(slug);
        promotedIds.push(row.id);
        promoted++;
      } catch (err) {
        console.warn(`[promote] failed to insert ${slug}:`, err);
        skippedBad++;
      }
    } else {
      console.log(`  → would promote: ${slug} (${kind})`);
      promoted++;
    }
  }

  // Batch-mark all successfully promoted rows.
  if (!DRY && promotedIds.length > 0) {
    await db
      .update(proposedToolsQueue)
      .set({ status: "promoted", reviewedAt: new Date() })
      .where(inArray(proposedToolsQueue.id, promotedIds));
  }

  console.log(
    `[promote] done — promoted=${promoted} skipped_dup=${skippedDup} skipped_bad=${skippedBad}`,
  );

  // Final count.
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(tools);
  console.log(`[promote] tools table now has ${count ?? "?"} entries`);
}

main().catch((err) => {
  console.error("[promote] fatal:", err);
  process.exit(1);
});
