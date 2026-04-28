"use client";

import { Bookmark, BookmarkCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveRecipe, unsaveRecipe } from "./actions";

type Props = {
  slug: string;
  isSaved: boolean;
};

export function SaveButton({ slug, isSaved }: Props) {
  return (
    <form action={isSaved ? unsaveRecipe : saveRecipe} className="shrink-0">
      <input type="hidden" name="slug" value={slug} />
      <Button
        type="submit"
        variant={isSaved ? "secondary" : "default"}
        size="sm"
      >
        {isSaved ? (
          <>
            <BookmarkCheck className="h-4 w-4" />
            Saved
          </>
        ) : (
          <>
            <Bookmark className="h-4 w-4" />
            Save to my account
          </>
        )}
      </Button>
    </form>
  );
}
