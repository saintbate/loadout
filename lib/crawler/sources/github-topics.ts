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

const TOPICS = ["mcp", "mcp-server", "model-context-protocol"];
const MIN_STARS = 10;
const RECENT_WINDOW_DAYS = 180;

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
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=50`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      // 422 / 403 (rate limit) — skip this topic, keep going.
      console.warn(`[github-topics] ${topic}: HTTP ${res.status}`);
      continue;
    }
    const data = (await res.json()) as { items?: SearchItem[] };
    for (const item of data.items ?? []) {
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
  }

  return Array.from(seen.values());
}
