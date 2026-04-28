import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { recipes, users } from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isAdmin } from "@/lib/auth-helpers";
import {
  demoteRecipe,
  deprecateRecipe,
  promoteRecipe,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!(await isAdmin())) {
    // Don't reveal that this page exists.
    notFound();
  }

  const rows = await db
    .select({
      id: recipes.id,
      slug: recipes.slug,
      title: recipes.title,
      status: recipes.status,
      useCount: recipes.useCount,
      createdAt: recipes.createdAt,
      summary: recipes.planJson,
      contributorClerkId: users.clerkId,
    })
    .from(recipes)
    .leftJoin(users, eq(users.id, recipes.contributorUserId))
    .orderBy(desc(recipes.createdAt));

  const groups: Record<string, typeof rows> = {
    community: [],
    draft: [],
    verified: [],
    deprecated: [],
  };
  for (const r of rows) {
    (groups[r.status] ??= []).push(r);
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex items-baseline justify-between">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-neutral-500">
            internal
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
          <p className="text-sm text-neutral-500">
            Promote community submissions to verified once you&apos;ve
            confirmed they work. Demote or deprecate as needed.
          </p>
        </div>
        <Link
          href="/admin/queue"
          className="text-sm text-neutral-700 underline-offset-2 hover:underline"
        >
          Tool queue →
        </Link>
      </div>

      <Section title="Awaiting review" tone="active" rows={groups.community}>
        {(r) => (
          <div className="flex gap-2">
            <form action={promoteRecipe}>
              <input type="hidden" name="id" value={r.id} />
              <Button type="submit" size="sm">
                Promote → verified
              </Button>
            </form>
            <form action={deprecateRecipe}>
              <input type="hidden" name="id" value={r.id} />
              <Button type="submit" size="sm" variant="ghost">
                Deprecate
              </Button>
            </form>
          </div>
        )}
      </Section>

      <Section title="Drafts (homepage planner)" tone="muted" rows={groups.draft}>
        {(r) => (
          <div className="flex gap-2">
            <form action={promoteRecipe}>
              <input type="hidden" name="id" value={r.id} />
              <Button type="submit" size="sm" variant="secondary">
                Promote → verified
              </Button>
            </form>
            <form action={deprecateRecipe}>
              <input type="hidden" name="id" value={r.id} />
              <Button type="submit" size="sm" variant="ghost">
                Deprecate
              </Button>
            </form>
          </div>
        )}
      </Section>

      <Section title="Verified" tone="muted" rows={groups.verified}>
        {(r) => (
          <div className="flex gap-2">
            <form action={demoteRecipe}>
              <input type="hidden" name="id" value={r.id} />
              <Button type="submit" size="sm" variant="ghost">
                Demote → community
              </Button>
            </form>
            <form action={deprecateRecipe}>
              <input type="hidden" name="id" value={r.id} />
              <Button type="submit" size="sm" variant="ghost">
                Deprecate
              </Button>
            </form>
          </div>
        )}
      </Section>

      <Section title="Deprecated" tone="muted" rows={groups.deprecated}>
        {(r) => (
          <form action={promoteRecipe}>
            <input type="hidden" name="id" value={r.id} />
            <Button type="submit" size="sm" variant="ghost">
              Restore → verified
            </Button>
          </form>
        )}
      </Section>
    </main>
  );
}

type RowsForSection = Array<{
  id: number;
  slug: string;
  title: string;
  status: "draft" | "verified" | "community" | "deprecated";
  useCount: number;
  createdAt: Date;
  summary: { summary: string } | null;
  contributorClerkId: string | null;
}>;

function Section({
  title,
  tone,
  rows,
  children,
}: {
  title: string;
  tone: "active" | "muted";
  rows: RowsForSection;
  children: (r: RowsForSection[number]) => React.ReactNode;
}) {
  return (
    <section
      className={
        tone === "active"
          ? "mt-8 rounded-md border border-neutral-300 bg-white"
          : "mt-6"
      }
    >
      <header className="flex items-baseline justify-between px-4 pt-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-700">
          {title}
        </h2>
        <span className="text-xs text-neutral-500">{rows.length}</span>
      </header>
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-xs text-neutral-500">Nothing here.</p>
      ) : (
        <ul className="mt-2 divide-y divide-neutral-200">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex items-start gap-4 px-4 py-3 text-sm"
            >
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/recipe/${r.slug}`}
                    className="truncate font-medium text-neutral-900 hover:underline"
                  >
                    {r.title}
                  </Link>
                  <Badge
                    variant={
                      r.status === "verified"
                        ? "verified"
                        : r.status === "community"
                          ? "default"
                          : "untested"
                    }
                  >
                    {r.status}
                  </Badge>
                </div>
                <p className="line-clamp-1 text-xs text-neutral-500">
                  {r.summary?.summary ?? "(no summary)"}
                </p>
                <p className="font-mono text-[10px] text-neutral-400">
                  {r.slug} · {r.useCount} runs ·{" "}
                  {r.createdAt.toISOString().slice(0, 10)}
                  {r.contributorClerkId && (
                    <> · by {r.contributorClerkId.slice(0, 12)}…</>
                  )}
                </p>
              </div>
              <div className="shrink-0">{children(r)}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
