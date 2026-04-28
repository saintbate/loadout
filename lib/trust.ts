import type { Plan, PlanToolRef, PlanToolStatus } from "./plan-types";

/**
 * Trust ladder ranking. Higher = more trustworthy.
 * Used to compute the recipe-level status from constituent tool statuses.
 */
const RANK: Record<PlanToolStatus, number> = {
  featured: 5,
  verified: 4,
  available: 3,
  unverified: 2,
  discovered: 1,
  not_in_directory: 0,
  deprecated: -1,
};

/**
 * Resolves the canonical status for a plan tool ref. Plans emitted before
 * the trust-ladder change don't have `status` set, so we fall back to:
 *   - "not_in_directory" if proposed_tool=true
 *   - looked-up directory status, OR "verified" if the tool exists but
 *     no status was provided (we trust the seed data was curated).
 *
 * The optional `directoryStatus` map is the live status from the `tools`
 * table — useful when re-rendering an old recipe.
 */
export function resolveToolStatus(
  ref: PlanToolRef,
  directoryStatus?: Map<string, PlanToolStatus>,
): PlanToolStatus {
  if (ref.status) return ref.status;
  if (ref.proposed_tool) return "not_in_directory";
  return directoryStatus?.get(ref.slug) ?? "verified";
}

/** UI metadata for each trust-ladder rung. */
export const STATUS_META: Record<
  PlanToolStatus,
  {
    label: string;
    /** Tailwind classes for the dot. */
    dotClass: string;
    /** Tailwind classes for the chip border. */
    chipBorder: string;
  }
> = {
  featured: {
    label: "Featured",
    dotClass: "bg-amber-400 ring-2 ring-amber-200",
    chipBorder: "border-amber-300",
  },
  verified: {
    label: "Verified",
    dotClass: "bg-emerald-500 ring-2 ring-emerald-200",
    chipBorder: "border-emerald-200",
  },
  available: {
    label: "Available",
    dotClass: "bg-sky-500 ring-2 ring-sky-200",
    chipBorder: "border-sky-200",
  },
  unverified: {
    label: "Unverified",
    dotClass: "bg-amber-500 ring-2 ring-amber-200",
    chipBorder: "border-amber-200",
  },
  discovered: {
    label: "Discovered",
    dotClass: "bg-neutral-300 ring-2 ring-neutral-100",
    chipBorder: "border-neutral-200",
  },
  not_in_directory: {
    label: "Not in directory",
    dotClass: "bg-neutral-200 ring-2 ring-neutral-100",
    chipBorder: "border-dashed border-neutral-300",
  },
  deprecated: {
    label: "Deprecated",
    dotClass: "bg-red-400 ring-2 ring-red-200",
    chipBorder: "border-red-200",
  },
};

export type RecipeOverallStatus = "verified" | "community" | "draft";

/**
 * "Verified": all tools are at verified+ and in the directory.
 * "Community": some are available or unverified.
 * "Draft": at least one is not in the directory yet.
 */
export function computeRecipeOverallStatus(
  plan: Plan,
  directoryStatus?: Map<string, PlanToolStatus>,
): RecipeOverallStatus {
  let worstRank = Infinity;
  for (const step of plan.steps) {
    for (const t of step.tools) {
      const status = resolveToolStatus(t, directoryStatus);
      const r = RANK[status];
      if (r < worstRank) worstRank = r;
    }
  }
  if (worstRank >= RANK.available) return "verified";
  if (worstRank >= RANK.unverified) return "community";
  return "draft";
}

export const RECIPE_STATUS_COPY: Record<
  RecipeOverallStatus,
  { label: string; explanation: string; tone: "verified" | "default" | "untested" }
> = {
  verified: {
    label: "Verified recipe",
    explanation: "Every tool is in the directory at available+ trust.",
    tone: "verified",
  },
  community: {
    label: "Community recipe",
    explanation:
      "Some tools are unverified or only recently added — check before relying on this recipe in production.",
    tone: "default",
  },
  draft: {
    label: "Draft recipe",
    explanation:
      "At least one tool isn't in the directory yet — proposed by the planner and pending review.",
    tone: "untested",
  },
};
