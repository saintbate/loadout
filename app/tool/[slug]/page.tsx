import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, inArray, ne, or } from "drizzle-orm";
import { db } from "@/db/client";
import {
  recipeTools,
  recipes,
  toolCapabilities,
  toolCompatibility,
  tools,
} from "@/db/schema";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const RELATIONSHIP_LABEL: Record<string, string> = {
  works_with: "Works with",
  conflicts_with: "Conflicts with",
  replaces: "Replaces",
  requires: "Requires",
};

export default async function ToolPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [tool] = await db
    .select()
    .from(tools)
    .where(eq(tools.slug, slug))
    .limit(1);
  if (!tool) notFound();

  const caps = await db
    .select()
    .from(toolCapabilities)
    .where(eq(toolCapabilities.toolId, tool.id));

  // Compatibility links (both directions).
  const compat = await db
    .select()
    .from(toolCompatibility)
    .where(
      or(
        eq(toolCompatibility.toolAId, tool.id),
        eq(toolCompatibility.toolBId, tool.id),
      )!,
    );
  const otherIds = Array.from(
    new Set(
      compat.map((c) => (c.toolAId === tool.id ? c.toolBId : c.toolAId)),
    ),
  );
  const otherTools = otherIds.length
    ? await db.select().from(tools).where(inArray(tools.id, otherIds))
    : [];
  const otherById = new Map(otherTools.map((t) => [t.id, t]));

  // Recipes that use this tool.
  const usingRecipes = await db
    .select({
      id: recipes.id,
      slug: recipes.slug,
      title: recipes.title,
      summary: recipes.planJson,
      status: recipes.status,
      useCount: recipes.useCount,
    })
    .from(recipes)
    .innerJoin(recipeTools, eq(recipeTools.recipeId, recipes.id))
    .where(eq(recipeTools.toolId, tool.id))
    .orderBy(desc(recipes.useCount));
  const seen = new Set<number>();
  const dedupedRecipes = usingRecipes.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-neutral-500">
          {tool.kind.replace("_", " ")} · {tool.pricingModel.replace("_", " ")}
          {tool.authRequired ? " · auth required" : ""}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{tool.name}</h1>
        <code className="text-xs text-neutral-500">{tool.slug}</code>
      </div>

      {tool.description && (
        <p className="mt-3 text-sm leading-relaxed text-neutral-700">
          {tool.description}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-3 text-sm">
        {tool.homepageUrl && (
          <a
            href={tool.homepageUrl}
            target="_blank"
            rel="noreferrer"
            className="text-neutral-700 underline-offset-2 hover:underline"
          >
            Homepage ↗
          </a>
        )}
        {tool.repoUrl && (
          <a
            href={tool.repoUrl}
            target="_blank"
            rel="noreferrer"
            className="text-neutral-700 underline-offset-2 hover:underline"
          >
            Repo ↗
          </a>
        )}
        <Badge
          variant={
            tool.status === "verified" || tool.status === "featured"
              ? "verified"
              : tool.status === "available"
                ? "default"
                : "untested"
          }
          className="ml-auto"
        >
          {tool.status}
        </Badge>
      </div>

      {tool.categoryTags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {tool.categoryTags.map((t) => (
            <Link
              key={t}
              href={`/browse?tag=${encodeURIComponent(t)}`}
              className="rounded bg-neutral-100 px-2 py-0.5 font-mono text-xs text-neutral-600 hover:bg-neutral-200"
            >
              {t}
            </Link>
          ))}
        </div>
      )}

      {caps.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Capabilities
          </h2>
          <ul className="mt-2 list-disc pl-5 text-sm text-neutral-700">
            {caps.map((c) => (
              <li key={c.id}>{c.capability}</li>
            ))}
          </ul>
        </section>
      )}

      {compat.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Compatibility
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {compat.map((c) => {
              const otherId = c.toolAId === tool.id ? c.toolBId : c.toolAId;
              const other = otherById.get(otherId);
              if (!other) return null;
              return (
                <li key={c.id} className="flex items-center gap-2">
                  <span className="text-xs text-neutral-500">
                    {RELATIONSHIP_LABEL[c.relationship] ?? c.relationship}
                  </span>
                  <Link
                    href={`/tool/${other.slug}`}
                    className="text-neutral-900 hover:underline"
                  >
                    {other.name}
                  </Link>
                  {c.notes && (
                    <span className="text-xs text-neutral-500">
                      — {c.notes}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Recipes using {tool.name}
        </h2>
        {dedupedRecipes.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">
            No recipes yet.{" "}
            <Link href="/" className="underline">
              Plan one ↗
            </Link>
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {dedupedRecipes.map((r) => (
              <li key={r.id} className="flex items-center gap-2 text-sm">
                <Link
                  href={`/recipe/${r.slug}`}
                  className="text-neutral-900 hover:underline"
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
                <span className="ml-auto text-xs text-neutral-500">
                  {r.useCount} runs
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

// Suppress unused-import warning when status enum isn't extended.
void ne;
