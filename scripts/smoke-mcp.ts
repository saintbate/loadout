/**
 * End-to-end smoke test for the MCP HTTP endpoint.
 *
 * Creates (or reuses) a test user, mints a fresh API key, and drives the
 * full JSON-RPC surface against http://localhost:3000/api/mcp.
 *
 *   npm run mcp:smoke
 */
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { recipes, savedRecipes, users } from "@/db/schema";
import { createApiKey, revokeAllKeysForUser } from "@/lib/api-keys";

const BASE = process.env.LOADOUT_BASE_URL ?? "http://localhost:3000";
const TEST_CLERK_ID = "smoke_test_user";

async function ensureUser() {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, TEST_CLERK_ID))
    .limit(1);
  if (existing[0]) return existing[0].id;
  const [created] = await db
    .insert(users)
    .values({ clerkId: TEST_CLERK_ID })
    .returning({ id: users.id });
  return created.id;
}

async function rpc(rawKey: string, method: string, params?: unknown) {
  const res = await fetch(`${BASE}/api/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${rawKey}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Math.floor(Math.random() * 1e9),
      method,
      params,
    }),
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { httpStatus: res.status, raw: text };
  }
  return { httpStatus: res.status, ...(json as object) };
}

async function main() {
  const userId = await ensureUser();
  console.log(`[smoke] using user_id=${userId}`);

  // Save a recipe to this user so list_my_recipes returns something.
  const [demoRecipe] = await db
    .select({ id: recipes.id, slug: recipes.slug, title: recipes.title })
    .from(recipes)
    .where(eq(recipes.slug, "rag-over-pdfs-with-pgvector"))
    .limit(1);
  if (!demoRecipe) {
    console.log(
      "[smoke] no demo recipe found — run `npm run db:seed` first.",
    );
    process.exit(1);
  }
  const existingSave = await db
    .select({ id: savedRecipes.id })
    .from(savedRecipes)
    .where(eq(savedRecipes.userId, userId))
    .limit(1);
  if (!existingSave[0]) {
    await db
      .insert(savedRecipes)
      .values({ userId, recipeId: demoRecipe.id });
    console.log(`[smoke] saved demo recipe "${demoRecipe.title}"`);
  }

  await revokeAllKeysForUser(userId);
  const { rawKey } = await createApiKey({ userId, name: "smoke" });
  console.log(`[smoke] minted API key (prefix ${rawKey.slice(0, 18)}…)`);

  // initialize
  console.log("\n=== initialize");
  console.log(JSON.stringify(await rpc(rawKey, "initialize"), null, 2));

  // tools/list
  console.log("\n=== tools/list");
  const list = await rpc(rawKey, "tools/list");
  console.log(JSON.stringify(list, null, 2));

  // bad auth
  console.log("\n=== tools/call with bad key");
  console.log(
    JSON.stringify(await rpc("lo_bogus_bogus", "tools/call", {
      name: "list_my_recipes",
      arguments: {},
    }), null, 2),
  );

  // list_my_recipes
  console.log("\n=== list_my_recipes");
  console.log(
    JSON.stringify(
      await rpc(rawKey, "tools/call", {
        name: "list_my_recipes",
        arguments: {},
      }),
      null,
      2,
    ),
  );

  // get_recipe
  console.log("\n=== get_recipe");
  console.log(
    JSON.stringify(
      await rpc(rawKey, "tools/call", {
        name: "get_recipe",
        arguments: { recipe_slug: demoRecipe.slug },
      }),
      null,
      2,
    ).slice(0, 1500) + "…",
  );

  // get_step
  console.log("\n=== get_step (step 1)");
  console.log(
    JSON.stringify(
      await rpc(rawKey, "tools/call", {
        name: "get_step",
        arguments: { recipe_slug: demoRecipe.slug, step_number: 1 },
      }),
      null,
      2,
    ).slice(0, 1500) + "…",
  );

  // mark_step_complete
  console.log("\n=== mark_step_complete (step 1)");
  console.log(
    JSON.stringify(
      await rpc(rawKey, "tools/call", {
        name: "mark_step_complete",
        arguments: {
          recipe_slug: demoRecipe.slug,
          step_number: 1,
          notes: "smoke test mark",
        },
      }),
      null,
      2,
    ),
  );

  // suggest_next_step
  console.log("\n=== suggest_next_step");
  console.log(
    JSON.stringify(
      await rpc(rawKey, "tools/call", {
        name: "suggest_next_step",
        arguments: { recipe_slug: demoRecipe.slug },
      }),
      null,
      2,
    ).slice(0, 1500) + "…",
  );

  // get_tool_info
  console.log("\n=== get_tool_info (anthropic-sdk-typescript)");
  console.log(
    JSON.stringify(
      await rpc(rawKey, "tools/call", {
        name: "get_tool_info",
        arguments: { tool_slug: "anthropic-sdk-typescript" },
      }),
      null,
      2,
    ).slice(0, 1500) + "…",
  );

  console.log("\n[smoke] done.");
}

main().catch((err) => {
  console.error("[smoke] fatal", err);
  process.exit(1);
});
