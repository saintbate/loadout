import type { CrawlerHit } from "../types";

/**
 * Source: github.com/punkpeye/awesome-mcp-servers
 *
 * Categorized list. Same bullet format as the official README; we use the
 * same regex.
 */

const README_URL =
  "https://raw.githubusercontent.com/punkpeye/awesome-mcp-servers/main/README.md";

const ENTRY_RE = /^\s*[-*]\s+\**\[([^\]]+)\]\(([^)]+)\)\**\s*[-—]\s*(.+)$/;

export async function crawlAwesomeMcp(): Promise<CrawlerHit[]> {
  const res = await fetch(README_URL, {
    headers: { "user-agent": "loadout-crawler" },
  });
  if (!res.ok) throw new Error(`awesome-mcp: HTTP ${res.status}`);
  const text = await res.text();

  const hits: CrawlerHit[] = [];
  for (const line of text.split("\n")) {
    const m = ENTRY_RE.exec(line);
    if (!m) continue;
    const [, name, url, desc] = m;
    if (!name || !url) continue;
    if (!/^https?:\/\//i.test(url)) continue;

    const isRepo = /github\.com|gitlab\.com|bitbucket\.org/.test(url);
    hits.push({
      name: name.trim(),
      repoUrl: isRepo ? url : undefined,
      homepageUrl: !isRepo ? url : undefined,
      description: desc.trim().slice(0, 400),
      sourceUrl: README_URL,
      sourceName: "awesome-mcp",
      kindHint: "mcp_server",
    });
  }
  return hits;
}
