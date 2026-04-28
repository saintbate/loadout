/**
 * What a single crawler source returns. The orchestrator normalizes/dedups
 * across sources, then optionally calls the Anthropic extractor for richer
 * metadata before queueing.
 */
export type CrawlerHit = {
  name: string;
  repoUrl?: string;
  homepageUrl?: string;
  description: string;
  sourceUrl: string;
  sourceName: string;
  kindHint?: "mcp_server" | "cli" | "api" | "library" | "sdk" | "service";
  rawMetadata?: Record<string, unknown>;
};
