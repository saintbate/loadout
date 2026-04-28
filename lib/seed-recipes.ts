// Seed recipes. Hand-written, status="verified". These are the canonical
// examples that prove the directory has depth. Edit freely — `npm run db:seed`
// upserts by slug.

import type { Plan } from "./plan-types";

export type SeedRecipe = {
  slug: string;
  title: string;
  goal_description: string;
  category_tags: string[];
  plan: Plan;
};

export const SEED_RECIPES: SeedRecipe[] = [
  // ---------------------------------------------------------------------------
  {
    slug: "daily-github-commit-digest",
    title: "Daily GitHub commit digest emailed to me",
    goal_description:
      "Every morning, summarize what I shipped to GitHub yesterday and email me the digest.",
    category_tags: ["github", "email", "cron", "llm", "daily"],
    plan: {
      summary:
        "A daily cron job that pulls your GitHub commits from the past 24 hours, summarizes them with Claude, and emails the digest via Resend.",
      estimated_time_minutes: 45,
      estimated_monthly_cost_usd: 1.5,
      steps: [
        {
          step_number: 1,
          title: "Pull commits from the last 24 hours",
          tools: [
            { slug: "pygithub", role: "Query the GitHub REST API for commits", proposed_tool: false },
          ],
          rationale:
            "PyGithub wraps every REST endpoint as typed Python objects, handles ETag-based rate limiting transparently, and exposes `repo.get_commits(author=user, since=...)` so you don't hand-roll pagination.",
          alternatives_considered: [
            { name: "GitHub CLI (gh)", rejected_because: "Shell scripting commits across all repos requires looping JSON with jq — ugly to compose with the rest of this pipeline." },
            { name: "Octokit (TypeScript)", rejected_because: "Equivalent in capability, but the rest of this pipeline is simpler in Python with the Anthropic Python SDK." },
          ],
          code: `from github import Github
from datetime import datetime, timedelta, timezone
import os

g = Github(os.environ["GH_TOKEN"])
user = g.get_user()
since = datetime.now(timezone.utc) - timedelta(days=1)

commits = []
for repo in user.get_repos(affiliation="owner,collaborator"):
    try:
        for c in repo.get_commits(author=user, since=since):
            commits.append({
                "repo": repo.full_name,
                "sha": c.sha[:7],
                "message": c.commit.message.splitlines()[0],
                "url": c.html_url,
            })
    except Exception:
        pass`,
          language: "python",
          setup_commands: ["pip install PyGithub anthropic resend"],
          trust_signal: "verified",
        },
        {
          step_number: 2,
          title: "Summarize with Claude",
          tools: [
            { slug: "anthropic-sdk-python", role: "Generate the digest text", proposed_tool: false },
          ],
          rationale:
            "Claude Sonnet handles the 'rewrite N commit messages into a coherent narrative' task with minimal prompting. Streaming isn't needed for a daily job, so a single Messages call is fine.",
          alternatives_considered: [
            { name: "OpenAI API", rejected_because: "Equivalent quality, but you only need one provider here." },
          ],
          code: `from anthropic import Anthropic

client = Anthropic()
prompt = "Summarize these commits as a brief, human daily digest:\\n" + "\\n".join(
    f"- [{c['repo']}] {c['message']} ({c['sha']})" for c in commits
)
resp = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    messages=[{"role": "user", "content": prompt}],
)
digest = resp.content[0].text`,
          language: "python",
          trust_signal: "verified",
        },
        {
          step_number: 3,
          title: "Send the email",
          tools: [
            { slug: "resend", role: "Deliver the digest", proposed_tool: false },
          ],
          rationale:
            "Resend's Python SDK is one call, supports verified domains so it doesn't end up in spam, and the free tier covers 100 emails/day.",
          alternatives_considered: [
            { name: "SMTP via Gmail App Password", rejected_because: "Brittle — Google quietly deprecates these and deliverability is worse than a transactional provider." },
          ],
          code: `import resend, os
resend.api_key = os.environ["RESEND_API_KEY"]
resend.Emails.send({
    "from": "you@yourdomain.com",
    "to": "you@yourdomain.com",
    "subject": "Your daily commit digest",
    "html": f"<pre>{digest}</pre>",
})`,
          language: "python",
          trust_signal: "verified",
        },
        {
          step_number: 4,
          title: "Run it on a schedule",
          tools: [
            { slug: "github-actions-cron", role: "Trigger the script every morning", proposed_tool: false },
          ],
          rationale:
            "Free for public repos and well within free minutes for a daily 30-second job. Secrets storage is built in. No infra to manage.",
          alternatives_considered: [
            { name: "Vercel Cron", rejected_because: "Requires deploying a Next.js app just to host one Python-flavored job." },
            { name: "Modal scheduled function", rejected_because: "Excellent fit, but adds a paid dependency for a job this small." },
          ],
          code: `# .github/workflows/digest.yml
name: Daily commit digest
on:
  schedule:
    - cron: "0 14 * * *"  # 14:00 UTC = 7am PT
  workflow_dispatch:
jobs:
  digest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - run: pip install PyGithub anthropic resend
      - run: python digest.py
        env:
          GH_TOKEN: \${{ secrets.GH_TOKEN }}
          ANTHROPIC_API_KEY: \${{ secrets.ANTHROPIC_API_KEY }}
          RESEND_API_KEY: \${{ secrets.RESEND_API_KEY }}`,
          language: "yaml",
          trust_signal: "verified",
        },
      ],
      open_questions: [],
    },
  },

  // ---------------------------------------------------------------------------
  {
    slug: "rag-over-pdfs-with-pgvector",
    title: "RAG over a folder of PDFs",
    goal_description:
      "Let me drop PDFs into a folder, embed them, and ask Claude questions over the contents.",
    category_tags: ["rag", "pdf", "vector-db", "llm", "postgres"],
    plan: {
      summary:
        "Chunk PDFs, embed with OpenAI, store in Postgres+pgvector on Neon, and answer queries with Claude using retrieved chunks.",
      estimated_time_minutes: 90,
      estimated_monthly_cost_usd: 5,
      steps: [
        {
          step_number: 1,
          title: "Provision Postgres with pgvector",
          tools: [
            { slug: "neon", role: "Hosted Postgres", proposed_tool: false },
            { slug: "pgvector", role: "Vector indexes inside Postgres", proposed_tool: false },
          ],
          rationale:
            "Neon supports pgvector out of the box — `CREATE EXTENSION vector;` and you have ANN search alongside your relational data. No second database to operate.",
          alternatives_considered: [
            { name: "Pinecone", rejected_because: "Excellent product, but adds another vendor and bill for a workload that fits comfortably in Postgres." },
            { name: "Qdrant Cloud", rejected_because: "Same — overkill until you need >10M vectors or specialised hybrid search." },
          ],
          code: `-- run once
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE chunks (
  id           bigserial PRIMARY KEY,
  source       text NOT NULL,
  content      text NOT NULL,
  embedding    vector(1536) NOT NULL
);

CREATE INDEX ON chunks USING hnsw (embedding vector_cosine_ops);`,
          language: "sql",
          setup_commands: [],
          trust_signal: "verified",
        },
        {
          step_number: 2,
          title: "Ingest: extract → chunk → embed → store",
          tools: [
            { slug: "openai-api", role: "Generate embeddings", proposed_tool: false },
            { slug: "drizzle-orm", role: "Type-safe inserts to Neon", proposed_tool: false },
          ],
          rationale:
            "OpenAI's text-embedding-3-small is the strongest cost-per-quality embedding right now and matches the 1536 dim we set up. Drizzle keeps the inserts typed and Edge-runtime safe.",
          alternatives_considered: [
            { name: "Voyage AI embeddings", rejected_because: "Higher quality on retrieval benchmarks but pricier and adds a vendor; revisit if recall matters." },
            { name: "Cohere embed-v3", rejected_because: "Equivalent quality, fewer integrations in the JS ecosystem." },
          ],
          code: `import OpenAI from "openai";
import { db } from "@/db/client";
import { chunks } from "@/db/schema";

const openai = new OpenAI();
async function embedAndStore(source: string, text: string) {
  const pieces = chunk(text, 800);  // ~800 chars w/ 100 overlap
  const { data } = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: pieces,
  });
  await db.insert(chunks).values(pieces.map((c, i) => ({
    source, content: c, embedding: data[i].embedding,
  })));
}`,
          language: "typescript",
          setup_commands: ["npm i openai pdf-parse"],
          trust_signal: "verified",
        },
        {
          step_number: 3,
          title: "Answer with Claude over retrieved chunks",
          tools: [
            { slug: "anthropic-sdk-typescript", role: "Call Claude with retrieved context", proposed_tool: false },
          ],
          rationale:
            "Claude Sonnet handles long context (200k) cleanly so you don't need aggressive reranking. Wrap retrieved chunks in <doc> tags for the model to cite.",
          alternatives_considered: [
            { name: "Vercel AI SDK", rejected_because: "Great for streaming UIs; unnecessary indirection if you're returning one answer." },
          ],
          code: `import Anthropic from "@anthropic-ai/sdk";
import { sql } from "drizzle-orm";

const client = new Anthropic();
async function ask(q: string) {
  const { data: [{ embedding: qEmb }] } = await openai.embeddings.create({
    model: "text-embedding-3-small", input: [q],
  });
  const top = await db.execute(sql\`
    SELECT content, source FROM chunks
    ORDER BY embedding <=> \${qEmb}::vector
    LIMIT 8\`);
  const ctx = top.rows.map((r, i) =>
    \`<doc id="\${i}" src="\${r.source}">\${r.content}</doc>\`).join("\\n");
  const r = await client.messages.create({
    model: "claude-sonnet-4-6", max_tokens: 1024,
    messages: [{ role: "user", content: \`\${ctx}\\n\\nQuestion: \${q}\` }],
  });
  return r.content[0].type === "text" ? r.content[0].text : "";
}`,
          language: "typescript",
          trust_signal: "verified",
        },
      ],
      open_questions: [
        "How fresh do the embeddings need to be? If PDFs change rarely, ingestion can be a one-shot script; if they change daily, wire it to file-watcher or a cron.",
      ],
    },
  },

  // ---------------------------------------------------------------------------
  {
    slug: "auto-triage-linear-issues",
    title: "Auto-triage incoming Linear issues",
    goal_description:
      "When a new issue lands in Linear, classify it (bug/feature/question), assign a priority, and route it to the right team.",
    category_tags: ["linear", "triage", "agent", "llm"],
    plan: {
      summary:
        "A Vercel Cron job polls Linear for new untriaged issues, classifies each with Claude using tool use, then writes back the labels and team via the Linear MCP server.",
      estimated_time_minutes: 60,
      estimated_monthly_cost_usd: 3,
      steps: [
        {
          step_number: 1,
          title: "List untriaged issues",
          tools: [
            { slug: "linear-mcp", role: "Read open issues without labels", proposed_tool: false },
          ],
          rationale:
            "Linear's MCP server exposes a single `list_issues` call with state filters; no need to handcraft the GraphQL query or maintain auth state.",
          alternatives_considered: [
            { name: "Linear webhooks", rejected_because: "More accurate but requires hosting a public endpoint and verifying signatures — slower path to a working v1." },
          ],
          code: "",
          language: "",
          trust_signal: "verified",
        },
        {
          step_number: 2,
          title: "Classify with Claude tool use",
          tools: [
            { slug: "anthropic-sdk-typescript", role: "Force a structured triage decision", proposed_tool: false },
          ],
          rationale:
            "Defining a `triage` tool with enums for kind/priority/team forces a parseable decision per issue — far more reliable than asking for JSON in prose.",
          alternatives_considered: [
            { name: "Plain JSON-mode prompt", rejected_because: "Higher malformed-output rate; tool use makes the schema a hard constraint." },
          ],
          code: `const TRIAGE_TOOL = {
  name: "triage",
  description: "Classify a Linear issue.",
  input_schema: {
    type: "object",
    required: ["kind", "priority", "team_key"],
    properties: {
      kind: { type: "string", enum: ["bug", "feature", "question", "spam"] },
      priority: { type: "string", enum: ["urgent", "high", "normal", "low"] },
      team_key: { type: "string" },
      reason: { type: "string" },
    },
  },
} as const;

const r = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 256,
  tools: [TRIAGE_TOOL],
  tool_choice: { type: "tool", name: "triage" },
  messages: [{ role: "user", content: \`Triage:\\nTitle: \${issue.title}\\nBody: \${issue.body}\` }],
});`,
          language: "typescript",
          trust_signal: "verified",
        },
        {
          step_number: 3,
          title: "Apply the labels",
          tools: [
            { slug: "linear-mcp", role: "Write labels and reassign team", proposed_tool: false },
          ],
          rationale:
            "Same MCP server already has write scopes; one `update_issue` call applies the labels, priority, and team in one round-trip.",
          alternatives_considered: [],
          code: "",
          language: "",
          trust_signal: "verified",
        },
        {
          step_number: 4,
          title: "Run on a schedule",
          tools: [
            { slug: "vercel-cron", role: "Trigger every 10 minutes", proposed_tool: false },
          ],
          rationale:
            "If you've already got a Next.js app on Vercel, Vercel Cron is one config block — no extra service.",
          alternatives_considered: [
            { name: "GitHub Actions cron", rejected_because: "Min interval of 5 min and slow cold starts; Vercel Cron is snappier for sub-minute response to issues." },
          ],
          code: `// vercel.json
{
  "crons": [
    { "path": "/api/triage", "schedule": "*/10 * * * *" }
  ]
}`,
          language: "json",
          trust_signal: "verified",
        },
      ],
      open_questions: [],
    },
  },

  // ---------------------------------------------------------------------------
  {
    slug: "slack-answer-bot-from-notion",
    title: "Slack bot that answers questions from your Notion docs",
    goal_description:
      "Build a Slack bot that, when @-mentioned, answers questions using our team's Notion knowledge base.",
    category_tags: ["slack", "notion", "rag", "agent", "llm"],
    plan: {
      summary:
        "Index your Notion workspace into pgvector, listen for @-mentions in Slack, retrieve top chunks, and answer with Claude. Reply in-thread.",
      estimated_time_minutes: 120,
      estimated_monthly_cost_usd: 8,
      steps: [
        {
          step_number: 1,
          title: "Sync Notion → Postgres + pgvector",
          tools: [
            { slug: "notion-api", role: "Fetch all pages and blocks", proposed_tool: false },
            { slug: "openai-api", role: "Embed chunks", proposed_tool: false },
            { slug: "neon", role: "Store chunks + vectors", proposed_tool: false },
            { slug: "pgvector", role: "Vector index for retrieval", proposed_tool: false },
          ],
          rationale:
            "Notion's API exposes pages and rich-text blocks directly; convert to plain text, chunk at ~800 chars, embed once with text-embedding-3-small, store with the page URL as the citation source.",
          alternatives_considered: [
            { name: "Notion's built-in AI Q&A", rejected_because: "Lives inside Notion only — can't be invoked from Slack and you can't customise the answer style." },
          ],
          code: "",
          language: "",
          setup_commands: ["npm i @notionhq/client openai @neondatabase/serverless drizzle-orm"],
          trust_signal: "verified",
        },
        {
          step_number: 2,
          title: "Receive Slack mentions",
          tools: [
            { slug: "slack-mcp", role: "Subscribe to app_mention events", proposed_tool: false },
          ],
          rationale:
            "The Slack MCP server handles socket-mode auth and event delivery so you don't manage signing-secret verification or a public webhook.",
          alternatives_considered: [
            { name: "Slack Bolt SDK directly", rejected_because: "Equivalent capability, more setup; use it if you outgrow MCP scope." },
          ],
          code: "",
          language: "",
          trust_signal: "verified",
        },
        {
          step_number: 3,
          title: "Answer with Claude + retrieved context",
          tools: [
            { slug: "anthropic-sdk-typescript", role: "Compose the answer with citations", proposed_tool: false },
          ],
          rationale:
            "Wrap retrieved chunks in <doc src='…'> tags and instruct Claude to cite Notion URLs in its reply. Sonnet's long context means you rarely need to rerank.",
          alternatives_considered: [
            { name: "Vercel AI SDK with streaming", rejected_because: "Slack only renders the final message — streaming gains nothing here." },
          ],
          code: `const ctx = retrieved.map(r =>
  \`<doc src="\${r.url}">\${r.content}</doc>\`).join("\\n");
const r = await anthropic.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 1024,
  system: "Answer using only the docs. Cite sources as Slack-formatted links.",
  messages: [{ role: "user", content: \`\${ctx}\\n\\nQuestion: \${question}\` }],
});`,
          language: "typescript",
          trust_signal: "verified",
        },
        {
          step_number: 4,
          title: "Reply in thread",
          tools: [
            { slug: "slack-mcp", role: "post_message in the same thread", proposed_tool: false },
          ],
          rationale: "Threaded replies keep the channel readable and let the asker follow up without re-mentioning.",
          alternatives_considered: [],
          code: "",
          language: "",
          trust_signal: "verified",
        },
      ],
      open_questions: [
        "How fresh does Notion content need to be? Daily re-sync is fine for most docs; for critical pages, wire to Notion webhooks instead.",
      ],
    },
  },

  // ---------------------------------------------------------------------------
  {
    slug: "web-research-agent-markdown-report",
    title: "Web research agent that writes a Markdown report",
    goal_description:
      "Give a topic; get a 1-page Markdown report with cited sources.",
    category_tags: ["research", "agent", "search", "scraping", "llm"],
    plan: {
      summary:
        "Use Tavily to search, Firecrawl to extract clean Markdown from the top results, and Claude to synthesize a cited report.",
      estimated_time_minutes: 60,
      estimated_monthly_cost_usd: 4,
      steps: [
        {
          step_number: 1,
          title: "Search the web",
          tools: [
            { slug: "tavily", role: "Top-N ranked URLs for the topic", proposed_tool: false },
          ],
          rationale:
            "Tavily is purpose-built for agents: returns clean snippets with relevance scores, supports include/exclude domain filters, and one call replaces the SerpAPI + parsing rig.",
          alternatives_considered: [
            { name: "Brave Search API", rejected_because: "Cheaper and more permissive, but snippets are noisier and require post-processing." },
            { name: "Exa", rejected_because: "Stronger on semantic 'find similar' queries; for a topic-search like this Tavily's ranking is more direct." },
          ],
          code: `const r = await fetch("https://api.tavily.com/search", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    api_key: process.env.TAVILY_API_KEY,
    query, max_results: 8, search_depth: "advanced",
  }),
});
const { results } = await r.json();`,
          language: "typescript",
          trust_signal: "verified",
        },
        {
          step_number: 2,
          title: "Extract clean Markdown from each URL",
          tools: [
            { slug: "firecrawl", role: "Render JS pages and return Markdown", proposed_tool: false },
          ],
          rationale:
            "Firecrawl handles JS-rendered sites and returns LLM-ready Markdown — no Cheerio parsing rig, no Playwright maintenance.",
          alternatives_considered: [
            { name: "Playwright + Readability", rejected_because: "Works but you maintain the browser pool, retries, and parsing yourself." },
          ],
          code: `const docs = await Promise.all(results.map(async r => {
  const f = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": \`Bearer \${process.env.FIRECRAWL_API_KEY}\`,
    },
    body: JSON.stringify({ url: r.url, formats: ["markdown"] }),
  });
  return { url: r.url, md: (await f.json()).data.markdown };
}));`,
          language: "typescript",
          trust_signal: "verified",
        },
        {
          step_number: 3,
          title: "Synthesize the report",
          tools: [
            { slug: "anthropic-sdk-typescript", role: "Write the cited Markdown report", proposed_tool: false },
          ],
          rationale:
            "Sonnet handles 8 long sources comfortably in a single call. System prompt enforces the citation format so the output is paste-ready.",
          alternatives_considered: [],
          code: `const sources = docs.map((d, i) =>
  \`<source id="\${i+1}" url="\${d.url}">\\n\${d.md}\\n</source>\`).join("\\n\\n");

const r = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 4096,
  system: "Write a concise 1-page Markdown report on the user's topic. Cite sources as [N] linked at the bottom. Do not invent facts.",
  messages: [{ role: "user", content: \`Topic: \${query}\\n\\n\${sources}\` }],
});`,
          language: "typescript",
          trust_signal: "verified",
        },
      ],
      open_questions: [],
    },
  },

  // ---------------------------------------------------------------------------
  {
    slug: "stripe-customer-support-triage",
    title: "Stripe customer support triage in Slack",
    goal_description:
      "When a customer messages support, look up their Stripe data and post a triage card to Slack with refund/cancel suggestions.",
    category_tags: ["stripe", "slack", "support", "agent", "llm"],
    plan: {
      summary:
        "An incoming support email/webhook triggers a lookup of the customer in Stripe via the official MCP, runs a Claude triage, and posts a Slack card with a recommended action.",
      estimated_time_minutes: 90,
      estimated_monthly_cost_usd: 4,
      steps: [
        {
          step_number: 1,
          title: "Look up the customer + recent activity",
          tools: [
            { slug: "stripe-mcp", role: "Find customer by email; fetch subscriptions and recent charges", proposed_tool: false },
          ],
          rationale:
            "Stripe's official MCP exposes search-by-email and the subscription/charge history endpoints with idiomatic agent tool names — no need to wire the Stripe SDK directly for read-only triage.",
          alternatives_considered: [
            { name: "Stripe Node SDK directly", rejected_because: "More flexible, but you write the tool definitions yourself; not worth it for read-only lookups." },
          ],
          code: "",
          language: "",
          trust_signal: "verified",
        },
        {
          step_number: 2,
          title: "Triage with Claude",
          tools: [
            { slug: "anthropic-sdk-typescript", role: "Pick recommended action", proposed_tool: false },
          ],
          rationale:
            "Define a `recommend` tool with enums (refund, partial_refund, retry_payment, escalate, no_action) so the model commits to one action and a one-sentence justification.",
          alternatives_considered: [],
          code: `const RECOMMEND_TOOL = {
  name: "recommend",
  input_schema: {
    type: "object",
    required: ["action", "reason"],
    properties: {
      action: { type: "string", enum: ["refund", "partial_refund", "retry_payment", "escalate", "no_action"] },
      amount_cents: { type: "integer" },
      reason: { type: "string" },
    },
  },
} as const;`,
          language: "typescript",
          trust_signal: "verified",
        },
        {
          step_number: 3,
          title: "Post a triage card to Slack",
          tools: [
            { slug: "slack-mcp", role: "Send a Block-Kit message to #support", proposed_tool: false },
          ],
          rationale:
            "Block Kit gives you action buttons (Approve / Escalate) so a human stays in the loop. The MCP server takes the JSON blocks payload directly.",
          alternatives_considered: [
            { name: "Email digest", rejected_because: "Slow feedback loop; support agents already live in Slack." },
          ],
          code: "",
          language: "",
          trust_signal: "verified",
        },
      ],
      open_questions: [
        "Should the bot ever auto-execute refunds, or always require a human button-click? Default to human-in-the-loop until you trust the policy.",
      ],
    },
  },
];
