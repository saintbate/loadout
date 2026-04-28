import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  proposedToolsQueue,
  toolDiscoveryRuns,
  users,
} from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import { isAdmin } from "@/lib/auth-helpers";
import { QueueTable } from "./_table";
import { ManualAddTool } from "./_manual-add";

export const dynamic = "force-dynamic";

const TABS = ["pending", "promoted", "rejected"] as const;
type Tab = (typeof TABS)[number];

export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  if (!(await isAdmin())) notFound();

  const { tab: tabRaw } = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(tabRaw ?? "")
    ? (tabRaw as Tab)
    : "pending";

  const rows = await db
    .select({
      id: proposedToolsQueue.id,
      slugSuggestion: proposedToolsQueue.slugSuggestion,
      name: proposedToolsQueue.name,
      kind: proposedToolsQueue.kind,
      homepageUrl: proposedToolsQueue.homepageUrl,
      repoUrl: proposedToolsQueue.repoUrl,
      description: proposedToolsQueue.description,
      categoryTags: proposedToolsQueue.categoryTags,
      capabilities: proposedToolsQueue.capabilities,
      source: proposedToolsQueue.source,
      sourceContext: proposedToolsQueue.sourceContext,
      proposalCount: proposedToolsQueue.proposalCount,
      lastProposedAt: proposedToolsQueue.lastProposedAt,
      firstProposedAt: proposedToolsQueue.firstProposedAt,
      status: proposedToolsQueue.status,
      reviewerUserId: proposedToolsQueue.reviewerUserId,
      reviewedAt: proposedToolsQueue.reviewedAt,
      notes: proposedToolsQueue.notes,
    })
    .from(proposedToolsQueue)
    .where(eq(proposedToolsQueue.status, tab))
    .orderBy(
      desc(proposedToolsQueue.proposalCount),
      desc(proposedToolsQueue.lastProposedAt),
    );

  // Hydrate reviewer Clerk IDs (optional metadata).
  const reviewerIds = Array.from(
    new Set(rows.map((r) => r.reviewerUserId).filter((x): x is number => !!x)),
  );
  let reviewerById = new Map<number, string>();
  if (reviewerIds.length > 0) {
    const ru = await db
      .select({ id: users.id, clerkId: users.clerkId })
      .from(users)
      .where(inArray(users.id, reviewerIds));
    reviewerById = new Map(ru.map((u) => [u.id, u.clerkId]));
  }

  // Counts for the tab strip.
  const tabCounts = await Promise.all(
    TABS.map(async (t) => {
      const count = await db
        .select({ id: proposedToolsQueue.id })
        .from(proposedToolsQueue)
        .where(eq(proposedToolsQueue.status, t));
      return [t, count.length] as const;
    }),
  );
  const counts = Object.fromEntries(tabCounts) as Record<Tab, number>;

  // Recent crawl summary (top 5).
  const recentRuns = await db
    .select({
      sourceName: toolDiscoveryRuns.sourceName,
      ranAt: toolDiscoveryRuns.ranAt,
      toolsFoundCount: toolDiscoveryRuns.toolsFoundCount,
      toolsNewCount: toolDiscoveryRuns.toolsNewCount,
      status: toolDiscoveryRuns.status,
      notes: toolDiscoveryRuns.notes,
    })
    .from(toolDiscoveryRuns)
    .orderBy(desc(toolDiscoveryRuns.ranAt))
    .limit(10);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex items-baseline justify-between">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-neutral-500">
            internal
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Tool queue
          </h1>
          <p className="text-sm text-neutral-500">
            Triage discovered tools. Promote good ones into the directory,
            reject the rest. J/K to navigate, P/R to promote/reject.
          </p>
        </div>
        <Link
          href="/admin"
          className="text-xs text-neutral-500 hover:text-neutral-900"
        >
          ← back to admin
        </Link>
      </div>

      <nav className="mt-6 flex gap-1 rounded-md bg-neutral-100 p-1 text-xs font-medium">
        {TABS.map((t) => (
          <Link
            key={t}
            href={`/admin/queue?tab=${t}`}
            className={`flex-1 rounded px-3 py-1.5 text-center transition ${
              tab === t
                ? "bg-white text-neutral-900 shadow-sm"
                : "text-neutral-600 hover:text-neutral-900"
            }`}
          >
            {t} ({counts[t] ?? 0})
          </Link>
        ))}
      </nav>

      {recentRuns.length > 0 && (
        <details className="mt-4 rounded-md border border-neutral-200 bg-white">
          <summary className="cursor-pointer px-4 py-2 text-xs font-medium text-neutral-700">
            Recent crawler runs ({recentRuns.length})
          </summary>
          <ul className="divide-y divide-neutral-100 px-4 pb-3">
            {recentRuns.map((r, i) => (
              <li
                key={i}
                className="flex items-center gap-3 py-1.5 font-mono text-[11px] text-neutral-600"
              >
                <span className="w-44 truncate">{r.sourceName}</span>
                <Badge
                  variant={
                    r.status === "succeeded"
                      ? "verified"
                      : r.status === "partial"
                        ? "untested"
                        : "default"
                  }
                >
                  {r.status}
                </Badge>
                <span>found={r.toolsFoundCount}</span>
                <span>new={r.toolsNewCount}</span>
                <span className="ml-auto text-neutral-400">
                  {r.ranAt.toISOString().slice(0, 16).replace("T", " ")}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <QueueTable
        rows={rows.map((r) => ({
          ...r,
          reviewerClerkId: r.reviewerUserId
            ? reviewerById.get(r.reviewerUserId) ?? null
            : null,
          lastProposedAt: r.lastProposedAt.toISOString(),
          firstProposedAt: r.firstProposedAt.toISOString(),
          reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
        }))}
        tab={tab}
      />

      {tab === "pending" && (
        <section className="mt-12">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-700">
            Add a tool manually
          </h2>
          <p className="mt-1 text-xs text-neutral-500">
            Bypass the queue. Lands directly in the directory.
          </p>
          <ManualAddTool />
        </section>
      )}
    </main>
  );
}
