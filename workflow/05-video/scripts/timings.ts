/**
 * Print how long each step of a video took, and what the agent steps cost.
 * Usage: bun run timings --video <ID>
 */
import path from "node:path";
import { readTimings, formatDuration } from "../src/lib/timings";

const args = process.argv.slice(2);
const vi = args.findIndex((a) => a === "--video" || a === "-v");
const videoId = vi >= 0 ? args[vi + 1] : args.find((a) => !a.startsWith("-"));
if (!videoId) {
  console.error("Usage: bun run timings --video <ID>");
  process.exit(1);
}

const wsDir = path.resolve(process.cwd(), "workspace", videoId);
const rows = readTimings(wsDir);
if (rows.length === 0) {
  console.log(`No timings recorded yet for ${videoId}.`);
  process.exit(0);
}

const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length));
console.log(`\n${pad("step", 34)} ${pad("time", 9)} ${pad("model", 8)} ${pad("tokens in/out", 16)} cost`);
let totalMs = 0;
let totalCost = 0;
for (const r of rows) {
  totalMs += r.ms;
  totalCost += r.costUsd ?? 0;
  const tok = r.inputTokens || r.outputTokens ? `${Math.round((r.inputTokens ?? 0) / 1000)}k/${Math.round((r.outputTokens ?? 0) / 1000)}k` : "";
  const cost = r.costUsd ? `$${r.costUsd.toFixed(2)}` : "";
  console.log(`${pad(r.step, 34)} ${pad(formatDuration(r.ms), 9)} ${pad(r.model ?? "", 8)} ${pad(tok, 16)} ${cost}`);
}
console.log(`${pad("TOTAL", 34)} ${pad(formatDuration(totalMs), 9)} ${pad("", 8)} ${pad("", 16)} ${totalCost ? `$${totalCost.toFixed(2)}` : ""}\n`);
