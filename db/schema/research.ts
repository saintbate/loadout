import { index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { recipes } from "./recipes";

/**
 * Stores the "prior art + differentiation" research result for a recipe.
 * One row per recipe (unique on recipe_id). Generated asynchronously after
 * a recipe is created. Cached indefinitely unless the recipe plan_json
 * changes or the user explicitly refreshes.
 */
export const recipeResearch = pgTable(
  "recipe_research",
  {
    id: serial("id").primaryKey(),
    recipeId: integer("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    priorArt: text("prior_art").notNull(),
    missedByObvious: text("missed_by_obvious").notNull(),
    differentiationPick: text("differentiation_pick").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    modelUsed: text("model_used").notNull(),
  },
  (t) => [
    uniqueIndex("recipe_research_recipe_idx").on(t.recipeId),
    index("recipe_research_generated_at_idx").on(t.generatedAt),
  ],
);
