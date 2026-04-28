"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { submitCommunityRecipe } from "./actions";

type Mode = "goal" | "json";

const PLACEHOLDER_JSON = `{
  "summary": "...",
  "estimated_time_minutes": 30,
  "estimated_monthly_cost_usd": 0,
  "steps": [
    {
      "step_number": 1,
      "title": "Step title",
      "tools": [
        { "slug": "anthropic-sdk-typescript", "role": "...", "proposed_tool": false }
      ],
      "rationale": "Why these tools.",
      "trust_signal": "verified"
    }
  ]
}`;

export function SubmitForm() {
  const [mode, setMode] = useState<Mode>("goal");
  const [pending, setPending] = useState(false);

  return (
    <form
      action={submitCommunityRecipe}
      onSubmit={() => setPending(true)}
      className="mt-6 space-y-5"
    >
      <input type="hidden" name="mode" value={mode} />

      <div className="flex gap-1 rounded-md bg-neutral-100 p-1 text-xs font-medium">
        <button
          type="button"
          onClick={() => setMode("goal")}
          className={cn(
            "flex-1 rounded px-3 py-1.5 transition",
            mode === "goal"
              ? "bg-white text-neutral-900 shadow-sm"
              : "text-neutral-600 hover:text-neutral-900",
          )}
        >
          Plan from a goal
        </button>
        <button
          type="button"
          onClick={() => setMode("json")}
          className={cn(
            "flex-1 rounded px-3 py-1.5 transition",
            mode === "json"
              ? "bg-white text-neutral-900 shadow-sm"
              : "text-neutral-600 hover:text-neutral-900",
          )}
        >
          Paste JSON
        </button>
      </div>

      {mode === "goal" ? (
        <Field
          label="Goal"
          hint="One sentence. Same input the homepage planner takes."
        >
          <textarea
            name="goal"
            required
            rows={3}
            placeholder="e.g. Daily summary of GitHub commits emailed to me"
            className="w-full resize-none rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-900"
          />
        </Field>
      ) : (
        <>
          <Field
            label="Plan JSON"
            hint="Must validate against the planner schema (summary, steps[], trust_signal, …)."
          >
            <textarea
              name="plan_json"
              required
              rows={14}
              placeholder={PLACEHOLDER_JSON}
              spellCheck={false}
              className="w-full resize-y rounded-md border border-neutral-300 bg-white px-3 py-2 font-mono text-xs outline-none focus:border-neutral-900"
            />
          </Field>
          <Field
            label="Goal description"
            hint="What problem does this recipe solve? Shown on the recipe card."
          >
            <input
              name="goal"
              type="text"
              placeholder="Optional — falls back to the plan summary"
              className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-900"
            />
          </Field>
        </>
      )}

      <Field
        label="Title"
        hint={
          mode === "goal"
            ? "Optional — defaults to the first step's title."
            : "Optional — defaults to the first step's title."
        }
      >
        <input
          name="title"
          type="text"
          maxLength={80}
          placeholder="e.g. Daily GitHub commit digest"
          className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
      </Field>

      <Field
        label="Tags"
        hint="Comma-separated. Helps people find this in /browse. Up to 8."
      >
        <input
          name="tags"
          type="text"
          placeholder="rag, slack, scheduled"
          className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 font-mono text-xs outline-none focus:border-neutral-900"
        />
      </Field>

      <div className="flex items-center justify-end gap-3 pt-2">
        <p className="mr-auto text-xs text-neutral-500">
          Submits as <span className="font-mono">community</span>. An admin
          can promote to <span className="font-mono">verified</span> once
          they&apos;ve confirmed it works.
        </p>
        <Button type="submit" disabled={pending}>
          {pending
            ? mode === "goal"
              ? "Planning…"
              : "Saving…"
            : mode === "goal"
              ? "Plan & submit"
              : "Submit"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-700">
          {label}
        </span>
        {hint && <span className="text-xs text-neutral-500">{hint}</span>}
      </div>
      {children}
    </label>
  );
}
