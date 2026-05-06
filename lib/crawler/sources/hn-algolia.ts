import type { CrawlerHit } from "../types";

/**
 * Source: Hacker News Algolia search API.
 *
 * Pulls "Show HN" posts mentioning MCP/AI agent/LLM tool from the last
 * 30 days. These are leads, not directory entries — most won't have
 * extractable metadata, but the queue triage UI lets a human decide.
 */

const QUERIES = [
  "Show HN MCP",
  "Show HN AI agent",
  "Show HN LLM tool",
  "Show HN model context protocol",
  "Show HN Claude tool",
  "Show HN MCP server",
];

const WINDOW_DAYS = 180;

type AlgoliaHit = {
  objectID: string;
  title: string | null;
  url: string | null;
  story_text: string | null;
  created_at_i: number;
};

export async function crawlHnAlgolia(): Promise<CrawlerHit[]> {
  const sinceTs = Math.floor(
    (Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000) / 1000,
  );

  const seen = new Map<string, CrawlerHit>();

  for (const q of QUERIES) {
    const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=show_hn&numericFilters=created_at_i>${sinceTs}&hitsPerPage=50`;
    const res = await fetch(url, {
      headers: { "user-agent": "loadout-crawler" },
    });
    if (!res.ok) {
      console.warn(`[hn-algolia] "${q}": HTTP ${res.status}`);
      continue;
    }
    const data = (await res.json()) as { hits?: AlgoliaHit[] };

    for (const hit of data.hits ?? []) {
      if (!hit.url) continue;
      if (seen.has(hit.url)) continue;
      const title = (hit.title ?? "").replace(/^Show HN:\s*/i, "").trim();
      if (!title) continue;
      const isRepo = /github\.com|gitlab\.com|bitbucket\.org/.test(hit.url);
      seen.set(hit.url, {
        name: title.split(/\s+[-—–]\s+/)[0]?.slice(0, 60) ?? title,
        repoUrl: isRepo ? hit.url : undefined,
        homepageUrl: !isRepo ? hit.url : undefined,
        description: (hit.story_text ?? title).slice(0, 400),
        sourceUrl: `https://news.ycombinator.com/item?id=${hit.objectID}`,
        sourceName: "hn-algolia",
        rawMetadata: { hn_object_id: hit.objectID, query: q },
      });
    }
  }

  return Array.from(seen.values());
}
