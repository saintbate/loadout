import Link from "next/link";
import { and, desc, ilike, ne, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { recipes } from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import { BrowseFilters } from "./_filters";

export const dynamic = "force-dynamic";

const SORTS = {
  popular: "Most used",
  recent: "Recent",
} as const;
type SortKey = keyof typeof SORTS;

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tag?: string; sort?: string }>;
}) {
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const tag = (params.tag ?? "").trim();
  const sort: SortKey = params.sort === "recent" ? "recent" : "popular";

  const conditions = [ne(recipes.status, "deprecated" as const)];
  if (q) {
    conditions.push(
      or(
        ilike(recipes.title, `%${q}%`),
        ilike(recipes.goalDescription, `%${q}%`),
      )!,
    );
  }
  if (tag) {
    conditions.push(sql`${tag} = ANY(${recipes.categoryTags})`);
  }

  const orderBy =
    sort === "popular"
      ? [desc(recipes.useCount), desc(recipes.verifiedAt)]
      : [desc(recipes.createdAt)];

  const rows = await db
    .select({
      id: recipes.id,
      slug: recipes.slug,
      title: recipes.title,
      goalDescription: recipes.goalDescription,
      planJson: recipes.planJson,
      status: recipes.status,
      categoryTags: recipes.categoryTags,
      useCount: recipes.useCount,
      createdAt: recipes.createdAt,
    })
    .from(recipes)
    .where(and(...conditions))
    .orderBy(...orderBy)
    .limit(60);

  // Collect all tags for the filter chip strip.
  const allTagsRows = await db
    .select({ tags: recipes.categoryTags })
    .from(recipes);
  const tagCounts = new Map<string, number>();
  for (const r of allTagsRows) {
    for (const t of r.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  }
  const allTags = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([t]) => t);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Browse recipes</h1>
        <p className="text-sm text-neutral-500">
          {rows.length} recipe{rows.length === 1 ? "" : "s"}
          {q && (
            <>
              {" "}for <span className="text-neutral-900">&ldquo;{q}&rdquo;</span>
            </>
          )}
          {tag && (
            <>
              {" "}tagged <span className="text-neutral-900">{tag}</span>
            </>
          )}
        </p>
      </div>

      <BrowseFilters
        initialQ={q}
        activeTag={tag}
        activeSort={sort}
        tags={allTags}
      />

      <ul className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
        {rows.map((r) => (
          <li
            key={r.id}
            className="rounded-md border border-neutral-200 bg-white p-4 transition hover:border-neutral-300"
          >
            <Link href={`/recipe/${r.slug}`} className="block space-y-2">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-base font-semibold leading-tight">
                  {r.title}
                </h2>
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
              <p className="line-clamp-2 text-sm text-neutral-600">
                {r.planJson?.summary ?? r.goalDescription}
              </p>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-neutral-500">
                {r.categoryTags.slice(0, 5).map((t) => (
                  <span
                    key={t}
                    className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono"
                  >
                    {t}
                  </span>
                ))}
                <span className="ml-auto">{r.useCount} runs</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {rows.length === 0 && (
        <p className="mt-12 text-center text-sm text-neutral-500">
          No recipes match. Try clearing filters.
        </p>
      )}
    </main>
  );
}

export { type SortKey };
