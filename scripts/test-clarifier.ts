// Quick smoke test for the clarifier. Run with `npx tsx scripts/test-clarifier.ts`.
import { checkForClarification } from "@/lib/clarifier";

async function main() {
  const goals = [
    "Build a Slack bot that summarizes my unread DMs every morning",
    "Help me build something with AI agents",
    "Daily summary of my GitHub commits emailed to me",
  ];
  for (const g of goals) {
    console.log(`\n=== ${g}`);
    const r = await checkForClarification(g);
    console.log(JSON.stringify(r, null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
