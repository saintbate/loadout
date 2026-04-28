import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { recipeProgress, recipes, savedRecipes } from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import { ensureUserProfile } from "@/lib/auth-helpers";
import type { Plan } from "@/lib/plan-types";

export const dynamic = "force-dynamic";

export default async function MyRecipesPage() {
  const profile = await ensureUserProfile();
  if (!profile) redirect("/sign-in?redirect_url=/my-recipes");

  const rows = await db
    .select({
      recipeId: recipes.id,
      slug: recipes.slug,
      title: recipes.title,
      planJson: recipes.planJson,
      goalDescription: recipes.goalDescription,
      status: recipes.status,
      savedAt: savedRecipes.savedAt,
      lastOpenedAt: savedRecipes.lastOpenedAt,
    })
    .from(savedRecipes)
    .innerJoin(recipes, eq(savedRecipes.recipeId, recipes.id))
    .where(eq(savedRecipes.userId, profile.id))
    .orderBy(desc(savedRecipes.lastOpenedAt));

  let progressByRecipe = new Map<number, number[]>();
  if (rows.length > 0) {
    const ids = rows.map((r) => r.recipeId);
    const prog = await db
      .select({
        recipeId: recipeProgress.recipeId,
        stepNumber: recipeProgress.stepNumber,
      })
      .from(recipeProgress)
      .where(
        and(
          eq(recipeProgress.userId, profile.id),
          inArray(recipeProgress.recipeId, ids),
        ),
      );
    progressByRecipe = new Map();
    for (const p of prog) {
      const list = progressByRecipe.get(p.recipeId) ?? [];
      list.push(p.stepNumber);
      progressByRecipe.set(p.recipeId, list);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-neutral-500">
          your account
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">My recipes</h1>
        <p className="text-sm text-neutral-500">
          Recipes you&apos;ve saved, with build progress. Connect to Cursor or
          Claude Code in{" "}
          <Link
            href="/settings#api-keys"
            className="underline-offset-2 hover:underline"
          >
            Settings
          </Link>{" "}
          to query these from your IDE via MCP.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="mt-8 rounded-md border border-dashed border-neutral-300 bg-white p-8 text-center">
          <p className="text-sm text-neutral-700">
            No saved recipes yet.
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            Open any recipe and click &ldquo;Save to my account&rdquo; to add
            it here.
          </p>
          <div className="mt-4">
            <Link
              href="/browse"
              className="text-sm text-neutral-700 underline-offset-2 hover:underline"
            >
              Browse recipes →
            </Link>
          </div>
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-neutral-200 rounded-md border border-neutral-200 bg-white">
          {rows.map((r) => {
            const plan = r.planJson as Plan;
            const completed = progressByRecipe.get(r.recipeId) ?? [];
            const total = plan.steps.length;
            const isComplete = completed.length === total;
            return (
              <li key={r.recipeId}>
                <Link
                  href={`/recipe/${r.slug}`}
                  className="flex flex-col gap-1.5 px-4 py-3 transition hover:bg-neutral-50"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="truncate text-sm font-semibold text-neutral-900">
                      {r.title}
                    </h2>
                    <div className="flex shrink-0 items-center gap-2 text-[11px] text-neutral-500">
                      <Badge
                        variant={
                          isComplete
                            ? "verified"
                            : completed.length === 0
                              ? "default"
                              : "untested"
                        }
                      >
                        {completed.length}/{total} done
                      </Badge>
                      <span>
                        opened {timeAgo(r.lastOpenedAt)}
                      </span>
                    </div>
                  </div>
                  <p className="line-clamp-1 text-xs text-neutral-600">
                    {plan.summary}
                  </p>
                  {/* Step progress bar */}
                  <ProgressDots
                    total={total}
                    completed={new Set(completed)}
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

function ProgressDots({
  total,
  completed,
}: {
  total: number;
  completed: Set<number>;
}) {
  return (
    <div className="mt-1 flex gap-1">
      {Array.from({ length: total }).map((_, i) => {
        const done = completed.has(i + 1);
        return (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-full ${
              done ? "bg-emerald-500" : "bg-neutral-200"
            }`}
          />
        );
      })}
    </div>
  );
}

function timeAgo(d: Date): string {
  const ms = Date.now() - d.getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return d.toISOString().slice(0, 10);
}
