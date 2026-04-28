"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { recordRecipeRun } from "@/app/actions";

export function RunRecipeButton({ recipeId }: { recipeId: number }) {
  const [open, setOpen] = useState(false);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onClick = () => {
    setAuthNotice(null);
    startTransition(async () => {
      const result = await recordRecipeRun(recipeId);
      if (!result.ok) {
        setAuthNotice("Sign in to track runs. Showing local instructions anyway.");
      }
      setOpen(true);
    });
  };

  return (
    <>
      <Button onClick={onClick} disabled={isPending} size="sm">
        {isPending ? "Loading…" : "Run this recipe"}
      </Button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setOpen(false)}
              className="absolute right-4 top-4 text-neutral-400 hover:text-neutral-700"
            >
              <X className="h-4 w-4" />
            </button>
            <h2 className="text-base font-semibold">Running locally</h2>
            <p className="mt-2 text-sm text-neutral-600">
              Loadout doesn&apos;t execute recipes on your behalf yet. Walk through
              the steps in your terminal — copy each command and code block as
              you go.
            </p>
            {authNotice && (
              <p className="mt-3 text-xs text-neutral-500">{authNotice}</p>
            )}
            <div className="mt-4 flex justify-end">
              <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
                Got it
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
