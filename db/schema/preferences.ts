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
import { preferenceCategoryEnum } from "./enums";
import { tools } from "./tools";
import { users } from "./users";

/**
 * One row per (user, category). The user can pick a directory tool by slug
 * (preferredToolSlug FK) OR type a free-text name (preferredToolName) when
 * the tool isn't in the directory yet. Either side may be null if they
 * haven't set a preference for that category.
 */
export const userPreferences = pgTable(
  "user_preferences",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    category: preferenceCategoryEnum("category").notNull(),
    preferredToolSlug: text("preferred_tool_slug").references(() => tools.slug, {
      onDelete: "set null",
    }),
    preferredToolName: text("preferred_tool_name"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("user_preferences_user_category_idx").on(
      t.userId,
      t.category,
    ),
    index("user_preferences_user_idx").on(t.userId),
  ],
);

export const userPreferencesRelations = relations(userPreferences, ({ one }) => ({
  user: one(users, {
    fields: [userPreferences.userId],
    references: [users.id],
  }),
  tool: one(tools, {
    fields: [userPreferences.preferredToolSlug],
    references: [tools.slug],
  }),
}));
