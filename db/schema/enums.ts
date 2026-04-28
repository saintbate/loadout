import { pgEnum } from "drizzle-orm/pg-core";

export const toolKindEnum = pgEnum("tool_kind", [
  "mcp_server",
  "cli",
  "api",
  "library",
  "sdk",
  "service",
]);

// Trust ladder — see README "Trust ladder". Higher = more trustworthy.
//   discovered:  raw signal from the crawler, not yet looked at
//   unverified:  someone reviewed the metadata; nothing's been tested
//   available:   curated, ready to be recommended
//   verified:    we've run a recipe with it end-to-end and it worked
//   featured:    actively elevated (high quality, frequently used)
//   deprecated:  do not recommend
//
// (The legacy values "active" and "unstable" still exist in the Postgres
// enum from earlier migrations; they are unused in code and will be cleaned
// up later. Drizzle only emits the values declared here.)
export const toolStatusEnum = pgEnum("tool_status", [
  "discovered",
  "unverified",
  "available",
  "verified",
  "featured",
  "deprecated",
]);

export const pricingModelEnum = pgEnum("pricing_model", [
  "free",
  "freemium",
  "paid",
  "usage_based",
  "unknown",
]);

export const compatibilityRelationshipEnum = pgEnum(
  "compatibility_relationship",
  ["works_with", "conflicts_with", "replaces", "requires"],
);

export const recipeStatusEnum = pgEnum("recipe_status", [
  "draft",
  "verified",
  "community",
  "deprecated",
]);

export const verificationStatusEnum = pgEnum("verification_status", [
  "passed",
  "failed",
  "partial",
]);

export const userRecipeRunStatusEnum = pgEnum("user_recipe_run_status", [
  "started",
  "completed",
  "failed",
  "abandoned",
]);

// Categories for user stack preferences. Each user has at most one row per
// category in user_preferences.
export const preferenceCategoryEnum = pgEnum("preference_category", [
  "database",
  "orm",
  "auth",
  "llm_provider",
  "deployment",
  "frontend_framework",
  "styling",
  "payment",
  "email",
  "observability",
  "vector_db",
  "search",
]);

// Where a queued tool came from.
export const proposalSourceEnum = pgEnum("proposal_source", [
  "planner",
  "crawler",
  "manual",
]);

// Lifecycle of a queue entry.
export const proposalStatusEnum = pgEnum("proposal_status", [
  "pending",
  "promoted",
  "rejected",
  "duplicate",
]);

// Lifecycle of a discovery run.
export const discoveryRunStatusEnum = pgEnum("discovery_run_status", [
  "succeeded",
  "partial",
  "failed",
]);
