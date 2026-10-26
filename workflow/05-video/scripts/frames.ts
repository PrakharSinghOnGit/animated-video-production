/**
 * Review frames for one scene/act: bundles once, renders many stills, tiles a contact sheet.
 * Much faster than one `remotion still` per frame (no re-bundling).
 *
 * Usage: bun run frames --video <ID> --scene A01 [--every 3] [--at 1.5,4,9.2] [--scale 0.5] [--words]
 *   --every <s>   one frame every s seconds across the act (default 3)
 *   --at <list>   extra times in seconds (act-relative)
 *   --words       also one frame at the start of every hit word listed in acts.json for this act
 * Output: <ws>/05-video/review/<scene>/t_<sec>.jpg and sheet.jpg (labelled with the time)
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { resolveJobPaths } from "../src/lib/workspaceBridge";
import { findWord, type ActsPlan } from "../src/lib/acts";
import { recordTiming, formatDuration } from "../src/lib/timings";

const args = process.argv.slice(2);
const flag = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const videoId = flag("--video") ?? flag("-v");
const sceneId = (flag("--scene") ?? flag("-s"))?.toUpperCase();
const every = parseFloat(flag("--every") ?? "3");
const scale = parseFloat(flag("--scale") ?? "0.5");
const extra = (flag("--at") ?? "").split(",").map((s) => parseFloat(s)).filter((n) => !Number.isNaN(n));
if (!videoId || !sceneId) {
  console.error("Usage: bun run frames --video <ID> --scene <A01> [--every 3] [--at 1.5,4] [--scale 0.5] [--words]");
  process.exit(1);
}

const t0 = Date.now();
const paths = resolveJobPaths(videoId);
const wsDir = path.dirname(paths.outputDir);
const timeline = JSON.parse(fs.readFileSync(path.join(paths.outputDir, "timeline.json"), "utf-8"));
const scene = timeline.scenes.find((s: any) => s.id.toUpperCase() === sceneId);
if (!scene) {
  console.error(`❌ ${sceneId} is not in timeline.json`);
  process.exit(1);
}
const fps: number = timeline.fps;
const durSec = scene.durationFrames / fps;

const times = new Set<number>();
for (let t = 0; t < durSec; t += every) times.add(Math.round(t * 100) / 100);
times.add(Math.round((durSec - 1 / fps) * 100) / 100);
for (const t of extra) if (t >= 0 && t < durSec) times.add(t);
if (args.includes("--words")) {
  const actsFile = path.join(paths.outputDir, "acts.json");
  if (fs.existsSync(actsFile)) {
    const plan: ActsPlan = JSON.parse(fs.readFileSync(actsFile, "utf-8"));
    const captions = JSON.parse(fs.readFileSync(path.join(paths.outputDir, "captions.json"), "utf-8"));
    const act = plan.acts.find((a) => a.id.toUpperCase() === sceneId);
    const windowStartMs = (scene.windowStartFrame / fps) * 1000;
    for (const b of act?.beats ?? []) for (const h of b.hits ?? []) {
      const w = findWord(captions, h.word, h.occurrence ?? 1, b.startMs, b.endMs);
      // the hit should be complete when the word starts: show the word start and just after
      if (w) times.add(Math.round((w.startMs - windowStartMs) / 10) / 100);
    }
  }
}
const sorted = [...times].filter((t) => t >= 0 && t < durSec).sort((a, b) => a - b);

const entry = path.join(paths.outputDir, "src", "index.ts");
const publicDir = path.join(paths.outputDir, "public");
const outDir = path.join(paths.outputDir, "review", sceneId);
fs.mkdirSync(outDir, { recursive: true });
for (const f of fs.readdirSync(outDir)) if (/^t_.*\.jpg$/.test(f)) fs.unlinkSync(path.join(outDir, f));

console.log(`📦 Bundling ${path.relative(process.cwd(), entry)}...`);
const serveUrl = await bundle({ entryPoint: entry, publicDir: fs.existsSync(publicDir) ? publicDir : undefined });
const composition = await selectComposition({ serveUrl, id: sceneId, inputProps: {} });

console.log(`🖼  ${sorted.length} frames of ${sceneId} (${durSec.toFixed(1)} s) at ${scale}× ...`);
const files: string[] = [];
for (const t of sorted) {
  const frame = Math.min(composition.durationInFrames - 1, Math.round(t * fps));
  const file = path.join(outDir, `t_${t.toFixed(2).padStart(6, "0")}.jpg`);
  await renderStill({ serveUrl, composition, frame, output: file, imageFormat: "jpeg", jpegQuality: 85, scale, logLevel: "error" });
  files.push(file);
}

// Contact sheet, 4 columns, each tile labelled with its time (Pillow: Homebrew ffmpeg lacks drawtext)
const sheet = path.join(outDir, "sheet.jpg");
const python = process.env.WG_PYTHON ?? path.resolve(process.cwd(), ".venv/bin/python");
const layoutOut = execFileSync(
  python,
  [path.join(import.meta.dir, "contact_sheet.py"), sheet, ...files, "--cols", "4", "--w", "480", "--report", path.join(outDir, "layout.json"), "--dur", durSec.toFixed(2)],
  { encoding: "utf-8" }
);
process.stdout.write(layoutOut);
const rows = Math.ceil(files.length / 4);

const ms = Date.now() - t0;
recordTiming(wsDir, { step: `frames ${sceneId} (${files.length})`, ms });
console.log(`✅ ${files.length} frames + ${path.relative(process.cwd(), sheet)} (${rows} rows) in ${formatDuration(ms)}`);
