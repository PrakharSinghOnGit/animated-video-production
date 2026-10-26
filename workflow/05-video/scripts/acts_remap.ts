/**
 * Re-time acts.json after the narration timing changed (e.g. longer pauses) but the words
 * did not: every time is moved with the word it belongs to, so the plan needs no re-direction.
 *
 * Usage: bun run acts:remap --video <ID> --from <old captions.json>
 */
import fs from "node:fs";
import path from "node:path";
import { resolveJobPaths } from "../src/lib/workspaceBridge";
import { actsToStoryboard, checkActs, type ActsPlan, type Caption } from "../src/lib/acts";

const args = process.argv.slice(2);
const flag = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const video = flag("--video");
const from = flag("--from");
if (!video || !from) {
  console.error("Usage: bun run acts:remap --video <ID> --from <old captions.json>");
  process.exit(1);
}
const paths = resolveJobPaths(video);
const oldC: Caption[] = JSON.parse(fs.readFileSync(from, "utf-8"));
const newC: Caption[] = JSON.parse(fs.readFileSync(path.join(paths.outputDir, "captions.json"), "utf-8"));
if (oldC.length !== newC.length) {
  console.error(`❌ word count changed (${oldC.length} → ${newC.length}); the narration text differs, re-run "bun run direct".`);
  process.exit(1);
}

// t → the same moment relative to the word it falls in (or the gap after it)
function remap(t: number): number {
  let i = 0;
  while (i + 1 < oldC.length && oldC[i + 1].startMs <= t) i++;
  if (t < oldC[0].startMs) return t;
  const offset = t - oldC[i].startMs;
  const room = i + 1 < oldC.length ? newC[i + 1].startMs - newC[i].startMs : Infinity;
  return Math.round(newC[i].startMs + Math.min(offset, room));
}

const file = path.join(paths.outputDir, "acts.json");
const plan: ActsPlan = JSON.parse(fs.readFileSync(file, "utf-8"));
fs.copyFileSync(file, file.replace(/\.json$/, ".before-remap.json"));
const lastEnd = newC[newC.length - 1].endMs;
plan.acts.forEach((a, ai) => {
  a.startMs = ai === 0 ? a.startMs : remap(a.startMs);
  for (const b of a.beats) {
    b.startMs = remap(b.startMs);
    b.endMs = remap(b.endMs);
  }
});
// keep acts and beats tiling exactly
plan.acts.forEach((a, ai) => {
  a.endMs = ai < plan.acts.length - 1 ? plan.acts[ai + 1].startMs : Math.max(lastEnd, remap(a.endMs));
  a.beats.forEach((b, bi) => {
    if (bi === 0) b.startMs = a.startMs;
    b.endMs = bi < a.beats.length - 1 ? a.beats[bi + 1].startMs : a.endMs;
  });
});
fs.writeFileSync(file, JSON.stringify(plan, null, 2), "utf-8");
fs.writeFileSync(path.join(paths.outputDir, "storyboard.json"), JSON.stringify(actsToStoryboard(plan), null, 2), "utf-8");
const errs = checkActs(plan, newC);
console.log(`✅ re-timed ${plan.acts.length} acts (${errs.length ? errs.length + " check problem(s)" : "checks pass"})`);
for (const e of errs) console.log("   - " + e);
