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
  discoveryRunStatusEnum,
  proposalSourceEnum,
  proposalStatusEnum,
  toolKindEnum,
} from "./enums";
import { users } from "./users";

/**
 * Queue of proposed tools awaiting admin review.
 *
 * Sources:
 *   planner — set proposed_tool=true on a plan
 *   crawler — found by /scripts/crawl-tools.ts
 *   manual  — admin used /admin/queue's quick-add
 *
 * On promotion: a row is inserted into `tools`, this row's status flips to
 * "promoted", and any recipes that referenced the slug get their plan_json
 * normalized so they can resolve to a real tool now.
 */
export const proposedToolsQueue = pgTable(
  "proposed_tools_queue",
  {
    id: serial("id").primaryKey(),
    slugSuggestion: text("slug_suggestion").notNull(),
    name: text("name").notNull(),
    kind: toolKindEnum("kind"),
    homepageUrl: text("homepage_url"),
    repoUrl: text("repo_url"),
    description: text("description"),
    categoryTags: text("category_tags").array().notNull().default([]),
    capabilities: text("capabilities").array().notNull().default([]),
    source: proposalSourceEnum("source").notNull(),
    sourceContext: jsonb("source_context")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    proposalCount: integer("proposal_count").notNull().default(1),
    firstProposedAt: timestamp("first_proposed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastProposedAt: timestamp("last_proposed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    status: proposalStatusEnum("status").notNull().default("pending"),
    reviewerUserId: integer("reviewer_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    notes: text("notes"),
  },
  (t) => [
    uniqueIndex("proposed_tools_slug_idx").on(t.slugSuggestion),
    index("proposed_tools_status_idx").on(t.status),
    index("proposed_tools_count_idx").on(t.proposalCount),
  ],
);

/**
 * Audit log: one row per crawl source per run.
 */
export const toolDiscoveryRuns = pgTable(
  "tool_discovery_runs",
  {
    id: serial("id").primaryKey(),
    sourceName: text("source_name").notNull(),
    ranAt: timestamp("ran_at", { withTimezone: true }).notNull().defaultNow(),
    toolsFoundCount: integer("tools_found_count").notNull().default(0),
    toolsNewCount: integer("tools_new_count").notNull().default(0),
    status: discoveryRunStatusEnum("status").notNull(),
    notes: text("notes"),
    errorLog: text("error_log"),
  },
  (t) => [index("tool_discovery_runs_source_idx").on(t.sourceName)],
);
