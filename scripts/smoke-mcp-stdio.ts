/**
 * Smoke test for the stdio MCP transport.
 *
 * Spawns mcp/server.ts as a child process with LOADOUT_API_KEY set,
 * sends a few JSON-RPC frames on stdin, and prints the responses.
 *
 * The MCP SDK speaks newline-delimited JSON-RPC over stdio (one message
 * per line), so we mirror that here.
 */
import { spawn } from "node:child_process";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { createApiKey, revokeAllKeysForUser } from "@/lib/api-keys";

const TEST_CLERK_ID = "smoke_test_user";
const BASE_URL = process.env.LOADOUT_BASE_URL ?? "http://localhost:3000";

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

async function main() {
  const userId = await ensureUser();
  await revokeAllKeysForUser(userId);
  const { rawKey } = await createApiKey({ userId, name: "stdio-smoke" });
  console.log(`[stdio-smoke] minted key (${rawKey.slice(0, 18)}…)`);

  const child = spawn(
    "npx",
    [
      "tsx",
      "--env-file-if-exists=.env.local",
      "--env-file-if-exists=.env",
      "mcp/server.ts",
    ],
    {
      env: {
        ...process.env,
        LOADOUT_API_KEY: rawKey,
        LOADOUT_BASE_URL: BASE_URL,
      },
      stdio: ["pipe", "pipe", "inherit"],
    },
  );

  let buffer = "";
  const responses: unknown[] = [];
  child.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf-8");
    let idx;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      try {
        responses.push(JSON.parse(line));
      } catch {
        responses.push({ raw: line });
      }
    }
  });

  function send(msg: unknown) {
    child.stdin.write(JSON.stringify(msg) + "\n");
  }

  // Standard MCP handshake.
  send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "stdio-smoke", version: "0" },
    },
  });
  send({ jsonrpc: "2.0", method: "notifications/initialized" });
  send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  send({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "list_my_recipes",
      arguments: {},
    },
  });

  // Wait for responses then dump.
  await new Promise((r) => setTimeout(r, 4000));
  child.stdin.end();
  await new Promise<void>((r) => child.on("exit", () => r()));

  console.log(`[stdio-smoke] ${responses.length} responses received`);
  for (const r of responses) {
    console.log("---");
    console.log(JSON.stringify(r, null, 2).slice(0, 1500));
  }
}

main().catch((err) => {
  console.error("[stdio-smoke] fatal", err);
  process.exit(1);
});
