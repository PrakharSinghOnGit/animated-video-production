/**
 * Review frames for one scene/act. One dense pass renders the whole act every 0.1 s in parallel (renderFrames, --gl=angle):
 * ~10x the frames of one still per beat in about the same time. From that pass come:
 *   - t_<sec>.jpg   the review stills (every --every s, the settled first/last picture, hit words, every flagged moment)
 *   - sheet.jpg     the contact sheet: those stills tiled, flagged tiles outlined in red with the finding's number
 *   - grid_NN.jpg   motion grids: 12 consecutive frames per image (every 0.5 s), the spoken words under each tile;
 *                   the whole act at a glance for the critic, the reviewer and you
 *   - checks.json   deterministic checks on every dense frame (act_checks.py: pop-in/out, blanks, freezes, cuts, clipped,
 *                   overlapping and low-contrast text, late hits, an unsettled ending, seam flags)
 *   - layout.json, layout_summary.json, measure.json   the layout report on the stills (contact_sheet.py), as before
 *
 * Usage: bun run frames --video <ID> --scene A01 [--every 3] [--at 1.5,4,9.2] [--scale 0.5] [--words] [--only]
 *   --every <s>   one review still every s seconds (default 3)
 *   --at <list>   extra stills at these times (act-relative)
 *   --words       also a still at the start of every hit word listed in acts.json for this act (rounded up to the dense
 *                 step: the frame at or just after the word, where the hit must be complete)
 *   --only        render just the --at times as single stills and keep the frames already there (no dense pass, no checks)
 *   --step <s>    dense step (default 0.1 s); --grid-step <s> time between motion-grid tiles (default 0.5)
 *   --concurrency N   Chrome tabs for the dense pass (default: half the cores)
 *   --keep-dense  keep review/<scene>/dense/ (every dense frame, ~40 KB each); deleted by default once used
 *   --out <dir>   write everything there instead of review/<scene>/ (to review a variant without touching the act's review)
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { bundle } from "@remotion/bundler";
import { renderFrames, renderStill, selectComposition } from "@remotion/renderer";
import { resolveJobPaths } from "../src/lib/workspaceBridge";
import { findWord, type ActsPlan } from "../src/lib/acts";
import { recordTiming, formatDuration } from "../src/lib/timings";
import { keepAwake } from "../../lib/awake";
keepAwake();  // a long run: the Mac must not sleep mid-way (workflow/lib/awake.ts)

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
  console.error("Usage: bun run frames --video <ID> --scene <A01> [--every 3] [--at 1.5,4] [--scale 0.5] [--words] [--only]");
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
const r2 = (t: number) => Math.round(t * 100) / 100;

const only = args.includes("--only");
if (only && !extra.length) { console.error("❌ --only needs --at <times>"); process.exit(1); }
// dense step in frames (0.1 s at 30 fps)
const nth = Math.max(1, Math.round(parseFloat(flag("--step") ?? "0.1") * fps));
const snap = (t: number, up = false) => {
  const k = t * fps / nth;
  return r2((up ? Math.ceil(k - 1e-6) : Math.round(k)) * nth / fps);
};

const times = new Set<number>();
if (!only) for (let t = 0; t < durSec; t += every) times.add(snap(t));
if (!only) times.add(snap(durSec - 1 / fps - nth / fps / 2));
// the settled first and last picture (after the whip-in, before the whip-out): what the neighbouring acts meet
if (!only && durSec > 6) { times.add(snap(1.2)); times.add(snap(durSec - 1.2)); }
for (const t of extra) if (t >= 0 && t < durSec) times.add(only ? t : snap(t));
// Only the Ledger style reserves a subtitle band; Briefing has none (impact text only)
const planFile = path.join(paths.outputDir, "acts.json");
const plan: ActsPlan | null = fs.existsSync(planFile) ? JSON.parse(fs.readFileSync(planFile, "utf-8")) : null;
const subtitles = !plan || ((plan as any).style ?? "briefing") === "ledger";
const windowStartMs = (scene.windowStartFrame / fps) * 1000;
const captionsFile = path.join(paths.outputDir, "captions.json");
const captions: { text: string; startMs: number; endMs: number }[] = fs.existsSync(captionsFile) ? JSON.parse(fs.readFileSync(captionsFile, "utf-8")) : [];
// the act's spoken words (act time) with the hit words marked: under the motion-grid tiles and for the hit checks
const hitStarts = new Set<number>();
const act = plan?.acts.find((a) => a.id.toUpperCase() === sceneId);
for (const b of act?.beats ?? []) for (const h of b.hits ?? []) {
  const w = findWord(captions as any, h.word, h.occurrence ?? 1, b.startMs, b.endMs);
  if (w) hitStarts.add(w.startMs);
}
const spoken = captions
  .filter((w) => w.startMs >= windowStartMs - 50 && w.startMs < windowStartMs + durSec * 1000)
  .map((w) => ({ t: r2((w.startMs - windowStartMs) / 1000), text: w.text.trim(), hit: hitStarts.has(w.startMs) }));
if (args.includes("--words") && !only)
  // the hit should be complete when the word starts: the dense frame at or just after the word start
  for (const w of spoken) if (w.hit) times.add(snap(w.t, true));

const entry = path.join(paths.outputDir, "src", "index.ts");
const publicDir = path.join(paths.outputDir, "public");
const outDir = flag("--out") ? path.resolve(flag("--out")!) : path.join(paths.outputDir, "review", sceneId);
fs.mkdirSync(outDir, { recursive: true });
if (!only) for (const f of fs.readdirSync(outDir)) if (/^(t_.*|grid_\d+)\.jpg$/.test(f)) fs.unlinkSync(path.join(outDir, f));

console.log(`📦 Bundling ${path.relative(process.cwd(), entry)}...`);
const serveUrl = await bundle({ entryPoint: entry, publicDir: fs.existsSync(publicDir) ? publicDir : undefined });
// wgMeasure: the kit reports the on-screen size, box and colour of every text, figure and logo it draws (packages/kit/src/paper/measure.ts)
const inputProps = { wgMeasure: true };
// angle: GPU canvas; without it canvas rendering is many times slower (CLAUDE.md)
const chromiumOptions = { gl: "angle" as const };
const composition = await selectComposition({ serveUrl, id: sceneId, inputProps, chromiumOptions });
type Measured = { frame: number; items: unknown[] };
const parseMeasure = (text: string): Measured | null => {
  const m = /WGMEASURE (\{.*\})/.exec(text);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
};
const measured: { t: number; w: number; h: number; items: unknown[] }[] = [];
const python = process.env.WG_PYTHON ?? path.resolve(process.cwd(), ".venv/bin/python");
const vertical = timeline.height > timeline.width;
const tName = (t: number) => `t_${t.toFixed(2).padStart(6, "0")}.jpg`;
let checksOut = "", denseCount = 0;

if (only) {
  console.log(`🖼  ${times.size} stills of ${sceneId} at ${scale}× ...`);
  for (const t of [...times].sort((a, b) => a - b)) {
    const frame = Math.min(composition.durationInFrames - 1, Math.round(t * fps));
    let items: unknown[] = [];
    const onBrowserLog = (l: { text: string }) => { const m = parseMeasure(l.text); if (m) items = m.items; };
    await renderStill({ serveUrl, composition, frame, output: path.join(outDir, tName(t)), imageFormat: "jpeg", jpegQuality: 85, scale, logLevel: "error", inputProps, onBrowserLog, chromiumOptions });
    measured.push({ t, w: timeline.width, h: timeline.height, items });
  }
} else {
  // 1. the dense pass: every nth frame of the whole act, in parallel
  const denseDir = path.join(outDir, "dense");
  fs.rmSync(denseDir, { recursive: true, force: true });
  fs.mkdirSync(denseDir, { recursive: true });
  const concurrency = Number(flag("--concurrency") ?? Math.max(2, Math.floor(os.cpus().length / 2)));
  const byFrame = new Map<number, unknown[]>();
  console.log(`🎞  Dense pass: ${sceneId} (${durSec.toFixed(1)} s) every ${(nth / fps).toFixed(2)} s at ${scale}×, ${concurrency} tabs...`);
  const td = Date.now();
  await renderFrames({
    serveUrl, composition, inputProps, outputDir: denseDir, imageFormat: "jpeg", jpegQuality: 85, scale, everyNthFrame: nth,
    concurrency, chromiumOptions, logLevel: "error", onStart: () => {}, onFrameUpdate: () => {},
    onBrowserLog: (l) => { const m = parseMeasure(l.text); if (m) byFrame.set(m.frame, m.items); },
  });
  // renderFrames numbers its files 0, 1, 2 ... in render order: file k is frame k * nth
  const raw = fs.readdirSync(denseDir).filter((f) => /^element-\d+\.jpe?g$/.test(f)).sort((a, b) => parseInt(a.slice(8)) - parseInt(b.slice(8)));
  for (const f of raw) fs.renameSync(path.join(denseDir, f), path.join(denseDir, `d_${String(parseInt(f.slice(8)) * nth).padStart(6, "0")}.jpg`));
  denseCount = raw.length;
  const dense = (frame: number) => path.join(denseDir, `d_${String(frame).padStart(6, "0")}.jpg`);
  console.log(`   ${denseCount} frames in ${formatDuration(Date.now() - td)}`);
  const denseMeasure = path.join(denseDir, "measure.json");
  fs.writeFileSync(denseMeasure, JSON.stringify([...byFrame].map(([frame, items]) => ({ frame, items }))));
  const wordsFile = path.join(denseDir, "words.json");
  fs.writeFileSync(wordsFile, JSON.stringify(spoken));

  // 2. deterministic checks on every dense frame + the motion grids
  const seamsReport = path.join(paths.outputDir, "review", "seams", "report.json");
  try {
    checksOut = execFileSync(python, [path.join(import.meta.dir, "act_checks.py"), "--dense", denseDir, "--fps", String(fps), "--nth", String(nth),
      "--dur", durSec.toFixed(3), "--out", outDir, "--measure", denseMeasure, "--words", wordsFile, "--seams", seamsReport, "--act", sceneId,
      "--grid-step", flag("--grid-step") ?? "0.5", ...(vertical ? ["--vertical"] : [])], { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e: any) {
    checksOut = `checks: failed (${String(e.stderr || e.message).trim().split("\n").slice(-1)[0]})\n`;
  }
  // every flagged moment gets a still on the contact sheet
  try {
    const checks = JSON.parse(fs.readFileSync(path.join(outDir, "checks.json"), "utf-8"));
    for (const f of checks.findings ?? []) if (f.severity !== "low" && f.t >= 0 && f.t < durSec) times.add(snap(f.t));
  } catch {}

  // 3. the review stills are copies of the dense frames at those times
  for (const t of [...times].sort((a, b) => a - b)) {
    const frame = Math.min(Math.round(t * fps / nth) * nth, (denseCount - 1) * nth);
    if (!fs.existsSync(dense(frame))) continue;
    const tt = r2(frame / fps);
    fs.copyFileSync(dense(frame), path.join(outDir, tName(tt)));
    if (!measured.some((m) => m.t === tt)) measured.push({ t: tt, w: timeline.width, h: timeline.height, items: byFrame.get(frame) ?? [] });
  }
  if (!args.includes("--keep-dense")) fs.rmSync(denseDir, { recursive: true, force: true });
}

// the sheet and the layout report cover every still in the folder (--only keeps the earlier ones)
const files = fs.readdirSync(outDir).filter((f) => /^t_[\d.]+\.jpg$/.test(f)).sort().map((f) => path.join(outDir, f));

// on-screen sizes: --only keeps the earlier frames' measurements and replaces the re-rendered times
const measureFile = path.join(outDir, "measure.json");
let allMeasured = measured.sort((a, b) => a.t - b.t);
if (only && fs.existsSync(measureFile)) {
  try {
    const old: typeof measured = JSON.parse(fs.readFileSync(measureFile, "utf-8"));
    allMeasured = [...old.filter((o) => !measured.some((m) => m.t === o.t)), ...measured].sort((a, b) => a.t - b.t);
  } catch {}
}
fs.writeFileSync(measureFile, JSON.stringify(allMeasured));

// Contact sheet, 4 columns, each tile labelled with its time, flagged tiles marked (Pillow: Homebrew ffmpeg lacks drawtext)
const sheet = path.join(outDir, "sheet.jpg");
// 9:16 shorts: narrower tiles, more columns, the Shorts safe area for the layout report
const cols = vertical ? 6 : 4;
const checksFile = path.join(outDir, "checks.json");
const layoutOut = execFileSync(
  python,
  [path.join(import.meta.dir, "contact_sheet.py"), sheet, ...files, "--cols", String(cols), "--w", vertical ? "300" : "480", "--report", path.join(outDir, "layout.json"), "--measure", measureFile, "--dur", durSec.toFixed(2),
    ...(fs.existsSync(checksFile) ? ["--flags", checksFile] : []), ...(subtitles ? [] : ["--no-band"]), ...(vertical ? ["--vertical"] : [])],
  { encoding: "utf-8" }
);
process.stdout.write(layoutOut);
process.stdout.write(checksOut);
const rows = Math.ceil(files.length / cols);

const ms = Date.now() - t0;
recordTiming(wsDir, { step: `frames ${sceneId} (${files.length}${denseCount ? `, ${denseCount} dense` : ""})`, ms });
const grids = fs.readdirSync(outDir).filter((f) => /^grid_\d+\.jpg$/.test(f)).length;
console.log(`✅ ${files.length} frames + ${path.relative(process.cwd(), sheet)} (${rows} rows)${grids ? ` + ${grids} motion grids (review/${sceneId}/grid_*.jpg)` : ""} in ${formatDuration(ms)}`);
