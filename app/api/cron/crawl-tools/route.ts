import { NextResponse } from "next/server";
import { runCrawl } from "@/lib/crawler";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes; bump if a crawl regularly runs longer

/**
 * Vercel Cron entry point. Configured in vercel.json:
 *   { "path": "/api/cron/crawl-tools", "schedule": "0 4 * * *" }
 *
 * Vercel auto-injects an `Authorization: Bearer $CRON_SECRET` header for
 * cron requests. We require it in production so the endpoint isn't open
 * to the world.
 *
 * In development (no CRON_SECRET set) the endpoint is callable directly.
 */
export async function GET(req: Request) {
  if (process.env.CRON_SECRET) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  // Default: do not enrich with LLM — the cron should be fast and cheap.
  // The /admin/queue review can fill in metadata. Set ?enrich=1 to override.
  const url = new URL(req.url);
  const enrich = url.searchParams.get("enrich") === "1";

  try {
    const summaries = await runCrawl({ enrichWithLLM: enrich });
    return NextResponse.json({ ok: true, summaries });
  } catch (err) {
    console.error("[cron/crawl-tools] failed", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
