/**
 * Watchable preview of one act: renders the act (GPU canvas) and muxes its window of 06-audio/mix.wav
 * (voice + foley) so it can be reviewed with sound; when the mix predates the current voice, the mastered voice alone. Output: 05-video/review/<act>/preview.mp4
 *
 * Usage: bun run preview --video <ID> --act A01 [--concurrency 6] [--scale 1]
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { resolveJobPaths } from "../src/lib/workspaceBridge";
import { recordTiming, formatDuration } from "../src/lib/timings";
import { currentMix } from "../src/lib/freshness";
import { keepAwake } from "../../lib/awake";
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
const startS = scene.windowStartFrame / timeline.fps, durS = scene.durationFrames / timeline.fps;
const outDir = path.join(paths.outputDir, "review", actId);
fs.mkdirSync(outDir, { recursive: true });
const silent = path.join(outDir, "preview.silent.mp4"), out = path.join(outDir, "preview.mp4");
// the sound mix only if it was built from the current voice, else the mastered voice alone (never an old voice)
const cm = currentMix(ws), master = path.join(ws, "06-audio", "voiceover_master.wav");
const mix = cm.file ?? master;
if (!cm.file) console.log(`(${cm.note}: preview plays the voice only)`);
const t0 = Date.now();

const run = (cmd: string, a: string[], cwd?: string) => {
  console.log(`$ ${cmd} ${a.join(" ")}`);
  const r = spawnSync(cmd, a, { cwd, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
const studioDir = path.resolve(import.meta.dir, "..");
run("bunx", ["remotion", "render", path.join(paths.outputDir, "src", "index.ts"), actId, silent,
  `--public-dir=${ws}`, `--concurrency=${flag("--concurrency") ?? "6"}`, `--scale=${flag("--scale") ?? "1"}`, "--gl=angle", "--log=error"], studioDir);
if (fs.existsSync(mix)) {
  run("ffmpeg", ["-y", "-v", "error", "-i", silent, "-ss", startS.toFixed(3), "-t", durS.toFixed(3), "-i", mix,
    "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", out]);
  fs.rmSync(silent);
} else {
  console.log("(no mastered voice yet: preview has no sound; run Align)");
  fs.renameSync(silent, out);
}
const ms = Date.now() - t0;
recordTiming(ws, { step: `preview ${actId}`, ms });
console.log(`✅ ${path.relative(process.cwd(), out)} (${durS.toFixed(1)} s) in ${formatDuration(ms)}`);
