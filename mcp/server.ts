#!/usr/bin/env node
/**
 * MCP server (stdio transport).
 *
 * Used by Claude Desktop / Claude Code via the npx-based config:
 *
 *   {
 *     "mcpServers": {
 *       "loadout": {
 *         "command": "npx",
 *         "args": ["-y", "@loadoutx/mcp-server"],
 *         "env": { "LOADOUT_API_KEY": "lo_…" }
 *       }
 *     }
 *   }
 *
 * It's a thin wrapper that forwards each tool call to the hosted HTTP
 * endpoint with the user's API key. That keeps the database access in one
 * place and means the package can be a tiny stable shim.
 *
 * For local dev, point LOADOUT_BASE_URL to http://localhost:3000.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const apiKey = process.env.LOADOUT_API_KEY;
const baseUrl = (
  process.env.LOADOUT_BASE_URL ?? "https://loadout.dev"
).replace(/\/$/, "");

if (!apiKey) {
  console.error(
    "[loadout-mcp] LOADOUT_API_KEY env var is required. Generate one at " +
      `${baseUrl}/settings`,
  );
  process.exit(1);
}

type RpcResponse =
  | { result: unknown; error?: undefined }
  | { error: { code: number; message: string }; result?: undefined };

async function rpc(method: string, params?: unknown): Promise<unknown> {
  const res = await fetch(`${baseUrl}/api/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: cryptoId(),
      method,
      params,
    }),
  });
  if (!res.ok) {
    throw new Error(`Loadout MCP HTTP ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as RpcResponse;
  if ("error" in json && json.error) {
    throw new Error(`${json.error.message} (code ${json.error.code})`);
  }
  return (json as { result: unknown }).result;
}

function cryptoId() {
  return Math.random().toString(36).slice(2);
}

async function main() {
  const server = new Server(
    { name: "loadout-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  // Forward tools/list — keep parity with whatever the hosted server says.
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const result = (await rpc("tools/list")) as { tools: unknown };
    return result;
  });

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const result = (await rpc("tools/call", {
      name: req.params.name,
      arguments: req.params.arguments ?? {},
    })) as { content: unknown; isError?: boolean };
    return result;
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server runs until stdin closes.
}

main().catch((err) => {
  console.error("[loadout-mcp] fatal", err);
  process.exit(1);
});
