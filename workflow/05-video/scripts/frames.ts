/**
 * Review frames for one scene/act: bundles once, renders many stills, tiles a contact sheet.
 * Much faster than one `remotion still` per frame (no re-bundling).
 *
 * Usage: bun run frames --video <ID> --scene A01 [--every 3] [--at 1.5,4,9.2] [--scale 0.5] [--words]
 *   --every <s>   one frame every s seconds across the act (default 3)
 *   --at <list>   extra times in seconds (act-relative)
 *   --only        render just the --at times and keep the frames already there (the sheet shows all of them)
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

const only = args.includes("--only");
if (only && !extra.length) { console.error("❌ --only needs --at <times>"); process.exit(1); }
const times = new Set<number>();
if (!only) for (let t = 0; t < durSec; t += every) times.add(Math.round(t * 100) / 100);
if (!only) times.add(Math.round((durSec - 1 / fps) * 100) / 100);
// the settled first and last picture (after the whip-in, before the whip-out): what the neighbouring acts meet
if (!only && durSec > 6) { times.add(1.2); times.add(Math.round((durSec - 1.2) * 100) / 100); }
for (const t of extra) if (t >= 0 && t < durSec) times.add(t);
// Only the Ledger style reserves a subtitle band; Briefing has none (impact text only)
const planFile = path.join(paths.outputDir, "acts.json");
const subtitles = !fs.existsSync(planFile) || (JSON.parse(fs.readFileSync(planFile, "utf-8")).style ?? "briefing") === "ledger";
if (args.includes("--words") && !only) {
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
if (!only) for (const f of fs.readdirSync(outDir)) if (/^t_.*\.jpg$/.test(f)) fs.unlinkSync(path.join(outDir, f));

console.log(`📦 Bundling ${path.relative(process.cwd(), entry)}...`);
const serveUrl = await bundle({ entryPoint: entry, publicDir: fs.existsSync(publicDir) ? publicDir : undefined });
// wgMeasure: the kit reports the on-screen size of every text, figure and logo it draws (packages/kit/src/paper/measure.ts)
const inputProps = { wgMeasure: true };
const composition = await selectComposition({ serveUrl, id: sceneId, inputProps });
const measured: { t: number; w: number; h: number; items: unknown[] }[] = [];

console.log(`🖼  ${sorted.length} frames of ${sceneId} (${durSec.toFixed(1)} s) at ${scale}× ...`);
const files: string[] = [];
for (const t of sorted) {
  const frame = Math.min(composition.durationInFrames - 1, Math.round(t * fps));
  const file = path.join(outDir, `t_${t.toFixed(2).padStart(6, "0")}.jpg`);
  let items: unknown[] = [];
  const onBrowserLog = (l: { text: string }) => { const m = /WGMEASURE (\{.*\})/.exec(l.text); if (m) { try { items = JSON.parse(m[1]).items; } catch {} } };
  await renderStill({ serveUrl, composition, frame, output: file, imageFormat: "jpeg", jpegQuality: 85, scale, logLevel: "error", inputProps, onBrowserLog });
  measured.push({ t, w: timeline.width, h: timeline.height, items });
  files.push(file);
}
// --only: the sheet and the layout report cover every frame in the folder, old and new
if (only) files.splice(0, files.length, ...fs.readdirSync(outDir).filter((f) => /^t_[\d.]+\.jpg$/.test(f)).sort().map((f) => path.join(outDir, f)));

// on-screen sizes: --only keeps the earlier frames' measurements and replaces the re-rendered times
const measureFile = path.join(outDir, "measure.json");
let allMeasured = measured;
if (only && fs.existsSync(measureFile)) {
  try {
    const old: typeof measured = JSON.parse(fs.readFileSync(measureFile, "utf-8"));
    allMeasured = [...old.filter((o) => !measured.some((m) => m.t === o.t)), ...measured].sort((a, b) => a.t - b.t);
  } catch {}
}
fs.writeFileSync(measureFile, JSON.stringify(allMeasured));

// Contact sheet, 4 columns, each tile labelled with its time (Pillow: Homebrew ffmpeg lacks drawtext)
const sheet = path.join(outDir, "sheet.jpg");
const python = process.env.WG_PYTHON ?? path.resolve(process.cwd(), ".venv/bin/python");
// 9:16 shorts: narrower tiles, more columns, the Shorts safe area for the layout report
const vertical = timeline.height > timeline.width, cols = vertical ? 6 : 4;
const layoutOut = execFileSync(
  python,
  [path.join(import.meta.dir, "contact_sheet.py"), sheet, ...files, "--cols", String(cols), "--w", vertical ? "300" : "480", "--report", path.join(outDir, "layout.json"), "--measure", measureFile, "--dur", durSec.toFixed(2), ...(subtitles ? [] : ["--no-band"]), ...(vertical ? ["--vertical"] : [])],
  { encoding: "utf-8" }
);
process.stdout.write(layoutOut);
const rows = Math.ceil(files.length / cols);

const ms = Date.now() - t0;
recordTiming(wsDir, { step: `frames ${sceneId} (${files.length})`, ms });
console.log(`✅ ${files.length} frames + ${path.relative(process.cwd(), sheet)} (${rows} rows) in ${formatDuration(ms)}`);
