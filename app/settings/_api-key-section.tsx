"use client";

import { useState } from "react";
import { Check, Copy, KeyRound, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type ActiveKey = {
  prefix: string;
  lastFour: string;
  createdAt: string;
  lastUsedAt: string | null;
};

type Props = {
  generateAction: () => void | Promise<void>;
  revokeAction: () => void | Promise<void>;
  activeKey: ActiveKey | null;
  freshRawKey: string | null;
};

const SUGGESTED_SYSTEM_PROMPT = `You have access to a Loadout MCP server via the \`loadout\` tool. Loadout is a verified build-plan directory. When the user mentions a build plan, a recipe, or asks what to build next, check their Loadout recipes first using list_my_recipes() and get_recipe().

When implementing a step, call get_step() to get the full context before generating code. When a step is complete, call mark_step_complete() so the user's progress is tracked.

Prefer tools and libraries specified in the Loadout plan. If you need to deviate, explain why.`;

export function ApiKeySection({
  generateAction,
  revokeAction,
  activeKey,
  freshRawKey,
}: Props) {
  const baseUrl =
    typeof window !== "undefined" ? window.location.origin : "https://loadout.dev";

  const cursorConfig = JSON.stringify(
    {
      mcpServers: {
        loadout: {
          url: `${baseUrl}/api/mcp`,
          headers: {
            Authorization: `Bearer ${freshRawKey ?? "YOUR_API_KEY"}`,
          },
        },
      },
    },
    null,
    2,
  );

  const claudeConfig = JSON.stringify(
    {
      mcpServers: {
        loadout: {
          command: "npx",
          args: ["-y", "@loadoutx/mcp-server"],
          env: {
            LOADOUT_API_KEY: freshRawKey ?? "YOUR_API_KEY",
            LOADOUT_BASE_URL: baseUrl,
          },
        },
      },
    },
    null,
    2,
  );

  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-md border border-neutral-200 bg-white p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-neutral-100">
            <KeyRound className="h-4 w-4 text-neutral-700" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-neutral-900">
              {activeKey ? "Active API key" : "No API key yet"}
            </p>
            <p className="text-xs text-neutral-500">
              {activeKey
                ? `Created ${new Date(activeKey.createdAt).toLocaleDateString()}${activeKey.lastUsedAt ? ` · last used ${new Date(activeKey.lastUsedAt).toLocaleString()}` : " · never used"}`
                : "Generate a key below, then paste the config into your IDE."}
            </p>
            {activeKey && (
              <p className="mt-1 font-mono text-[11px] text-neutral-500">
                lo_{activeKey.prefix}_…{activeKey.lastFour}
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            {activeKey ? (
              <>
                <form action={generateAction}>
                  <Button type="submit" size="sm" variant="secondary">
                    <RefreshCw className="h-3.5 w-3.5" />
                    Rotate
                  </Button>
                </form>
                <form action={revokeAction}>
                  <Button type="submit" size="sm" variant="ghost">
                    Revoke
                  </Button>
                </form>
              </>
            ) : (
              <form action={generateAction}>
                <Button type="submit" size="sm">
                  Generate API key
                </Button>
              </form>
            )}
          </div>
        </div>

        {freshRawKey && (
          <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3">
            <p className="text-xs font-semibold text-amber-900">
              Save this now — you won&apos;t see it again.
            </p>
            <p className="mt-1 text-[11px] text-amber-800">
              Store it in your IDE&apos;s MCP config or a password manager.
              If you lose it, rotate to generate a new one.
            </p>
            <CopyableKey value={freshRawKey} />
          </div>
        )}
      </div>

      {/* Config snippets — show even if no key yet, but with the placeholder. */}
      <ConfigSection
        title="Cursor"
        subtitle="Settings → MCP → Add new MCP server"
        text={cursorConfig}
      />
      <ConfigSection
        title="Claude Desktop / Claude Code"
        subtitle="Edit ~/Library/Application Support/Claude/claude_desktop_config.json"
        text={claudeConfig}
      />

      <div className="rounded-md border border-neutral-200 bg-white p-4">
        <p className="text-sm font-medium text-neutral-900">
          Suggested system prompt
        </p>
        <p className="mt-0.5 text-xs text-neutral-500">
          Add to Cursor → Settings → Rules for AI, or Claude → Project
          instructions. This makes the IDE proactively check your Loadout
          plans before generating code.
        </p>
        <CopyableBlock text={SUGGESTED_SYSTEM_PROMPT} className="mt-3" />
      </div>

      <p className="text-[11px] text-neutral-500">
        Tools exposed: <code>get_recipe</code>, <code>get_step</code>,{" "}
        <code>list_my_recipes</code>, <code>mark_step_complete</code>,{" "}
        <code>get_tool_info</code>, <code>suggest_next_step</code>.
      </p>
    </div>
  );
}

function ConfigSection({
  title,
  subtitle,
  text,
}: {
  title: string;
  subtitle: string;
  text: string;
}) {
  return (
    <div>
      <p className="text-sm font-medium text-neutral-900">{title}</p>
      <p className="text-xs text-neutral-500">{subtitle}</p>
      <CopyableBlock text={text} className="mt-2" />
    </div>
  );
}

function CopyableBlock({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={`relative ${className ?? ""}`}>
      <pre className="overflow-x-auto rounded-md bg-neutral-900 px-3 py-2.5 pr-12 font-mono text-[11px] leading-relaxed text-neutral-100">
        {text}
      </pre>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        }}
        className="absolute right-2 top-2 rounded-md bg-neutral-800 p-1.5 text-neutral-300 hover:bg-neutral-700"
        title="Copy"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}

function CopyableKey({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-2 flex items-center gap-2">
      <code className="flex-1 truncate rounded-md bg-white px-2 py-1.5 font-mono text-[11px] text-neutral-900 ring-1 ring-inset ring-amber-300">
        {value}
      </code>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        }}
        className="rounded-md bg-neutral-900 px-2 py-1.5 text-[11px] text-white hover:bg-neutral-800"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
