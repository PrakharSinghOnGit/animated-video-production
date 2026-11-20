/**
 * Watchable preview of one act: renders the act's piece of the video (src/lib/chunks.ts: its slice of the Main
 * composition, the same frames the draft and final use, transitions included) and muxes its window of 06-audio/mix.wav
 * (voice + foley); when the mix predates the current voice, the mastered voice alone. A piece already rendered for the
 * current state is reused, and a full-size preview (--scale 1, the default) is the very piece the final joins.
 * Output: 05-video/review/<act>/preview.mp4
 *
 * Usage: bun run preview --video <ID> --act A01 [--concurrency 6] [--scale 1|0.5|0.25] [--force]
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { resolveJobPaths } from "../src/lib/workspaceBridge";
import { recordTiming, formatDuration } from "../src/lib/timings";
import { currentMix } from "../src/lib/freshness";
import { keepAwake } from "../../lib/awake";
import { renderChunks, type Scale } from "../src/lib/chunks";
keepAwake();  // a long run: the Mac must not sleep mid-way (workflow/lib/awake.ts)

const args = process.argv.slice(2);
const flag = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const videoId = flag("--video") ?? flag("-v");
const actId = (flag("--act") ?? flag("--scene"))?.toUpperCase();
if (!videoId || !actId) {
  console.error("Usage: bun run preview --video <ID> --act A01 [--concurrency 6] [--scale 1]");
  process.exit(1);
}
const paths = resolveJobPaths(videoId);
const ws = path.dirname(paths.outputDir);
const timeline = JSON.parse(fs.readFileSync(path.join(paths.outputDir, "timeline.json"), "utf-8"));
const scene = timeline.scenes.find((s: any) => s.id.toUpperCase() === actId);
if (!scene) {
  console.error(`❌ ${actId} is not in timeline.json`);
  process.exit(1);
}
const outDir = path.join(paths.outputDir, "review", actId);
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, "preview.mp4");
// the sound mix only if it was built from the current voice, else the mastered voice alone (never an old voice)
const cm = currentMix(ws), master = path.join(ws, "06-audio", "voiceover_master.wav");
const mix = cm.file ?? master;
if (!cm.file) console.log(`(${cm.note}: preview plays the voice only)`);
const t0 = Date.now();
const run = (cmd: string, a: string[]) => {
  console.log(`$ ${cmd} ${a.join(" ")}`);
  const r = spawnSync(cmd, a, { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
const scale = (flag("--scale") ?? "1") as Scale;
if (!["1", "0.5", "0.25"].includes(scale)) { console.error("--scale must be 1, 0.5 or 0.25"); process.exit(1); }
// the transitions need the seam plan (the render plans it the same way): without it the piece would not match the final
let tl = timeline;
if (tl.scenes.length > 1 && !tl.scenes.some((s: any) => s.seams)) {
  run("bun", ["run", path.resolve(import.meta.dir, "seams.ts"), "--video", videoId, "--plan-only"]);
  tl = JSON.parse(fs.readFileSync(path.join(paths.outputDir, "timeline.json"), "utf-8"));
}
const plan = await renderChunks({ outputDir: paths.outputDir, timeline: tl, scale, only: [actId], force: args.includes("--force"), concurrency: Number(flag("--concurrency") ?? 6) });
const c = plan.find((x) => x.id === actId)!;
const startS = c.from / tl.fps, durS = (c.to - c.from) / tl.fps;
if (fs.existsSync(mix)) {
  run("ffmpeg", ["-y", "-v", "error", "-i", c.file, "-ss", startS.toFixed(3), "-t", durS.toFixed(3), "-i", mix,
    "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-af", "apad", "-shortest", out]);
} else {
  console.log("(no mastered voice yet: preview has no sound; run Align)");
  fs.copyFileSync(c.file, out);
}
const ms = Date.now() - t0;
recordTiming(ws, { step: `preview ${actId}`, ms });
console.log(`✅ ${path.relative(process.cwd(), out)} (${durS.toFixed(1)} s) in ${formatDuration(ms)}`);
