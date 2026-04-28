import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import {
  pricingModelEnum,
  toolKindEnum,
  toolStatusEnum,
  compatibilityRelationshipEnum,
} from "./enums";

export const tools = pgTable(
  "tools",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    kind: toolKindEnum("kind").notNull(),
    homepageUrl: text("homepage_url"),
    repoUrl: text("repo_url"),
    description: text("description"),
    latestVersion: text("latest_version"),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    status: toolStatusEnum("status").notNull().default("available"),
    categoryTags: text("category_tags").array().notNull().default([]),
    authRequired: boolean("auth_required").notNull().default(false),
    pricingModel: pricingModelEnum("pricing_model").notNull().default("free"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("tools_slug_idx").on(t.slug),
    index("tools_kind_idx").on(t.kind),
    index("tools_status_idx").on(t.status),
  ],
);

export const toolCapabilities = pgTable(
  "tool_capabilities",
  {
    id: serial("id").primaryKey(),
    toolId: integer("tool_id")
      .notNull()
      .references(() => tools.id, { onDelete: "cascade" }),
    capability: text("capability").notNull(),
    notes: text("notes"),
  },
  (t) => [index("tool_capabilities_tool_idx").on(t.toolId)],
);

export const toolCompatibility = pgTable(
  "tool_compatibility",
  {
    id: serial("id").primaryKey(),
    toolAId: integer("tool_a_id")
      .notNull()
      .references(() => tools.id, { onDelete: "cascade" }),
    toolBId: integer("tool_b_id")
      .notNull()
      .references(() => tools.id, { onDelete: "cascade" }),
    relationship: compatibilityRelationshipEnum("relationship").notNull(),
    notes: text("notes"),
  },
  (t) => [
    index("tool_compatibility_a_idx").on(t.toolAId),
    index("tool_compatibility_b_idx").on(t.toolBId),
  ],
);

export const toolsRelations = relations(tools, ({ many }) => ({
  capabilities: many(toolCapabilities),
  compatibilityFrom: many(toolCompatibility, { relationName: "tool_a" }),
  compatibilityTo: many(toolCompatibility, { relationName: "tool_b" }),
}));

export const toolCapabilitiesRelations = relations(
  toolCapabilities,
  ({ one }) => ({
    tool: one(tools, {
      fields: [toolCapabilities.toolId],
      references: [tools.id],
    }),
  }),
);

export const toolCompatibilityRelations = relations(
  toolCompatibility,
  ({ one }) => ({
    toolA: one(tools, {
      fields: [toolCompatibility.toolAId],
      references: [tools.id],
      relationName: "tool_a",
    }),
    toolB: one(tools, {
      fields: [toolCompatibility.toolBId],
      references: [tools.id],
      relationName: "tool_b",
    }),
  }),
);
