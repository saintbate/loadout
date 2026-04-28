// Seed tool entries. ~35 entries across the most common categories an AI
// builder will hit on day one. Edit freely — `npm run db:seed` upserts by slug.

import type { PlannerToolKind } from "./plan-types";

export type SeedTool = {
  slug: string;
  name: string;
  kind: PlannerToolKind;
  description: string;
  homepage_url: string;
  repo_url?: string;
  category_tags: string[];
  auth_required: boolean;
  pricing_model: "free" | "freemium" | "paid" | "usage_based" | "unknown";
  status?:
    | "discovered"
    | "unverified"
    | "available"
    | "verified"
    | "featured"
    | "deprecated";
  capabilities: string[];
};

export const SEED_TOOLS: SeedTool[] = [
  // -------- LLM APIs --------
  {
    slug: "anthropic-api",
    name: "Anthropic API",
    kind: "api",
    description:
      "Direct REST API for Claude models. Tool use, structured outputs, prompt caching, vision, extended thinking.",
    homepage_url: "https://docs.anthropic.com",
    category_tags: ["llm", "api", "claude", "agent"],
    auth_required: true,
    pricing_model: "usage_based",
    capabilities: [
      "Chat completions",
      "Tool use / structured outputs",
      "Prompt caching (5m / 1h)",
      "Vision",
      "Extended thinking",
    ],
  },
  {
    slug: "anthropic-sdk-typescript",
    name: "Anthropic TypeScript SDK",
    kind: "sdk",
    description:
      "Official TypeScript/Node SDK for the Anthropic API. Streaming, tool use, batch.",
    homepage_url: "https://github.com/anthropics/anthropic-sdk-typescript",
    repo_url: "https://github.com/anthropics/anthropic-sdk-typescript",
    category_tags: ["llm", "sdk", "typescript", "claude"],
    auth_required: true,
    pricing_model: "free",
    capabilities: ["Type-safe Anthropic API calls", "Streaming", "Tool use"],
  },
  {
    slug: "anthropic-sdk-python",
    name: "Anthropic Python SDK",
    kind: "sdk",
    description: "Official Python SDK for the Anthropic API.",
    homepage_url: "https://github.com/anthropics/anthropic-sdk-python",
    repo_url: "https://github.com/anthropics/anthropic-sdk-python",
    category_tags: ["llm", "sdk", "python", "claude"],
    auth_required: true,
    pricing_model: "free",
    capabilities: ["Type-safe Anthropic API calls", "Streaming", "Tool use"],
  },
  {
    slug: "openai-api",
    name: "OpenAI API",
    kind: "api",
    description:
      "REST API for GPT models, embeddings, image generation, audio.",
    homepage_url: "https://platform.openai.com/docs",
    category_tags: ["llm", "api", "embeddings", "image", "audio"],
    auth_required: true,
    pricing_model: "usage_based",
    capabilities: ["Chat completions", "Embeddings", "Image generation", "Whisper transcription"],
  },
  {
    slug: "vercel-ai-sdk",
    name: "Vercel AI SDK",
    kind: "library",
    description:
      "Framework-agnostic TypeScript library for streaming LLM responses, tool calling, and React/Next.js hooks.",
    homepage_url: "https://sdk.vercel.ai",
    repo_url: "https://github.com/vercel/ai",
    category_tags: ["llm", "library", "typescript", "streaming", "react"],
    auth_required: false,
    pricing_model: "free",
    capabilities: [
      "Streaming UI helpers",
      "Multi-provider abstraction",
      "Tool calling",
      "useChat / useCompletion React hooks",
    ],
  },

  // -------- MCP servers --------
  {
    slug: "github-mcp",
    name: "GitHub MCP Server",
    kind: "mcp_server",
    description:
      "Official MCP server giving agents access to GitHub repos, issues, PRs, actions, and code search.",
    homepage_url: "https://github.com/github/github-mcp-server",
    repo_url: "https://github.com/github/github-mcp-server",
    category_tags: ["mcp", "github", "code", "git"],
    auth_required: true,
    pricing_model: "free",
    capabilities: [
      "Read/write repo files",
      "Manage issues and PRs",
      "Trigger workflows",
      "Search code",
    ],
  },
  {
    slug: "linear-mcp",
    name: "Linear MCP Server",
    kind: "mcp_server",
    description: "MCP server for Linear: issues, projects, teams, comments.",
    homepage_url: "https://linear.app/changelog/mcp",
    category_tags: ["mcp", "linear", "issues", "project-management"],
    auth_required: true,
    pricing_model: "free",
    capabilities: [
      "Create/update issues",
      "Move issues across states",
      "List projects and cycles",
    ],
  },
  {
    slug: "slack-mcp",
    name: "Slack MCP Server",
    kind: "mcp_server",
    description: "MCP server for posting and reading from Slack channels and DMs.",
    homepage_url: "https://github.com/modelcontextprotocol/servers/tree/main/src/slack",
    category_tags: ["mcp", "slack", "messaging"],
    auth_required: true,
    pricing_model: "free",
    capabilities: ["Post messages", "Read channel history", "List users/channels"],
  },
  {
    slug: "stripe-mcp",
    name: "Stripe MCP Server",
    kind: "mcp_server",
    description: "Official Stripe MCP server: customers, subscriptions, payments, products.",
    homepage_url: "https://docs.stripe.com/mcp",
    category_tags: ["mcp", "stripe", "payments", "billing"],
    auth_required: true,
    pricing_model: "free",
    capabilities: ["Manage customers/products", "Create payment links", "Query subscriptions"],
  },
  {
    slug: "supabase-mcp",
    name: "Supabase MCP Server",
    kind: "mcp_server",
    description: "MCP server for Supabase: project mgmt, database queries, edge functions.",
    homepage_url: "https://supabase.com/docs/guides/getting-started/mcp",
    category_tags: ["mcp", "supabase", "database", "auth"],
    auth_required: true,
    pricing_model: "free",
    capabilities: ["Run SQL", "Manage projects", "Deploy edge functions"],
  },
  {
    slug: "neon-mcp",
    name: "Neon MCP Server",
    kind: "mcp_server",
    description: "MCP server for Neon Postgres: create projects/branches, run SQL, manage migrations.",
    homepage_url: "https://neon.com/docs/ai/neon-mcp-server",
    repo_url: "https://github.com/neondatabase-labs/mcp-server-neon",
    category_tags: ["mcp", "neon", "postgres", "database"],
    auth_required: true,
    pricing_model: "free",
    capabilities: [
      "Create projects/branches",
      "Run SQL & transactions",
      "Schema migrations",
      "Get connection strings",
    ],
  },
  {
    slug: "filesystem-mcp",
    name: "Filesystem MCP Server",
    kind: "mcp_server",
    description: "Reference MCP server for reading/writing files in a sandboxed directory.",
    homepage_url:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem",
    category_tags: ["mcp", "filesystem", "files"],
    auth_required: false,
    pricing_model: "free",
    capabilities: ["Read/write files", "List directories", "Search file contents"],
  },
  {
    slug: "puppeteer-mcp",
    name: "Puppeteer MCP Server",
    kind: "mcp_server",
    description: "MCP server for headless browser control via Puppeteer.",
    homepage_url:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/puppeteer",
    category_tags: ["mcp", "browser", "scraping", "automation"],
    auth_required: false,
    pricing_model: "free",
    capabilities: ["Navigate pages", "Click/type", "Screenshot", "Evaluate JS"],
  },

  // -------- Productivity APIs --------
  {
    slug: "notion-api",
    name: "Notion API",
    kind: "api",
    description: "REST API for Notion pages, databases, and blocks.",
    homepage_url: "https://developers.notion.com",
    category_tags: ["api", "notion", "docs", "database"],
    auth_required: true,
    pricing_model: "free",
    capabilities: ["Create/update pages", "Query databases", "Manage blocks"],
  },
  {
    slug: "resend",
    name: "Resend",
    kind: "service",
    description: "Developer-first transactional email API. React Email integration.",
    homepage_url: "https://resend.com",
    category_tags: ["email", "transactional", "service"],
    auth_required: true,
    pricing_model: "freemium",
    capabilities: ["Send transactional email", "React Email templates", "Domain verification"],
  },

  // -------- Vector DBs / RAG --------
  {
    slug: "pinecone",
    name: "Pinecone",
    kind: "service",
    description: "Managed vector database with metadata filtering and hybrid search.",
    homepage_url: "https://www.pinecone.io",
    category_tags: ["vector-db", "rag", "embeddings", "database"],
    auth_required: true,
    pricing_model: "freemium",
    capabilities: ["Vector similarity search", "Metadata filtering", "Sparse-dense hybrid"],
  },
  {
    slug: "qdrant",
    name: "Qdrant",
    kind: "service",
    description:
      "Open-source vector database with payload filtering. Self-host or managed Qdrant Cloud.",
    homepage_url: "https://qdrant.tech",
    repo_url: "https://github.com/qdrant/qdrant",
    category_tags: ["vector-db", "rag", "embeddings", "database", "open-source"],
    auth_required: true,
    pricing_model: "freemium",
    capabilities: ["Vector similarity", "Filtering", "Self-host or cloud"],
  },
  {
    slug: "pgvector",
    name: "pgvector",
    kind: "library",
    description: "Postgres extension for vector similarity search. Native to Neon and Supabase.",
    homepage_url: "https://github.com/pgvector/pgvector",
    repo_url: "https://github.com/pgvector/pgvector",
    category_tags: ["vector-db", "rag", "postgres", "embeddings", "open-source"],
    auth_required: false,
    pricing_model: "free",
    capabilities: ["Vector indexes (IVF, HNSW)", "Distance ops", "Hybrid SQL+vector queries"],
  },

  // -------- Search APIs --------
  {
    slug: "brave-search-api",
    name: "Brave Search API",
    kind: "api",
    description: "Independent web search index with a clean API. Generous free tier.",
    homepage_url: "https://brave.com/search/api",
    category_tags: ["search", "web", "api"],
    auth_required: true,
    pricing_model: "freemium",
    capabilities: ["Web search", "News search", "Image/video search"],
  },
  {
    slug: "tavily",
    name: "Tavily",
    kind: "api",
    description:
      "Search API designed for LLM agents. Returns clean, ranked, ready-to-cite snippets.",
    homepage_url: "https://tavily.com",
    category_tags: ["search", "web", "api", "agent"],
    auth_required: true,
    pricing_model: "freemium",
    capabilities: ["Agent-optimized search", "Content extraction", "Domain filtering"],
  },
  {
    slug: "exa",
    name: "Exa",
    kind: "api",
    description:
      "Neural search API: semantic search over the web with topic-similar and 'find similar' modes.",
    homepage_url: "https://exa.ai",
    category_tags: ["search", "web", "api", "semantic"],
    auth_required: true,
    pricing_model: "freemium",
    capabilities: ["Semantic search", "Find similar pages", "Content retrieval"],
  },

  // -------- Web scraping / extraction --------
  {
    slug: "playwright",
    name: "Playwright",
    kind: "library",
    description: "Browser automation library by Microsoft. Cross-browser, headless, robust.",
    homepage_url: "https://playwright.dev",
    repo_url: "https://github.com/microsoft/playwright",
    category_tags: ["browser", "scraping", "automation", "testing", "open-source"],
    auth_required: false,
    pricing_model: "free",
    capabilities: ["Browser automation", "Screenshots", "Network interception", "Tracing"],
  },
  {
    slug: "firecrawl",
    name: "Firecrawl",
    kind: "service",
    description:
      "Web crawling and scraping API that returns clean Markdown for LLMs. Handles JS-rendered sites.",
    homepage_url: "https://firecrawl.dev",
    category_tags: ["scraping", "crawl", "llm", "markdown"],
    auth_required: true,
    pricing_model: "freemium",
    capabilities: ["Single page scrape → Markdown", "Whole-site crawl", "Structured extraction"],
  },
  {
    slug: "browserbase",
    name: "Browserbase",
    kind: "service",
    description: "Managed headless browsers with stealth, captcha-solving, and session replay.",
    homepage_url: "https://www.browserbase.com",
    category_tags: ["browser", "scraping", "automation", "service"],
    auth_required: true,
    pricing_model: "usage_based",
    capabilities: ["Hosted browsers", "Stealth mode", "Session replay"],
  },

  // -------- Scheduling / cron --------
  {
    slug: "github-actions-cron",
    name: "GitHub Actions (cron)",
    kind: "service",
    description:
      "Scheduled workflows on GitHub Actions. Free for public repos and within free tier minutes for private.",
    homepage_url: "https://docs.github.com/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows#schedule",
    category_tags: ["cron", "scheduling", "ci", "github"],
    auth_required: false,
    pricing_model: "freemium",
    capabilities: ["Cron-triggered jobs", "Secrets storage", "Matrix runs"],
  },
  {
    slug: "vercel-cron",
    name: "Vercel Cron",
    kind: "service",
    description: "Cron jobs that hit your Next.js API routes on a schedule.",
    homepage_url: "https://vercel.com/docs/cron-jobs",
    category_tags: ["cron", "scheduling", "vercel", "serverless"],
    auth_required: false,
    pricing_model: "freemium",
    capabilities: ["Cron-triggered HTTP calls to your routes", "Secret bearer auth"],
  },
  {
    slug: "trigger-dev",
    name: "Trigger.dev",
    kind: "service",
    description:
      "Background jobs with a TypeScript SDK. Long-running, retries, schedules, observability.",
    homepage_url: "https://trigger.dev",
    repo_url: "https://github.com/triggerdotdev/trigger.dev",
    category_tags: ["jobs", "scheduling", "background", "typescript", "open-source"],
    auth_required: true,
    pricing_model: "freemium",
    capabilities: ["Long-running jobs", "Cron schedules", "Retries", "Run history"],
  },

  // -------- Deployment / runtime --------
  {
    slug: "vercel",
    name: "Vercel",
    kind: "service",
    description: "Frontend cloud. Optimized for Next.js. Edge functions, ISR, previews.",
    homepage_url: "https://vercel.com",
    category_tags: ["deployment", "hosting", "next", "serverless"],
    auth_required: true,
    pricing_model: "freemium",
    capabilities: ["Next.js hosting", "Edge functions", "Preview deployments", "Cron"],
  },
  {
    slug: "railway",
    name: "Railway",
    kind: "service",
    description:
      "Container-based deployment. Postgres, Redis, workers — opinionated and simple.",
    homepage_url: "https://railway.app",
    category_tags: ["deployment", "hosting", "containers"],
    auth_required: true,
    pricing_model: "usage_based",
    capabilities: ["Container deploys", "Managed Postgres/Redis", "Persistent workers"],
  },
  {
    slug: "modal",
    name: "Modal",
    kind: "service",
    description:
      "Serverless Python compute. GPU access, fast cold starts, ideal for ML inference and batch jobs.",
    homepage_url: "https://modal.com",
    category_tags: ["deployment", "python", "serverless", "gpu", "ml"],
    auth_required: true,
    pricing_model: "usage_based",
    capabilities: ["Serverless Python", "GPU runtime", "Batch jobs", "Web endpoints"],
  },
  {
    slug: "cloudflare-workers",
    name: "Cloudflare Workers",
    kind: "service",
    description: "Serverless JS/TS at the edge. KV, R2, D1, Durable Objects, Queues.",
    homepage_url: "https://workers.cloudflare.com",
    category_tags: ["deployment", "edge", "serverless"],
    auth_required: true,
    pricing_model: "freemium",
    capabilities: ["Edge functions", "KV/R2/D1 storage", "Durable Objects", "Queues"],
  },

  // -------- Auth / data --------
  {
    slug: "clerk",
    name: "Clerk",
    kind: "service",
    description: "Drop-in auth: sign-in/sign-up UI, sessions, organizations, webhooks.",
    homepage_url: "https://clerk.com",
    category_tags: ["auth", "users", "service"],
    auth_required: true,
    pricing_model: "freemium",
    capabilities: ["Sign-in/up UI", "Sessions/JWT", "Organizations", "Webhooks"],
  },
  {
    slug: "supabase",
    name: "Supabase",
    kind: "service",
    description: "Postgres + auth + storage + realtime + edge functions, all in one.",
    homepage_url: "https://supabase.com",
    category_tags: ["database", "auth", "postgres", "service"],
    auth_required: true,
    pricing_model: "freemium",
    capabilities: ["Postgres", "Row-level security auth", "Storage", "Realtime"],
  },
  {
    slug: "neon",
    name: "Neon",
    kind: "service",
    description:
      "Serverless Postgres with branching, autoscale-to-zero, and instant copy-on-write branches.",
    homepage_url: "https://neon.com",
    category_tags: ["database", "postgres", "service"],
    auth_required: true,
    pricing_model: "freemium",
    capabilities: ["Serverless Postgres", "DB branching", "Scale to zero", "pgvector"],
  },
  {
    slug: "drizzle-orm",
    name: "Drizzle ORM",
    kind: "library",
    description: "Type-safe TypeScript ORM with a SQL-shaped query builder. Edge-friendly.",
    homepage_url: "https://orm.drizzle.team",
    repo_url: "https://github.com/drizzle-team/drizzle-orm",
    category_tags: ["orm", "typescript", "database", "open-source"],
    auth_required: false,
    pricing_model: "free",
    capabilities: ["Typed query builder", "Migrations (drizzle-kit)", "Edge runtime support"],
  },

  // -------- Code / build --------
  {
    slug: "pygithub",
    name: "PyGithub",
    kind: "library",
    description: "Python wrapper for the GitHub REST API. Typed objects, rate-limit handling.",
    homepage_url: "https://pygithub.readthedocs.io",
    repo_url: "https://github.com/PyGithub/PyGithub",
    category_tags: ["github", "python", "library", "open-source"],
    auth_required: true,
    pricing_model: "free",
    capabilities: ["List repos/commits/PRs", "Manage issues", "Rate-limit handling"],
  },
  {
    slug: "octokit",
    name: "Octokit",
    kind: "sdk",
    description: "Official GitHub SDK for JavaScript/TypeScript. REST + GraphQL.",
    homepage_url: "https://github.com/octokit/octokit.js",
    repo_url: "https://github.com/octokit/octokit.js",
    category_tags: ["github", "typescript", "sdk", "open-source"],
    auth_required: true,
    pricing_model: "free",
    capabilities: ["GitHub REST", "GitHub GraphQL", "Webhooks helper"],
  },
];
