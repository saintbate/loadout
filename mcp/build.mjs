/**
 * Bundles mcp/server.ts into a single self-contained dist/server.js.
 *
 * Why esbuild instead of tsc?
 *  - Bundles @modelcontextprotocol/sdk so users don't need to install it.
 *  - Injects the #!/usr/bin/env node shebang that tsc would strip.
 *  - Fast enough to run on every `npm publish` via prepublishOnly.
 */
import * as esbuild from "esbuild";
import { chmod } from "node:fs/promises";

await esbuild.build({
  entryPoints: ["server.ts"],
  bundle: true,
  platform: "node",
  target: "node18",
  format: "esm",
  outfile: "dist/server.js",
  // esbuild automatically lifts the #!/usr/bin/env node shebang from server.ts
  // to the top of the bundle — no explicit banner needed.
  // node: built-ins are already available at runtime; don't bundle them.
  external: ["node:*"],
  // Keep the output readable (small enough that it doesn't matter).
  minify: false,
});

// Make the output executable so `npx` and direct invocation both work.
await chmod("dist/server.js", 0o755);

console.log("build ok → dist/server.js");
