/**
 * One-shot crawler runner. Useful for iteration during development.
 *
 *   npm run crawl                        # all sources, no LLM enrichment
 *   npm run crawl -- --enrich            # also run Anthropic on each new hit
 *
 * On Vercel this is unused — the cron triggers /api/cron/crawl-tools.
 */
import { runCrawl } from "@/lib/crawler";

async function main() {
  const enrich = process.argv.includes("--enrich");
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const perSourceLimit = limitArg ? parseInt(limitArg.split("=")[1], 10) : 50;
  console.log(`[crawl] starting (enrichWithLLM=${enrich} perSourceLimit=${perSourceLimit})`);
  const summaries = await runCrawl({ enrichWithLLM: enrich, perSourceLimit });
  for (const s of summaries) {
    console.log(
      `[crawl] ${s.source.padEnd(22)} status=${s.status} found=${s.found} new=${s.newlyQueued} bumped=${s.bumped} ${s.durationMs}ms${s.error ? `  ERR: ${s.error}` : ""}`,
    );
  }
  const total = summaries.reduce((acc, s) => acc + s.newlyQueued, 0);
  console.log(`[crawl] done. ${total} new tools queued.`);
}

main().catch((err) => {
  console.error("[crawl] fatal", err);
  process.exit(1);
});
