import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { Button } from "@/components/ui/button";
import { SubmitForm } from "./_form";

export const dynamic = "force-dynamic";

const ERROR_COPY: Record<string, string> = {
  missing_goal: "Add a goal description.",
  missing_json: "Paste the plan JSON.",
  invalid_json: "That JSON didn't parse.",
  plan_shape: "Plan JSON is missing required fields.",
  planner: "Planner failed. Try again, or paste a JSON plan instead.",
  unknown: "Something went wrong.",
};

export default async function SubmitPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; detail?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in?redirect_url=/submit");
  }

  const { error, detail } = await searchParams;
  const errorCopy = error
    ? ERROR_COPY[error] ?? "Something went wrong."
    : null;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-neutral-500">
          contribute
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Submit a recipe
        </h1>
        <p className="mt-1 max-w-xl text-sm text-neutral-600">
          Share a recipe you&apos;ve actually run. Submit a goal and the
          planner will draft it, or paste a plan JSON if you already have one.
          Submissions land as <span className="font-mono">community</span>{" "}
          until reviewed.
        </p>
      </div>

      {errorCopy && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {errorCopy}
          {detail && (
            <span className="ml-1 text-xs text-red-700">— {detail}</span>
          )}
        </div>
      )}

      <SubmitForm />

      <div className="mt-10 flex items-center justify-between border-t border-neutral-200 pt-4 text-xs text-neutral-500">
        <span>Need a reference?</span>
        <Button asChild variant="ghost" size="sm">
          <Link href="/browse">Browse existing recipes →</Link>
        </Button>
      </div>
    </main>
  );
}
