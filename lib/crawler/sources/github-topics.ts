import type { CrawlerHit } from "../types";

/**
 * Source: GitHub repository search by topic.
 *
 * Searches for repos tagged 'mcp', 'mcp-server', or 'model-context-protocol',
 * filters to >10 stars + recently updated, and returns hits.
 *
 * GITHUB_TOKEN is optional but strongly recommended (raises rate limits
 * from 60/hour to 5000/hour).
 */

const TOPICS = ["mcp", "mcp-server", "model-context-protocol", "claude-mcp", "mcp-tools"];
const MIN_STARS = 5;
const RECENT_WINDOW_DAYS = 365;
const MAX_PAGES = 3; // up to 3 pages × 100 items per topic

type SearchItem = {
  name: string;
  full_name: string;
  html_url: string;
  homepage: string | null;
  description: string | null;
  stargazers_count: number;
  pushed_at: string;
};

export async function crawlGithubTopics(): Promise<CrawlerHit[]> {
  const since = new Date();
  since.setDate(since.getDate() - RECENT_WINDOW_DAYS);
  const sinceStr = since.toISOString().slice(0, 10);

  const headers: Record<string, string> = {
    "user-agent": "loadout-crawler",
    accept: "application/vnd.github+json",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const seen = new Map<string, CrawlerHit>();

  for (const topic of TOPICS) {
    const q = `topic:${topic} stars:>=${MIN_STARS} pushed:>=${sinceStr}`;
    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=100&page=${page}`;
      const res = await fetch(url, { headers });
      if (!res.ok) {
        // 422 / 403 (rate limit) — stop paging this topic.
        console.warn(`[github-topics] ${topic} page ${page}: HTTP ${res.status}`);
        break;
      }
      const data = (await res.json()) as { items?: SearchItem[]; total_count?: number };
      const items = data.items ?? [];
      for (const item of items) {
        if (seen.has(item.full_name)) continue;
        seen.set(item.full_name, {
          name: item.name,
          repoUrl: item.html_url,
          homepageUrl: item.homepage || undefined,
          description: item.description?.slice(0, 400) ?? "",
          sourceUrl: `https://github.com/topics/${topic}`,
          sourceName: "github-topics",
          kindHint: topic.includes("mcp") ? "mcp_server" : undefined,
          rawMetadata: {
            stars: item.stargazers_count,
            pushed_at: item.pushed_at,
            topic,
          },
        });
      }
      // Stop paging if this was the last page.
      if (items.length < 100) break;
    }
  }

  return Array.from(seen.values());
}
