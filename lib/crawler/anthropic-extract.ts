import Anthropic from "@anthropic-ai/sdk";
import { PLANNER_MODEL } from "../planner-prompt";

/**
 * Given raw README/description text for a tool, ask Anthropic to fill in
 * the directory metadata fields. Returns a partial — the caller decides
 * which fields to keep (e.g., the crawler trusts Anthropic less than the
 * source's parsed metadata).
 */

const EXTRACT_TOOL_NAME = "emit_tool_metadata";

const ALLOWED_TAGS = [
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
  "mcp_integration",
  "scheduling",
  "web_scraping",
  "file_processing",
  "monitoring",
  "queue",
  "cache",
  "other",
];

const EXTRACT_SCHEMA = {
  type: "object",
  required: ["slug", "name", "kind"],
  properties: {
    slug: {
      type: "string",
      description: "Lowercase-kebab. Stable identifier for the tool.",
    },
    name: { type: "string", description: "Human-readable name." },
    kind: {
      type: "string",
      enum: ["mcp_server", "cli", "api", "library", "sdk", "service"],
    },
    description: {
      type: "string",
      description:
        "1-2 sentences. What the tool does. No marketing language.",
    },
    capabilities: {
      type: "array",
      items: { type: "string" },
      description: "Short capability strings, max 6 entries.",
    },
    category_tags: {
      type: "array",
      items: { type: "string", enum: ALLOWED_TAGS },
      description: "Choose 1-4 from the controlled vocabulary.",
    },
    auth_required: { type: "boolean" },
    pricing_model: {
      type: "string",
      enum: ["free", "freemium", "paid", "usage_based", "unknown"],
    },
  },
} as const;

const EXTRACT_SYSTEM = `You extract tool directory metadata from raw README/description content.

Be precise. Omit fields you can't determine confidently. Don't make things up — if the README doesn't say the pricing model, return "unknown".

When choosing category_tags, pick from the controlled vocabulary. Skip the field rather than invent a tag.

Output ONLY via the emit_tool_metadata tool.`;

export type ExtractedToolMetadata = {
  slug?: string;
  name?: string;
  kind?:
    | "mcp_server"
    | "cli"
    | "api"
    | "library"
    | "sdk"
    | "service";
  description?: string;
  capabilities?: string[];
  category_tags?: string[];
  auth_required?: boolean;
  pricing_model?: "free" | "freemium" | "paid" | "usage_based" | "unknown";
};

export async function extractToolMetadata(args: {
  /** Raw text the model will see — README excerpt, package description, etc. */
  rawContext: string;
  /** Hint to bias the extraction. */
  nameHint?: string;
  homepageHint?: string;
  repoHint?: string;
}): Promise<ExtractedToolMetadata | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const truncated = args.rawContext.slice(0, 5000);

  const response = await client.messages.create({
    model: PLANNER_MODEL,
    max_tokens: 1024,
    system: EXTRACT_SYSTEM,
    tools: [
      {
        name: EXTRACT_TOOL_NAME,
        description:
          "Emit directory metadata for the described tool. The only way to respond.",
        input_schema:
          EXTRACT_SCHEMA as unknown as Anthropic.Tool["input_schema"],
      },
    ],
    tool_choice: { type: "tool", name: EXTRACT_TOOL_NAME },
    messages: [
      {
        role: "user",
        content: `# Tool description
${args.nameHint ? `Name (hint): ${args.nameHint}` : ""}
${args.homepageHint ? `Homepage: ${args.homepageHint}` : ""}
${args.repoHint ? `Repo: ${args.repoHint}` : ""}

# Raw context
${truncated}

Emit metadata via the emit_tool_metadata tool.`,
      },
    ],
  });

  const block = response.content.find(
    (b): b is Anthropic.ToolUseBlock =>
      b.type === "tool_use" && b.name === EXTRACT_TOOL_NAME,
  );
  if (!block) return null;
  return block.input as ExtractedToolMetadata;
}
