"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  recipeTitle: string;
  recipeSlug: string;
  hasApiKey: boolean;
};

export function IntegrationBanner({
  recipeTitle,
  recipeSlug,
  hasApiKey,
}: Props) {
  const [open, setOpen] = useState(false);

  const cursorConfig = JSON.stringify(
    {
      mcpServers: {
        loadout: {
          url: `${baseUrl()}/api/mcp`,
          headers: {
            Authorization: "Bearer YOUR_API_KEY",
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
          args: ["-y", "@loadout/mcp-server"],
          env: {
            LOADOUT_API_KEY: "YOUR_API_KEY",
          },
        },
      },
    },
    null,
    2,
  );

  const examplePrompts = [
    `Use my Loadout plan for "${recipeTitle}". Start with step 1.`,
    `I finished step 2 of my Loadout plan. What's next and how do I implement it?`,
    `Check my Loadout plan for "${recipeTitle}" — what tool should I use for authentication?`,
  ];

  return (
    <div
      className={cn(
        "mt-3 overflow-hidden rounded-md border bg-gradient-to-r from-indigo-50 via-white to-emerald-50",
        open ? "border-indigo-300" : "border-indigo-200",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white ring-1 ring-inset ring-indigo-200">
          <span className="text-xs font-semibold text-indigo-700">⌘</span>
        </span>
        <div className="flex-1">
          <p className="text-sm font-medium text-neutral-900">
            Use this in Cursor or Claude Code →
          </p>
          <p className="text-xs text-neutral-600">
            Connect your IDE to this plan via MCP. Tell Cursor &ldquo;implement
            step 3&rdquo; and it&apos;ll have full context.
          </p>
        </div>
        <ChevronRight
          className={cn(
            "h-4 w-4 shrink-0 text-neutral-500 transition-transform",
            open && "rotate-90",
          )}
        />
      </button>

      {open && (
        <div className="space-y-5 border-t border-indigo-200 bg-white px-4 pb-4 pt-4">
          {!hasApiKey && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              You don&apos;t have an API key yet.{" "}
              <Link
                href="/settings#api-keys"
                className="font-medium underline-offset-2 hover:underline"
              >
                Generate one in Settings →
              </Link>{" "}
              then come back here.
            </div>
          )}

          <Section
            title="Cursor"
            subtitle="Settings → MCP → Add new MCP server"
          >
            <ConfigBlock
              text={cursorConfig}
              copyLabel="Copy Cursor config"
            />
          </Section>

          <Section
            title="Claude Desktop / Claude Code"
            subtitle="Edit claude_desktop_config.json"
          >
            <ConfigBlock
              text={claudeConfig}
              copyLabel="Copy Claude config"
            />
          </Section>

          <Section
            title="Try one of these prompts"
            subtitle="Paste into your IDE chat after connecting"
          >
            <ul className="space-y-1.5">
              {examplePrompts.map((p, i) => (
                <PromptLine key={i} text={p} />
              ))}
            </ul>
          </Section>

          <p className="text-[10px] text-neutral-500">
            The banner only appears on saved recipes. To add the suggested
            system prompt for Cursor, see{" "}
            <Link
              href="/settings#api-keys"
              className="underline-offset-2 hover:underline"
            >
              Settings → MCP integration
            </Link>
            .
          </p>
        </div>
      )}
      {/* Hidden span used so server can confirm slug roundtrip in dev. */}
      <span hidden data-recipe-slug={recipeSlug} />
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div>
        <p className="text-xs font-semibold text-neutral-900">{title}</p>
        <p className="text-[11px] text-neutral-500">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

function ConfigBlock({ text, copyLabel }: { text: string; copyLabel: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
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
        title={copyLabel}
        className="absolute right-2 top-2 rounded-md bg-neutral-800 p-1.5 text-neutral-300 hover:bg-neutral-700"
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

function PromptLine({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <li className="flex items-start gap-2">
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1200);
        }}
        title="Copy prompt"
        className="mt-0.5 shrink-0 rounded-md bg-neutral-100 p-1 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900"
      >
        {copied ? (
          <Check className="h-3 w-3" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </button>
      <span className="text-xs leading-relaxed text-neutral-800">
        &ldquo;{text}&rdquo;
      </span>
    </li>
  );
}

function baseUrl(): string {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return process.env.NEXT_PUBLIC_LOADOUT_BASE_URL ?? "https://loadout.dev";
}
