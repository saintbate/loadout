"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GEN_STORAGE_KEY, type GenPayload } from "../generate/types";

/**
 * Homepage submit. JS-only path: we stash the goal in sessionStorage and
 * navigate to /generate, which streams the planner live. The /generate
 * page handles the clarifier-needed redirect to /clarify if it comes up.
 */
export function GoalForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const goal = String(fd.get("goal") ?? "").trim();
    if (!goal) return;

    setPending(true);
    const payload: GenPayload = { goal };
    sessionStorage.setItem(GEN_STORAGE_KEY, JSON.stringify(payload));
    router.push("/generate");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label htmlFor="goal" className="block text-base font-medium">
        What do you want to build?
      </label>
      <input
        id="goal"
        name="goal"
        type="text"
        autoComplete="off"
        required
        placeholder="e.g. a daily summary of my GitHub commits emailed to me"
        className="w-full rounded-md border border-neutral-300 bg-white px-4 py-3 text-base outline-none focus:border-neutral-900"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition disabled:opacity-50 hover:bg-neutral-800"
      >
        {pending ? "Starting…" : "Plan it"}
      </button>
    </form>
  );
}
