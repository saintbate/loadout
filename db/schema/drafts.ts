import {
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Holds a goal between the homepage submit and the /clarify page.
 *
 * Flow:
 *   1. User posts goal on `/`. We call the clarifier (lib/clarifier.ts).
 *   2. If the clarifier wants questions, we insert a row here with the
 *      questions populated and the answers null. Redirect to /clarify/<slug>.
 *   3. The /clarify page renders the questions; submit fills `answers`.
 *   4. Server runs the planner with goal + Q/A pairs, creates the recipe,
 *      deletes the draft.
 *
 * Drafts auto-expire (cleaned up by a cron job; not enforced in DB) — this
 * table should never accumulate.
 */
export const recipeDrafts = pgTable(
  "recipe_drafts",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    contributorUserId: integer("contributor_user_id").references(
      () => users.id,
      { onDelete: "set null" },
    ),
    goalDescription: text("goal_description").notNull(),
    clarifyingQuestions: text("clarifying_questions").array().notNull().default([]),
    clarifyingAnswers: text("clarifying_answers").array().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("recipe_drafts_slug_idx").on(t.slug),
    index("recipe_drafts_user_idx").on(t.contributorUserId),
  ],
);
