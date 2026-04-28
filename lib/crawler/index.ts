import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  proposedToolsQueue,
  toolDiscoveryRuns,
  tools,
} from "@/db/schema";
import { slugify } from "../slug";
import { extractToolMetadata } from "./anthropic-extract";
import { crawlAwesomeMcp } from "./sources/awesome-mcp";
import { crawlGithubTopics } from "./sources/github-topics";
import { crawlHnAlgolia } from "./sources/hn-algolia";
import { crawlMcpServersReadme } from "./sources/mcp-servers-readme";
import { crawlSmithery } from "./sources/smithery";
import type { CrawlerHit } from "./types";

type SourceFn = () => Promise<CrawlerHit[]>;

const SOURCES: Array<{ name: string; fn: SourceFn }> = [
  { name: "mcp-servers-readme", fn: crawlMcpServersReadme },
  { name: "awesome-mcp", fn: crawlAwesomeMcp },
  { name: "smithery", fn: crawlSmithery },
  { name: "github-topics", fn: crawlGithubTopics },
  { name: "hn-algolia", fn: crawlHnAlgolia },
];

export type CrawlSummary = {
  source: string;
  status: "succeeded" | "partial" | "failed";
  found: number;
  newlyQueued: number;
  bumped: number;
  durationMs: number;
  error?: string;
};

/**
 * Run all crawler sources. Each source is isolated — a failure in one
 * doesn't cascade. Returns a per-source summary.
 *
 * Heavy: makes one Anthropic call per truly new tool to extract metadata.
 * Pass `enrichWithLLM=false` to skip LLM enrichment (faster, no Anthropic
 * cost). The /admin/queue review can fill in details by hand.
 */
export async function runCrawl(opts: {
  enrichWithLLM?: boolean;
  /** Per-source cap on hits we'll process. */
  perSourceLimit?: number;
} = {}): Promise<CrawlSummary[]> {
  const enrichWithLLM = opts.enrichWithLLM ?? false;
  const perSourceLimit = opts.perSourceLimit ?? 50;

  const summaries: CrawlSummary[] = [];

  // Pre-load existing slugs / repo URLs for de-dup.
  const [existingTools, existingQueue] = await Promise.all([
    db
      .select({
        slug: tools.slug,
        repoUrl: tools.repoUrl,
        homepageUrl: tools.homepageUrl,
      })
      .from(tools),
    db
      .select({
        slug: proposedToolsQueue.slugSuggestion,
        repoUrl: proposedToolsQueue.repoUrl,
        homepageUrl: proposedToolsQueue.homepageUrl,
        id: proposedToolsQueue.id,
      })
      .from(proposedToolsQueue),
  ]);

  const knownSlugs = new Set([
    ...existingTools.map((t) => t.slug),
    ...existingQueue.map((q) => q.slug),
  ]);
  const knownRepoUrls = new Set(
    [
      ...existingTools.map((t) => t.repoUrl),
      ...existingQueue.map((q) => q.repoUrl),
    ].filter((u): u is string => Boolean(u)),
  );
  const knownHomepageUrls = new Set(
    [
      ...existingTools.map((t) => t.homepageUrl),
      ...existingQueue.map((q) => q.homepageUrl),
    ].filter((u): u is string => Boolean(u)),
  );
  const queueIdBySlug = new Map(existingQueue.map((q) => [q.slug, q.id]));

  for (const { name, fn } of SOURCES) {
    const start = Date.now();
    let runStatus: "succeeded" | "partial" | "failed" = "succeeded";
    let errorMsg: string | undefined;
    let hits: CrawlerHit[] = [];
    try {
      hits = (await fn()).slice(0, perSourceLimit);
    } catch (err) {
      runStatus = "failed";
      errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[crawler] ${name} failed:`, err);
    }

    let newlyQueued = 0;
    let bumped = 0;
    for (const hit of hits) {
      try {
        const slug = slugify(hit.name);
        if (!slug) continue;

        // De-dup against tools + queue.
        if (knownSlugs.has(slug)) {
          // Existing queue entry — bump count.
          const existingId = queueIdBySlug.get(slug);
          if (existingId !== undefined) {
            await db
              .update(proposedToolsQueue)
              .set({
                proposalCount: sql`${proposedToolsQueue.proposalCount} + 1`,
                lastProposedAt: new Date(),
              })
              .where(eq(proposedToolsQueue.id, existingId));
            bumped++;
          }
          continue;
        }
        if (hit.repoUrl && knownRepoUrls.has(hit.repoUrl)) continue;
        if (hit.homepageUrl && knownHomepageUrls.has(hit.homepageUrl)) continue;

        // Optional LLM enrichment.
        let extracted: Awaited<ReturnType<typeof extractToolMetadata>> = null;
        if (enrichWithLLM) {
          // Fetch README if it's a GitHub repo.
          let readme = hit.description;
          if (hit.repoUrl?.startsWith("https://github.com/")) {
            try {
              readme = await fetchGithubReadme(hit.repoUrl);
            } catch {
              /* fall back to description */
            }
          }
          extracted = await extractToolMetadata({
            rawContext: readme,
            nameHint: hit.name,
            homepageHint: hit.homepageUrl,
            repoHint: hit.repoUrl,
          }).catch(() => null);
        }

        await db.insert(proposedToolsQueue).values({
          slugSuggestion: slug,
          name: extracted?.name || hit.name,
          kind: (extracted?.kind ?? hit.kindHint ?? null) as
            | "mcp_server"
            | "cli"
            | "api"
            | "library"
            | "sdk"
            | "service"
            | null,
          homepageUrl: hit.homepageUrl ?? null,
          repoUrl: hit.repoUrl ?? null,
          description: extracted?.description ?? hit.description,
          categoryTags: extracted?.category_tags ?? [],
          capabilities: extracted?.capabilities ?? [],
          source: "crawler",
          sourceContext: {
            source_name: hit.sourceName,
            source_url: hit.sourceUrl,
            raw_metadata: hit.rawMetadata ?? {},
          },
        });
        knownSlugs.add(slug);
        if (hit.repoUrl) knownRepoUrls.add(hit.repoUrl);
        if (hit.homepageUrl) knownHomepageUrls.add(hit.homepageUrl);
        newlyQueued++;
      } catch (err) {
        runStatus = "partial";
        console.error(`[crawler] ${name} entry failed:`, err);
      }
    }

    const durationMs = Date.now() - start;
    summaries.push({
      source: name,
      status: runStatus,
      found: hits.length,
      newlyQueued,
      bumped,
      durationMs,
      error: errorMsg,
    });

    // Audit row.
    await db
      .insert(toolDiscoveryRuns)
      .values({
        sourceName: name,
        toolsFoundCount: hits.length,
        toolsNewCount: newlyQueued,
        status: runStatus,
        notes: `bumped=${bumped} duration_ms=${durationMs}`,
        errorLog: errorMsg ?? null,
      })
      .catch((e) => console.error("[crawler] audit insert failed", e));
  }

  return summaries;
}

async function fetchGithubReadme(repoUrl: string): Promise<string> {
  // Normalize to https://github.com/<owner>/<repo>
  const m = /github\.com\/([^/]+)\/([^/?#]+)/.exec(repoUrl);
  if (!m) throw new Error("not a recognizable github URL");
  const [, owner, repoRaw] = m;
  const repo = repoRaw.replace(/\.git$/, "");
  const headers: Record<string, string> = {
    "user-agent": "loadout-crawler",
    accept: "application/vnd.github.raw",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/readme`,
    { headers },
  );
  if (!res.ok) throw new Error(`github readme fetch HTTP ${res.status}`);
  return await res.text();
}
