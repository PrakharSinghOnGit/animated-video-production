/**
 * Seams between acts: one owner per seam, the neighbours' real frames, and a check of every cut.
 *
 * Usage: bun run seams --video <ID> [--check-only]
 *
 * 1. Probe: renders each act's first and last frame with transitions off (public/seams/<ACT>_first.jpg, _last.jpg) and
 *    reads what the act asked for (open / close / ground) from its drawAct.
 * 2. Plan, per seam between A and B (written into timeline.json scenes[].seams and 05-video/seams.json):
 *      B opens with a wipe (iris, strips, pixels, scan, flood)  -> B owns it: wipes from A's last frame; A just ends
 *      else A closes with a wipe                                 -> A owns it: wipes into B's first frame; B just starts
 *      else a whip on either side                                -> one pan split across both (each does half, the
 *                                                                   neighbour's frame rides beside), or all of it on the
 *                                                                   side that can whip (Drafting can't)
 *      else                                                      -> a straight cut
 *    So the two acts never both transition (that was the A -> B -> A flicker) and nothing vanishes into a flat colour.
 * 3. Check: renders the full video's frames around each cut (cut-2 .. cut+1), measures how much the picture changes
 *    frame to frame, and flags flicker (jumps away and back) and hard jumps. Report: review/seams/report.json + a strip
 *    per seam (review/seams/<A>-<B>.jpg). Dashboard: Render → Seams.
 * Acts are not edited; re-run after any act changes (the draft/final chains run it after Assemble).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { resolveJobPaths } from "../src/lib/workspaceBridge";
import { recordTiming, formatDuration } from "../src/lib/timings";

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const videoId = flag("--video") ?? flag("-v");
if (!videoId) { console.error("Usage: bun run seams --video <ID> [--check-only]"); process.exit(1); }
const checkOnly = args.includes("--check-only");
const t0 = Date.now();
const paths = resolveJobPaths(videoId);
const out = paths.outputDir;
const tlPath = path.join(out, "timeline.json");
if (!fs.existsSync(tlPath)) { console.error(`❌ no timeline.json in ${out}: run Assemble first`); process.exit(1); }
const timeline = JSON.parse(fs.readFileSync(tlPath, "utf-8"));
const scenes: any[] = [...timeline.scenes].sort((a, b) => a.windowStartFrame - b.windowStartFrame);
const fps: number = timeline.fps;
const entry = path.join(out, "src", "index.ts");
const publicDir = path.join(out, "public");
const seamDir = path.join(publicDir, "seams");
const reviewDir = path.join(out, "review", "seams");
fs.mkdirSync(seamDir, { recursive: true });
fs.mkdirSync(reviewDir, { recursive: true });

type Ask = { style: string; open: string; close: string; ground: string };
type Side = { kind: string; share?: number; img?: string; ground?: string };
const WIPES: Record<string, string[]> = { briefing: ["iris", "strips", "pixels"], drafting: ["scan", "scanUp", "flood"] };
const canWhip = (a: Ask) => a.style === "briefing";

async function probe(): Promise<Record<string, Ask>> {
  // no plan while probing (the probe flag also switches transitions off)
  for (const s of timeline.scenes) delete s.seams;
  fs.writeFileSync(tlPath, JSON.stringify(timeline, null, 2));
  console.log("📦 Bundling (probe)...");
  const serveUrl = await bundle({ entryPoint: entry, publicDir });
  const asks: Record<string, Ask> = {};
  for (const s of scenes) {
    const composition = await selectComposition({ serveUrl, id: s.id, inputProps: { seamProbe: true } });
    let ask: Ask | null = null;
    const onBrowserLog = (l: { text: string }) => { const m = /WGSEAM (\{.*\})/.exec(l.text); if (m) ask = JSON.parse(m[1]); };
    const last = composition.durationInFrames - 1;
    for (const [frame, name] of [[0, "first"], [last, "last"]] as const) {
      await renderStill({ serveUrl, composition, frame, output: path.join(seamDir, `${s.id}_${name}.jpg`), imageFormat: "jpeg", jpegQuality: 90, inputProps: { seamProbe: true }, onBrowserLog, logLevel: "error" });
    }
    asks[s.id] = ask ?? { style: "briefing", open: "none", close: "none", ground: "#000000" };
    if (!ask) console.warn(`  ⚠️  ${s.id}: no drawAct report (placeholder or a custom wrapper): treated as plain cuts`);
    console.log(`  ${s.id}: ${asks[s.id].style}, open ${asks[s.id].open}, close ${asks[s.id].close}`);
  }
  return asks;
}

function plan(asks: Record<string, Ask>) {
  const seams: { a: string; b: string; owner: string; kind: string; how: string }[] = [];
  const sides: Record<string, { in?: Side; out?: Side }> = Object.fromEntries(scenes.map((s) => [s.id, {}]));
  for (let i = 0; i < scenes.length - 1; i++) {
    const A = scenes[i].id, B = scenes[i + 1].id, a = asks[A], b = asks[B];
    const aImg = `seams/${A}_last.jpg`, bImg = `seams/${B}_first.jpg`;
    const none: Side = { kind: "none" };
    if (WIPES[b.style]?.includes(b.open)) {
      sides[A].out = none; sides[B].in = { kind: b.open, img: aImg, ground: a.ground };
      seams.push({ a: A, b: B, owner: B, kind: b.open, how: `${B} wipes (${b.open}) from ${A}'s last frame; ${A} ends without a transition` });
    } else if (WIPES[a.style]?.includes(a.close)) {
      sides[A].out = { kind: a.close, img: bImg, ground: b.ground }; sides[B].in = none;
      seams.push({ a: A, b: B, owner: A, kind: a.close, how: `${A} wipes (${a.close}) into ${B}'s first frame; ${B} starts without a transition` });
    } else if (a.close === "whip" || b.open === "whip") {
      const wa = canWhip(a), wb = canWhip(b);
      if (wa && wb) {
        sides[A].out = { kind: "whip", share: 0.5, img: bImg, ground: b.ground }; sides[B].in = { kind: "whip", share: 0.5, img: aImg, ground: a.ground };
        seams.push({ a: A, b: B, owner: "both", kind: "whip", how: `one whip-pan: ${A} pans half with ${B}'s first frame beside it, ${B} finishes it` });
      } else if (wa || wb) {
        if (wa) { sides[A].out = { kind: "whip", share: 1, img: bImg, ground: b.ground }; sides[B].in = none; }
        else { sides[B].in = { kind: "whip", share: 1, img: aImg, ground: a.ground }; sides[A].out = none; }
        seams.push({ a: A, b: B, owner: wa ? A : B, kind: "whip", how: `${wa ? A : B} does the whole whip-pan with the other act's frame beside it` });
      } else {
        sides[A].out = none; sides[B].in = none;
        seams.push({ a: A, b: B, owner: "-", kind: "cut", how: "straight cut" });
      }
    } else {
      sides[A].out = none; sides[B].in = none;
      seams.push({ a: A, b: B, owner: "-", kind: "cut", how: "straight cut (neither act asked for a transition)" });
    }
  }
  return { seams, sides };
}

async function check(seams: { a: string; b: string; owner: string; kind: string; how: string }[]) {
  console.log("📦 Bundling (check)...");
  const serveUrl = await bundle({ entryPoint: entry, publicDir });
  const composition = await selectComposition({ serveUrl, id: "Main", inputProps: {} });
  const jobs: { seam: string; cut: number; files: string[] }[] = [];
  for (const s of seams) {
    const cut = scenes.find((x) => x.id === s.b)!.windowStartFrame;
    const files: string[] = [];
    for (const f of [cut - 2, cut - 1, cut, cut + 1]) {
      const file = path.join(reviewDir, `${s.a}-${s.b}_${f - cut >= 0 ? "+" : ""}${f - cut}.jpg`);
      await renderStill({ serveUrl, composition, frame: Math.max(0, f), output: file, imageFormat: "jpeg", jpegQuality: 80, scale: 0.25, logLevel: "error" });
      files.push(file);
    }
    jobs.push({ seam: `${s.a}-${s.b}`, cut, files });
  }
  const jobFile = path.join(reviewDir, ".jobs.json");
  fs.writeFileSync(jobFile, JSON.stringify(jobs));
  const python = process.env.WG_PYTHON ?? path.resolve(process.cwd(), ".venv/bin/python");
  const res = JSON.parse(execFileSync(python, [path.join(import.meta.dir, "seams_check.py"), jobFile, reviewDir], { encoding: "utf-8" }));
  fs.rmSync(jobFile, { force: true });
  for (const j of jobs) for (const f of j.files) fs.rmSync(f, { force: true });
  return seams.map((s) => {
    const r = res[`${s.a}-${s.b}`] ?? {};
    const cut = scenes.find((x) => x.id === s.b)!.windowStartFrame;
    return { ...s, cutFrame: cut, atS: Math.round((cut / fps) * 10) / 10, ...r, strip: `05-video/review/seams/${s.a}-${s.b}.jpg` };
  });
}

const seamsJson = path.join(out, "seams.json");
let seamList: ReturnType<typeof plan>["seams"];
if (checkOnly) {
  if (!fs.existsSync(seamsJson)) { console.error("❌ no seams.json yet: run without --check-only"); process.exit(1); }
  seamList = JSON.parse(fs.readFileSync(seamsJson, "utf-8")).seams;
} else {
  const asks = await probe();
  const p = plan(asks);
  seamList = p.seams;
  for (const s of timeline.scenes) s.seams = p.sides[s.id];
  fs.writeFileSync(tlPath, JSON.stringify(timeline, null, 2));
  fs.writeFileSync(seamsJson, JSON.stringify({ at: new Date().toISOString(), asks, seams: p.seams }, null, 2));
  console.log(`🧵 ${p.seams.length} seams planned:`);
  for (const s of p.seams) console.log(`  ${s.a} → ${s.b}: ${s.how}`);
}
const report = await check(seamList);
fs.writeFileSync(path.join(reviewDir, "report.json"), JSON.stringify({ at: new Date().toISOString(), seams: report }, null, 2));
const bad = report.filter((r: any) => r.flag && r.flag !== "ok");
for (const r of report as any[]) console.log(`  ${r.flag === "ok" ? "✓" : "⚠️ "} ${r.a} → ${r.b} at ${r.atS}s: ${r.kind}${r.flag !== "ok" ? ` — ${r.note}` : ""}`);
const ms = Date.now() - t0;
recordTiming(path.dirname(out), { step: "seams", ms });
console.log(`${bad.length ? "⚠️ " : "✅"} ${report.length} seams checked, ${bad.length} flagged (review/seams/report.json) in ${formatDuration(ms)}`);
