import { relations } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { recipes } from "./recipes";
import { users } from "./users";

/**
 * The user has explicitly bookmarked this recipe to their account.
 * (Distinct from `recipes.contributor_user_id`, which records authorship.)
 *
 * One row per (user, recipe). `last_opened_at` is bumped each time the
 * user views the recipe page — used to sort /my-recipes.
 */
export const savedRecipes = pgTable(
  "saved_recipes",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    recipeId: integer("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    savedAt: timestamp("saved_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastOpenedAt: timestamp("last_opened_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("saved_recipes_user_recipe_idx").on(t.userId, t.recipeId),
    index("saved_recipes_user_idx").on(t.userId),
  ],
);

/**
 * Per-step build journal. The user checks off steps as they implement them
 * and can leave a short note per step.
 *
 * One row per (user, recipe, step_number). Inserted on first check; deleted
 * on uncheck — so a row's existence == "completed".
 */
export const recipeProgress = pgTable(
  "recipe_progress",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    recipeId: integer("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    stepNumber: integer("step_number").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    notes: text("notes"),
  },
  (t) => [
    uniqueIndex("recipe_progress_user_recipe_step_idx").on(
      t.userId,
      t.recipeId,
      t.stepNumber,
    ),
    index("recipe_progress_user_idx").on(t.userId),
    index("recipe_progress_recipe_idx").on(t.recipeId),
  ],
);

/**
 * API keys for the MCP integration.
 *
 *   key format: `lo_<prefix>_<secret>`
 *     prefix  — random 12-char base64url, stored unhashed for fast lookup
 *     secret  — random 36 bytes base64url, stored only as scrypt hash
 *
 * Verification: split incoming key, lookup row by prefix, scrypt+timingSafe
 * the candidate secret against `secret_hash`.
 *
 * The raw key is shown to the user once on generation and never again.
 */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Public lookup prefix — random 12 chars, indexed for O(1) auth. */
    prefix: text("prefix").notNull(),
    /** scrypt(secret, salt) — 64 hex chars (32 bytes). */
    secretHash: text("secret_hash").notNull(),
    /** Random salt used with the scrypt above. 32 hex chars (16 bytes). */
    salt: text("salt").notNull(),
    /** Optional human label so the user can tell keys apart. */
    name: text("name"),
    /** Display-only suffix (last 4 chars) for the UI (`…abcd`). */
    lastFour: text("last_four").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("api_keys_prefix_idx").on(t.prefix),
    index("api_keys_user_idx").on(t.userId),
  ],
);

export const savedRecipesRelations = relations(savedRecipes, ({ one }) => ({
  user: one(users, {
    fields: [savedRecipes.userId],
    references: [users.id],
  }),
  recipe: one(recipes, {
    fields: [savedRecipes.recipeId],
    references: [recipes.id],
  }),
}));

export const recipeProgressRelations = relations(recipeProgress, ({ one }) => ({
  user: one(users, {
    fields: [recipeProgress.userId],
    references: [users.id],
  }),
  recipe: one(recipes, {
    fields: [recipeProgress.recipeId],
    references: [recipes.id],
  }),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  user: one(users, {
    fields: [apiKeys.userId],
    references: [users.id],
  }),
}));
