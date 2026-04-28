import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-keys";
import { MCP_TOOL_DEFS, dispatchTool } from "@/lib/mcp-tools";

/**
 * MCP server (HTTP transport).
 *
 * Implements the JSON-RPC 2.0 surface that Cursor's URL-based MCP client
 * speaks. Methods we implement:
 *   - initialize          — handshake, return our capabilities + server info
 *   - notifications/initialized — no-op ack
 *   - tools/list          — list the 6 Loadout tools + their input schemas
 *   - tools/call          — invoke a tool, return its JSON payload
 *
 * Authentication: Bearer <raw_api_key> in the Authorization header.
 * The key is hashed with scrypt and looked up by its prefix in api_keys.
 *
 * For Claude Code's stdio config, see /mcp/server.ts — that one wraps the
 * SDK's StdioServerTransport and proxies to this same dispatcher.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROTOCOL_VERSION = "2025-03-26";
const SERVER_INFO = {
  name: "loadout",
  version: "0.1.0",
};

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

const ERROR = {
  PARSE: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL: -32603,
  // MCP-specific
  UNAUTHORIZED: -32001,
};

export async function GET() {
  // Cursor sometimes does a GET probe to confirm the URL responds. Return a
  // small JSON descriptor so curls aren't confusing.
  return NextResponse.json({
    server: SERVER_INFO,
    protocol_version: PROTOCOL_VERSION,
    transport: "http",
    tools: MCP_TOOL_DEFS.map((t) => t.name),
    note: "POST JSON-RPC 2.0 to this URL with Authorization: Bearer <api_key>.",
  });
}

export async function POST(req: Request) {
  // Auth.
  const auth = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  const rawKey = m?.[1] ?? "";
  const session = rawKey ? await authenticateApiKey(rawKey) : null;

  // Parse the body. We support a single request OR a batch.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return rpcResponse({
      id: null,
      error: { code: ERROR.PARSE, message: "Invalid JSON" },
    });
  }

  const isBatch = Array.isArray(body);
  const requests: JsonRpcRequest[] = isBatch
    ? (body as JsonRpcRequest[])
    : [body as JsonRpcRequest];

  const responses: JsonRpcResponse[] = [];
  for (const r of requests) {
    const res = await handleOne(r, session);
    if (res) responses.push(res); // notifications get no response
  }
  if (responses.length === 0) {
    return new Response(null, { status: 204 });
  }
  return NextResponse.json(isBatch ? responses : responses[0]);
}

async function handleOne(
  r: JsonRpcRequest,
  session: { userId: number; keyId: number } | null,
): Promise<JsonRpcResponse | null> {
  if (!r || r.jsonrpc !== "2.0" || typeof r.method !== "string") {
    return {
      jsonrpc: "2.0",
      id: r?.id ?? null,
      error: { code: ERROR.INVALID_REQUEST, message: "Invalid JSON-RPC request" },
    };
  }

  // Notifications (id absent) get no response per spec.
  const isNotification = r.id === undefined;

  // Open methods (no auth required).
  if (r.method === "initialize") {
    return ok(r.id ?? null, {
      protocolVersion: PROTOCOL_VERSION,
      serverInfo: SERVER_INFO,
      capabilities: { tools: {} },
    });
  }
  if (r.method === "notifications/initialized") {
    return null; // ack
  }
  if (r.method === "ping") {
    return ok(r.id ?? null, {});
  }
  if (r.method === "tools/list") {
    return ok(r.id ?? null, { tools: MCP_TOOL_DEFS });
  }

  // Authenticated methods.
  if (r.method === "tools/call") {
    if (!session) {
      return isNotification
        ? null
        : err(r.id ?? null, ERROR.UNAUTHORIZED, "Missing or invalid API key");
    }
    const params = r.params ?? {};
    const name = String(params.name ?? "");
    const args = (params.arguments as Record<string, unknown>) ?? {};
    if (!name) {
      return err(r.id ?? null, ERROR.INVALID_PARAMS, "tools/call: missing name");
    }
    try {
      const payload = await dispatchTool(name, args, session.userId);
      // MCP "structured content" — a single text block with stringified JSON
      // is the safest cross-client format. Cursor and Claude both render it
      // straight into the conversation.
      return ok(r.id ?? null, {
        content: [
          {
            type: "text",
            text: JSON.stringify(payload, null, 2),
          },
        ],
        isError: false,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return ok(r.id ?? null, {
        content: [{ type: "text", text: msg }],
        isError: true,
      });
    }
  }

  // Unknown method.
  if (isNotification) return null;
  return err(
    r.id ?? null,
    ERROR.METHOD_NOT_FOUND,
    `Method not found: ${r.method}`,
  );
}

function ok(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}
function err(
  id: string | number | null,
  code: number,
  message: string,
): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}
function rpcResponse(args: {
  id: string | number | null;
  error: { code: number; message: string };
}) {
  return NextResponse.json({
    jsonrpc: "2.0",
    id: args.id,
    error: args.error,
  });
}
