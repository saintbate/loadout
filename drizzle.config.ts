import { defineConfig } from "drizzle-kit";
import { config as loadEnv } from "dotenv";

// Match Next.js precedence: .env.local overrides .env.
loadEnv({ path: ".env.local", override: false });
loadEnv({ path: ".env" });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

export default defineConfig({
  schema: "./db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  // strict prompts for confirmation on every push; off so npm run db:push is non-interactive.
  strict: false,
  verbose: true,
});
