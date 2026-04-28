import type { CrawlerHit } from "../types";

/**
 * Source: smithery.ai
 *
 * Scrapes the homepage's server listing. Brittle by nature — Smithery
 * doesn't publish a public API, so the selector heuristics below are
 * expected to break occasionally and need updating. The crawler skips
 * this source on any error rather than aborting the run.
 *
 * As of the last spot-check the homepage embeds JSON-LD or a simple
 * grid of /server/<slug> anchors. We extract those anchors and rely on
 * the README extraction step to fill in metadata.
 */

const HOMEPAGE = "https://smithery.ai";

const ANCHOR_RE =
  /<a[^>]+href="(\/server\/[^"#?]+)"[^>]*>([\s\S]*?)<\/a>/gi;

export async function crawlSmithery(): Promise<CrawlerHit[]> {
  const res = await fetch(HOMEPAGE, {
    headers: { "user-agent": "loadout-crawler" },
  });
  if (!res.ok) throw new Error(`smithery: HTTP ${res.status}`);
  const html = await res.text();

  const seen = new Map<string, CrawlerHit>();
  let m: RegExpExecArray | null;
  while ((m = ANCHOR_RE.exec(html))) {
    const path = m[1];
    const inner = m[2].replace(/<[^>]+>/g, "").trim();
    if (!inner) continue;
    const url = `${HOMEPAGE}${path}`;
    if (seen.has(url)) continue;
    const slugSeg = path.split("/").pop() ?? "";
    seen.set(url, {
      name: inner.slice(0, 80) || slugSeg,
      homepageUrl: url,
      description: "",
      sourceUrl: HOMEPAGE,
      sourceName: "smithery",
      kindHint: "mcp_server",
    });
  }

  return Array.from(seen.values());
}
