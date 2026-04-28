import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { tools } from "@/db/schema";
import { listKeysForUser } from "@/lib/api-keys";
import { ensureUserProfile } from "@/lib/auth-helpers";
import {
  PREFERENCE_CATEGORIES,
  PREFERENCE_LABELS,
  PREFERENCE_TAG_HINTS,
  loadUserPreferences,
} from "@/lib/preferences";
import { saveStackPreferences } from "./actions";
import {
  consumeRawKeyCookie,
  generateApiKey,
  revokeApiKey,
} from "./api-key-actions";
import { PreferencesForm } from "./_form";
import { ApiKeySection } from "./_api-key-section";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const profile = await ensureUserProfile();
  if (!profile) redirect("/sign-in?redirect_url=/settings");

  const { saved, error } = await searchParams;

  const [prefs, allTools, keys, freshRawKey] = await Promise.all([
    loadUserPreferences(profile.id),
    db
      .select({
        slug: tools.slug,
        name: tools.name,
        categoryTags: tools.categoryTags,
        kind: tools.kind,
      })
      .from(tools),
    listKeysForUser(profile.id),
    consumeRawKeyCookie(),
  ]);

  const activeKey = keys.find((k) => !k.revokedAt);

  // For each category, pre-filter the directory tools whose tags match the
  // category's hints. The form falls back to the full directory for search.
  const suggestionsByCategory = Object.fromEntries(
    PREFERENCE_CATEGORIES.map((cat) => {
      const hints = PREFERENCE_TAG_HINTS[cat];
      const suggestions = allTools
        .filter((t) =>
          t.categoryTags.some((tag) =>
            hints.some((h) => tag === h || tag.includes(h)),
          ),
        )
        .map((t) => ({ slug: t.slug, name: t.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return [cat, suggestions];
    }),
  );

  const prefsByCategory = Object.fromEntries(prefs.map((p) => [p.category, p]));

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-neutral-500">
          settings
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Stack preferences
        </h1>
        <p className="max-w-2xl text-sm text-neutral-600">
          Tell the planner what you prefer for each category. It will respect
          your choices unless there&apos;s a specific technical reason to
          override — and when it does override, it&apos;ll explain why on the
          recipe.
        </p>
        <p className="text-xs text-neutral-500">
          Pick a tool from the directory, or type the name of one we
          haven&apos;t indexed yet. Leave a row blank to let the planner
          choose freely.
        </p>
      </div>

      {saved && (
        <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Saved.
        </div>
      )}
      {error === "keygen" && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          Failed to generate API key. Please try again.
        </div>
      )}

      <PreferencesForm
        action={saveStackPreferences}
        categories={PREFERENCE_CATEGORIES.map((cat) => ({
          key: cat,
          label: PREFERENCE_LABELS[cat],
          suggestions: suggestionsByCategory[cat],
          current: prefsByCategory[cat] ?? null,
        }))}
        allTools={allTools.map((t) => ({ slug: t.slug, name: t.name }))}
      />

      {/* MCP integration section */}
      <section
        id="api-keys"
        className="mt-12 scroll-mt-12 border-t border-neutral-200 pt-10"
      >
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-neutral-500">
            integration
          </p>
          <h2 className="text-xl font-semibold tracking-tight">
            Connect to Cursor / Claude Code
          </h2>
          <p className="max-w-2xl text-sm text-neutral-600">
            Generate an API key, then point your IDE&apos;s MCP config at
            Loadout. Your saved recipes become live context — Cursor can
            read step rationale, copy code, and mark steps done as you
            build.
          </p>
        </div>

        <ApiKeySection
          generateAction={generateApiKey}
          revokeAction={revokeApiKey}
          activeKey={
            activeKey
              ? {
                  prefix: activeKey.prefix,
                  lastFour: activeKey.lastFour,
                  createdAt: activeKey.createdAt.toISOString(),
                  lastUsedAt: activeKey.lastUsedAt
                    ? activeKey.lastUsedAt.toISOString()
                    : null,
                }
              : null
          }
          freshRawKey={freshRawKey}
        />
      </section>
    </main>
  );
}
