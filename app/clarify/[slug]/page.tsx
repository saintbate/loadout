import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { recipeDrafts } from "@/db/schema";
import { ClarifyForm } from "./_form";

export const dynamic = "force-dynamic";

export default async function ClarifyPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const { error } = await searchParams;

  const [draft] = await db
    .select()
    .from(recipeDrafts)
    .where(eq(recipeDrafts.slug, slug))
    .limit(1);
  if (!draft) notFound();

  const errorCopy =
    error === "planner"
      ? "Planner failed on your answers. Try simplifying or skipping ahead."
      : null;

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-neutral-500">
          clarify
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          A few quick questions
        </h1>
        <p className="text-sm text-neutral-600">
          Your answers will help the planner pick the right tools. You can
          skip any question, or skip them all and let the planner make the
          calls itself.
        </p>
      </div>

      <div className="mt-6 rounded-md border border-neutral-200 bg-neutral-50 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
          Your goal
        </p>
        <p className="mt-1 text-sm text-neutral-800">
          {draft.goalDescription}
        </p>
      </div>

      {errorCopy && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {errorCopy}
        </div>
      )}

      <ClarifyForm
        draftSlug={draft.slug}
        questions={draft.clarifyingQuestions}
      />
    </main>
  );
}
