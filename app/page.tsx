import { GoalForm } from "./_components/goal-form";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Loadout</h1>
          <p className="text-sm text-neutral-500">
            Pick the right combination of AI tools for what you want to build.
          </p>
        </div>
        <GoalForm />
        {error && (
          <p className="text-sm text-red-600">
            {errorMessage(error)}
          </p>
        )}
      </div>
    </main>
  );
}

function errorMessage(code: string) {
  switch (code) {
    case "missing_goal":
      return "Tell me what you want to build first.";
    case "planner":
      return "Planner couldn't produce a valid plan. Try rephrasing.";
    default:
      return "Something went wrong. Try again.";
  }
}
