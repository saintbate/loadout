import { relations } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import {
  recipeStatusEnum,
  userRecipeRunStatusEnum,
  verificationStatusEnum,
} from "./enums";
import { tools } from "./tools";
import { users } from "./users";
import type { Plan } from "@/lib/plan-types";

export type RecipePlan = Plan;

export const recipes = pgTable(
  "recipes",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    goalDescription: text("goal_description").notNull(),
    planJson: jsonb("plan_json").$type<Plan>().notNull(),
    categoryTags: text("category_tags").array().notNull().default([]),
    status: recipeStatusEnum("status").notNull().default("draft"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verifiedByUserId: integer("verified_by_user_id").references(
      () => users.id,
      { onDelete: "set null" },
    ),
    contributorUserId: integer("contributor_user_id").references(
      () => users.id,
      { onDelete: "set null" },
    ),
    useCount: integer("use_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("recipes_slug_idx").on(t.slug),
    index("recipes_status_idx").on(t.status),
  ],
);

export const recipeTools = pgTable(
  "recipe_tools",
  {
    id: serial("id").primaryKey(),
    recipeId: integer("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    toolId: integer("tool_id")
      .notNull()
      .references(() => tools.id, { onDelete: "restrict" }),
    stepNumber: integer("step_number").notNull(),
    role: text("role").notNull(),
    justification: text("justification").notNull(),
  },
  (t) => [
    index("recipe_tools_recipe_idx").on(t.recipeId),
    index("recipe_tools_tool_idx").on(t.toolId),
  ],
);

export const verificationRuns = pgTable(
  "verification_runs",
  {
    id: serial("id").primaryKey(),
    recipeId: integer("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    ranAt: timestamp("ran_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    status: verificationStatusEnum("status").notNull(),
    outputLog: text("output_log"),
    toolVersionsSnapshot: jsonb("tool_versions_snapshot")
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
  },
  (t) => [index("verification_runs_recipe_idx").on(t.recipeId)],
);

export const userRecipeRuns = pgTable(
  "user_recipe_runs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    recipeId: integer("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    status: userRecipeRunStatusEnum("status").notNull(),
    ranAt: timestamp("ran_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("user_recipe_runs_user_idx").on(t.userId),
    index("user_recipe_runs_recipe_idx").on(t.recipeId),
  ],
);

export const recipesRelations = relations(recipes, ({ one, many }) => ({
  contributor: one(users, {
    fields: [recipes.contributorUserId],
    references: [users.id],
    relationName: "recipe_contributor",
  }),
  verifier: one(users, {
    fields: [recipes.verifiedByUserId],
    references: [users.id],
    relationName: "recipe_verifier",
  }),
  recipeTools: many(recipeTools),
  verificationRuns: many(verificationRuns),
  userRuns: many(userRecipeRuns),
}));

export const recipeToolsRelations = relations(recipeTools, ({ one }) => ({
  recipe: one(recipes, {
    fields: [recipeTools.recipeId],
    references: [recipes.id],
  }),
  tool: one(tools, {
    fields: [recipeTools.toolId],
    references: [tools.id],
  }),
}));

export const verificationRunsRelations = relations(
  verificationRuns,
  ({ one }) => ({
    recipe: one(recipes, {
      fields: [verificationRuns.recipeId],
      references: [recipes.id],
    }),
  }),
);

export const userRecipeRunsRelations = relations(userRecipeRuns, ({ one }) => ({
  user: one(users, {
    fields: [userRecipeRuns.userId],
    references: [users.id],
  }),
  recipe: one(recipes, {
    fields: [userRecipeRuns.recipeId],
    references: [recipes.id],
  }),
}));
