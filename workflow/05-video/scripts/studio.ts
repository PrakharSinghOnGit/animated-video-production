/**
 * Open Remotion Studio (the browser dashboard) on a video's workspace: the full video ("Main")
 * and one composition per act. Without --video, opens the Ledger engine preview instead.
 *
 * Usage: bun run studio --video <ID>   |   bun run studio
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const vi = args.findIndex((a) => a === "--video" || a === "-v");
const video = vi >= 0 ? args[vi + 1] : undefined;

let entry: string;
const extra: string[] = [];
if (video) {
  const out = path.resolve(process.cwd(), "workspace", video, "05-video");
  entry = path.join(out, "src", "index.ts");
  if (!fs.existsSync(entry)) {
    console.error(`❌ ${entry} not found. Run "bun run assemble --video ${video}" first.`);
    process.exit(1);
  }
  const pub = path.join(out, "public");
  if (fs.existsSync(pub)) extra.push(`--public-dir=${pub}`);
} else {
  entry = path.resolve(process.cwd(), "packages/kit/src/paper/preview/Root.tsx");
}
console.log(`🎛  Remotion Studio: ${path.relative(process.cwd(), entry)} (Ctrl+C to stop)`);
spawn("bunx", ["remotion", "studio", entry, ...extra], { stdio: "inherit" }).on("close", (c) => process.exit(c ?? 0));
