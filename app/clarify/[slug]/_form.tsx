"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  GEN_STORAGE_KEY,
  type GenPayload,
} from "@/app/generate/types";

type Props = {
  draftSlug: string;
  questions: string[];
};

/**
 * Clarify form. Collects answers, stashes them in sessionStorage along
 * with the draft slug, and navigates to /generate which streams the
 * planner live. Server-side, /api/plan-stream loads the draft, runs the
 * planner with the Q/A appended, then deletes the draft on completion.
 */
export function ClarifyForm({ draftSlug, questions }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const clarifications = questions.map((q, i) => ({
      question: q,
      answer: String(fd.get(`answer_${i}`) ?? "").trim(),
    }));

    setPending(true);
    const payload: GenPayload = { draftSlug, clarifications };
    sessionStorage.setItem(GEN_STORAGE_KEY, JSON.stringify(payload));
    router.push("/generate");
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-5">
      <ol className="space-y-4">
        {questions.map((q, i) => (
          <li key={i}>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-neutral-900">
                {i + 1}. {q}
              </span>
              <textarea
                name={`answer_${i}`}
                rows={2}
                placeholder="Your answer (or leave blank for 'no preference')"
                className="w-full resize-none rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-900"
              />
            </label>
          </li>
        ))}
      </ol>

      <div className="flex items-center justify-between gap-3">
        <button
          type="submit"
          formNoValidate
          disabled={pending}
          className="text-xs text-neutral-500 underline-offset-2 hover:text-neutral-900 hover:underline disabled:opacity-50"
        >
          Skip and generate now
        </button>
        <Button type="submit" disabled={pending}>
          {pending ? "Starting…" : "Generate plan"}
        </Button>
      </div>
    </form>
  );
}
