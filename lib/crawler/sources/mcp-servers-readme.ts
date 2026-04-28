import type { CrawlerHit } from "../types";

/**
 * Source: github.com/modelcontextprotocol/servers
 *
 * The README has a top-level "Reference Servers" + "Third-Party Servers"
 * section, where each entry is a markdown bullet of the form:
 *   - **[Name](relative-or-absolute-url)** - Description.
 *
 * We don't try to be perfect — we collect what we can and let the
 * extractor normalize. Anything ambiguous is dropped.
 */

const README_URL =
  "https://raw.githubusercontent.com/modelcontextprotocol/servers/main/README.md";

// Match: - **[Name](url)** - description
//   or:  - [Name](url) — description
const ENTRY_RE = /^\s*[-*]\s+\**\[([^\]]+)\]\(([^)]+)\)\**\s*[-—]\s*(.+)$/;

export async function crawlMcpServersReadme(): Promise<CrawlerHit[]> {
  const res = await fetch(README_URL, {
    headers: { "user-agent": "loadout-crawler" },
  });
  if (!res.ok) {
    throw new Error(`mcp-servers-readme: HTTP ${res.status}`);
  }
  const text = await res.text();

  const hits: CrawlerHit[] = [];
  for (const line of text.split("\n")) {
    const m = ENTRY_RE.exec(line);
    if (!m) continue;
    const [, name, url, desc] = m;
    if (!name || !url) continue;
    // Skip section anchors and irrelevant links.
    if (url.startsWith("#") || url.startsWith("./")) {
      // The official "Reference Servers" entries link to ./src/<name>; keep them
      // by promoting to the canonical repo URL.
      if (url.startsWith("./src/")) {
        const sub = url.slice(2); // "src/<name>"
        hits.push({
          name: name.trim(),
          repoUrl: `https://github.com/modelcontextprotocol/servers/tree/main/${sub}`,
          homepageUrl: undefined,
          description: desc.trim().slice(0, 400),
          sourceUrl: README_URL,
          sourceName: "mcp-servers-readme",
          kindHint: "mcp_server",
        });
      }
      continue;
    }
    if (!/^https?:\/\//i.test(url)) continue;

    // Distinguish between repo + homepage if possible.
    const isRepo = /github\.com|gitlab\.com|bitbucket\.org/.test(url);
    hits.push({
      name: name.trim(),
      repoUrl: isRepo ? url : undefined,
      homepageUrl: !isRepo ? url : undefined,
      description: desc.trim().slice(0, 400),
      sourceUrl: README_URL,
      sourceName: "mcp-servers-readme",
      kindHint: "mcp_server",
    });
  }
  return hits;
}
