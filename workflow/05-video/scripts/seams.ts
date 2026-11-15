/**
 * Seams between acts: one owner per seam, the neighbours' real frames, and a check of every cut.
 *
 * Usage: bun run seams --video <ID> [--plan-only | --check-only] [--review]
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
 * 4. Per seam it also renders a short clip (review/seams/<A>-<B>.mp4, ~1.5 s each side, to watch the transition without
 *    a full render) and a wide strip (<A>-<B>_wide.jpg, 12 frames). With --review a vision reviewer (the critic model)
 *    also rates it 1-10 and says which side is broken; off by default (slow): the creator watches the clips and marks
 *    each seam fine / not fine with a note in the dashboard (review/seams/marks.json).
 * Acts are not edited. The draft/final chains run only steps 1-2 (--plan-only, seconds), which the render needs.
 *
 *   --plan-only           probe + plan only (no frames, clips or review)
 *   --fix-marked          one fix round for every seam the creator marked "not fine" (its note, its side), each
 *                         re-checked after; marks made on an older version of the seam are skipped
 *
 * Unchanged seams are reused: each seam's key is a hash of both acts' code and their timeline entries, so a re-run only
 * renders seams whose acts changed and only reviews seams without a review (a stopped run loses nothing: the report is
 * written after the renders and after every review). Reviews on agy run one at a time (parallel agy calls slow each other
 * down to many minutes) with a time limit; a timed-out seam is retried on the next run.
 *
 *   --force               render and review every seam again
 *   --only A03-A04        plan as usual, but check/clip/review only these seams, always afresh (merged into the report)
 *   --fix A03-A04 [--notes "..."] [--side auto|a|b|both]
 *                         one fix round on the act(s) at that seam (bun run act --fix with seam notes: the review's issues,
 *                         your note, the wide strip to look at), then re-check that seam. auto = the sides the review blamed.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import { bundle } from "@remotion/bundler";
import { renderStill, renderMedia, selectComposition } from "@remotion/renderer";
import { spawnSync } from "node:child_process";
import { runAgentAsync, extractJson } from "../src/lib/agent";
import { roleModel } from "../../lib/models";
import { resolveJobPaths } from "../src/lib/workspaceBridge";
import { recordTiming, formatDuration } from "../src/lib/timings";
import { keepAwake } from "../../lib/awake";
keepAwake();  // a long run: the Mac must not sleep mid-way (workflow/lib/awake.ts)

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const videoId = flag("--video") ?? flag("-v");
if (!videoId) { console.error("Usage: bun run seams --video <ID> [--plan-only | --check-only] [--only A03-A04,...] [--review] [--fix-marked] [--fix A03-A04 [--notes ..] [--side auto|a|b|both]]"); process.exit(1); }
const checkOnly = args.includes("--check-only");
const planOnly = args.includes("--plan-only");
const doReview = args.includes("--review");
const fixMarked = args.includes("--fix-marked");
const force = args.includes("--force");
const onlySeams = flag("--only")?.toUpperCase().split(",").filter(Boolean);
const fixSeam = flag("--fix")?.toUpperCase();
const SEAM_ID = /^A\d+-A\d+$/;
if ((onlySeams ?? []).concat(fixSeam ? [fixSeam] : []).some((x) => !SEAM_ID.test(x))) { console.error("❌ a seam is written A03-A04"); process.exit(1); }
const t0 = Date.now();
const paths = resolveJobPaths(videoId);
const out = paths.outputDir;
const tlPath = path.join(out, "timeline.json");
if (!fs.existsSync(tlPath)) { console.error(`❌ no timeline.json in ${out}: run Assemble first`); process.exit(1); }
const timeline = JSON.parse(fs.readFileSync(tlPath, "utf-8"));
const scenes: any[] = [...timeline.scenes].sort((a, b) => a.windowStartFrame - b.windowStartFrame);
const fps: number = timeline.fps;
// a seam must be two neighbouring acts: checked before any rendering
const realSeams = new Set(scenes.slice(1).map((s, i) => `${scenes[i].id}-${s.id}`.toUpperCase()));
const unknownSeams = (onlySeams ?? []).concat(fixSeam ? [fixSeam] : []).filter((x) => !realSeams.has(x));
if (unknownSeams.length) { console.error(`❌ not a seam of this video: ${unknownSeams.join(", ")} (seams: ${[...realSeams].join(", ")})`); process.exit(1); }
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

/** Frames around a cut for the wide strip: 7 before, 5 after (seconds from the cut). */
const WIDE = [-1.6, -1.2, -0.8, -0.5, -0.25, -0.1, 0, 0.1, 0.25, 0.5, 0.9, 1.3];
const CLIP_S = 1.5;
/** Review time limit per seam (agy usually answers in 30–120 s). */
const REVIEW_TIMEOUT_S = 240;

const sceneSrc = (id: string) => {
  const d = path.join(out, "src", "scenes");
  const f = fs.existsSync(d) ? fs.readdirSync(d).find((n) => n.startsWith(`${id}_`) && n.endsWith(".tsx")) : undefined;
  return f ? fs.readFileSync(path.join(d, f), "utf-8") : "";
};
/** What a seam's frames depend on: both acts' code, their place in the timeline and their transition plan. */
function seamKey(s: { a: string; b: string; how: string }): string {
  const t = (id: string) => { const x = scenes.find((y) => y.id === id) ?? {}; return [x.windowStartFrame, x.durationFrames, x.seams ?? null]; };
  return crypto.createHash("sha1").update(JSON.stringify([sceneSrc(s.a), sceneSrc(s.b), t(s.a), t(s.b), s.how, WIDE, CLIP_S, fps])).digest("hex").slice(0, 16);
}
const here = (rel?: string) => !!rel && fs.existsSync(path.join(out, "..", rel));

async function check(seams: { a: string; b: string; owner: string; kind: string; how: string }[]) {
  // unchanged seams keep their frames, clip and review (--force or --only redo them)
  const prev = new Map(readReport().map((x) => [`${x.a}-${x.b}`, x]));
  const reused = new Map<string, any>();
  for (const s of seams) {
    const id = `${s.a}-${s.b}`, p = prev.get(id), key = seamKey(s);
    if (!force && !onlySeams?.includes(id) && p?.key === key && here(p.strip) && here(p.wide)) reused.set(id, { ...p, ...s, key });
  }
  if (reused.size) console.log(`♻️  ${reused.size} unchanged seam${reused.size > 1 ? "s" : ""} reused (${[...reused.keys()].join(", ")})${force ? "" : "; --force redoes them"}`);
  seams = seams.filter((s) => !reused.has(`${s.a}-${s.b}`));
  if (!seams.length) return [...reused.values()];
  console.log(`📦 Bundling (check: ${seams.length} seam${seams.length > 1 ? "s" : ""} to render)...`);
  const serveUrl = await bundle({ entryPoint: entry, publicDir });
  const composition = await selectComposition({ serveUrl, id: "Main", inputProps: {} });
  const jobs: { seam: string; cut: number; files: string[]; wide: [string, number][] }[] = [];
  const last = composition.durationInFrames - 1;
  for (const s of seams) {
    const id = `${s.a}-${s.b}`;
    const cut = scenes.find((x) => x.id === s.b)!.windowStartFrame;
    const files: string[] = [];
    for (const f of [cut - 2, cut - 1, cut, cut + 1]) {
      const file = path.join(reviewDir, `${id}_${f - cut >= 0 ? "+" : ""}${f - cut}.jpg`);
      await renderStill({ serveUrl, composition, frame: Math.max(0, f), output: file, imageFormat: "jpeg", jpegQuality: 80, scale: 0.25, logLevel: "error" });
      files.push(file);
    }
    const wide: [string, number][] = [];
    for (const dt of WIDE) {
      const f = Math.min(last, Math.max(0, cut + Math.round(dt * fps)));
      const file = path.join(reviewDir, `${id}_w${dt}.jpg`);
      await renderStill({ serveUrl, composition, frame: f, output: file, imageFormat: "jpeg", jpegQuality: 80, scale: 0.25, logLevel: "error" });
      wide.push([file, dt]);
    }
    // the transition as a short silent clip, to watch it without a full render
    const from = Math.max(0, cut - Math.round(CLIP_S * fps)), to = Math.min(last, cut + Math.round(CLIP_S * fps));
    try {
      await renderMedia({ serveUrl, composition, codec: "h264", outputLocation: path.join(reviewDir, `${id}.mp4`), frameRange: [from, to], scale: 0.5, muted: true, logLevel: "error" });
    } catch (e: any) { console.warn(`  ⚠️  ${id}: clip failed (${e.message?.slice(0, 120)})`); }
    console.log(`  🎞  ${id}: frames + clip (${jobs.length + 1}/${seams.length})`);
    jobs.push({ seam: id, cut, files, wide });
  }
  const jobFile = path.join(reviewDir, ".jobs.json");
  fs.writeFileSync(jobFile, JSON.stringify(jobs));
  const python = process.env.WG_PYTHON ?? path.resolve(process.cwd(), ".venv/bin/python");
  const res = JSON.parse(execFileSync(python, [path.join(import.meta.dir, "seams_check.py"), jobFile, reviewDir], { encoding: "utf-8" }));
  fs.rmSync(jobFile, { force: true });
  for (const j of jobs) for (const f of [...j.files, ...j.wide.map((w) => w[0])]) fs.rmSync(f, { force: true });
  const fresh = seams.map((s) => {
    const id = `${s.a}-${s.b}`;
    const r = res[id] ?? {};
    const cut = scenes.find((x) => x.id === s.b)!.windowStartFrame;
    const clip = fs.existsSync(path.join(reviewDir, `${id}.mp4`)) ? `05-video/review/seams/${id}.mp4` : undefined;
    return { ...s, key: seamKey(s), cutFrame: cut, atS: Math.round((cut / fps) * 10) / 10, ...r, strip: `05-video/review/seams/${id}.jpg`, wide: `05-video/review/seams/${id}_wide.jpg`, clip };
  });
  return [...reused.values(), ...fresh];
}

/** Vision review of one seam from its wide strip: a 1-10 score and which side is broken. Never throws ({ error } on failure). */
async function reviewSeam(s: any, asks: Record<string, Ask> | undefined, model: string): Promise<{ review?: any; error?: string }> {
  const img = path.join(out, "..", s.wide);
  const prompt = `You review one transition (a cut between two animated acts) of a finance explainer video.
Image to look at: ${img}
It shows 12 frames left to right, top to bottom: white labels "A" are the end of act ${s.a} (seconds before the cut), blue labels "B" the start of act ${s.b} (seconds after the cut); the red bar marks the cut.
How this cut is meant to work: ${s.how}.${asks ? ` ${s.a} asks to close with "${asks[s.a]?.close ?? "none"}", ${s.b} to open with "${asks[s.b]?.open ?? "none"}".` : ""}
A frame-difference check said: ${s.flag === "ok" || !s.flag ? "nothing unusual" : `${s.flag}: ${s.note}`}.

A good transition: A's last ~1 s shows a finished, settled, uncluttered picture (nothing half-drawn, no stray fragments or labels cut by the edge, nothing popping away in the last frames); the transition itself moves continuously (no flash of empty or flat colour, no picture that jumps away and back, never two transitions on top of each other); B starts from a clean frame and builds; colours and camera motion don't snap.
Rate it and say which side causes each problem. Reply with ONLY this JSON:
{"score": 1-10, "verdict": "ok" | "fix", "summary": "one sentence", "issues": [{"side": "A_end" | "B_start" | "both", "problem": "what you see, with the frame time", "fix": "what to change"}]}`;
  try {
    const r = await runAgentAsync({ prompt, model, tools: ["Read"], maxTurns: 4, timeoutS: REVIEW_TIMEOUT_S, cwd: path.resolve(out, "../../.."), logPath: path.join(reviewDir, `${s.a}-${s.b}_review.log`) });
    if (!r.ok && !r.text) return { error: r.durationMs >= REVIEW_TIMEOUT_S * 1000 ? `timed out after ${REVIEW_TIMEOUT_S} s` : "the reviewer failed (see its log)" };
    const j = extractJson(r.text);
    return { review: { score: Math.max(1, Math.min(10, Number(j.score) || 0)), verdict: j.verdict === "ok" ? "ok" : "fix", summary: String(j.summary ?? ""), issues: (Array.isArray(j.issues) ? j.issues : []).slice(0, 6).map((i: any) => ({ side: ["A_end", "B_start", "both"].includes(i.side) ? i.side : "both", problem: String(i.problem ?? ""), fix: String(i.fix ?? "") })), model } };
  } catch (e: any) { return { error: `no usable reply (${String(e?.message ?? e).slice(0, 80)})` }; }
}

const seamsJson = path.join(out, "seams.json");
const reportFile = path.join(reviewDir, "report.json");
const readReport = (): any[] => { try { return JSON.parse(fs.readFileSync(reportFile, "utf-8")).seams ?? []; } catch { return []; } };
/** The creator's verdicts from the dashboard: { "A03-A04": { ok, note, side, at, key } } (key = the seam version marked). */
const readMarks = (): Record<string, { ok: boolean; note?: string; side?: string; key?: string }> => { try { return JSON.parse(fs.readFileSync(path.join(reviewDir, "marks.json"), "utf-8")); } catch { return {}; } };

if (fixMarked) {
  const report = new Map(readReport().map((x) => [`${x.a}-${x.b}`, x]));
  const todo = Object.entries(readMarks()).filter(([id, m]) => !m.ok && report.get(id) && report.get(id).key === m.key);
  if (!todo.length) { console.log("Nothing to fix: no seam is marked not fine (or the marked ones changed since: watch them again)."); process.exit(0); }
  console.log(`🔧 fixing ${todo.length} marked seam${todo.length > 1 ? "s" : ""}: ${todo.map(([id]) => id).join(", ")}`);
  let failed = 0;
  for (const [id, m] of todo) {
    const r = spawnSync("bun", ["run", "seams", "--video", paths.jobId, "--fix", id, "--side", m.side ?? "both", ...(m.note ? ["--notes", m.note] : [])], { stdio: "inherit" });
    if (r.status !== 0) failed++;
  }
  console.log(`${failed ? "⚠️ " : "✅"} ${todo.length - failed}/${todo.length} marked seams fixed and re-checked: watch them again and mark them`);
  process.exit(failed ? 1 : 0);
}

if (fixSeam) {
  // one fix round per broken side, with seam notes, then re-check this seam (a fresh run of this script)
  const s = readReport().find((x) => `${x.a}-${x.b}` === fixSeam);
  if (!s) { console.error(`❌ ${fixSeam} is not in the seam report: run Seams first`); process.exit(1); }
  const side = flag("--side") ?? "auto";
  const userNote = flag("--notes")?.trim() ?? "";
  const issues: any[] = s.review?.issues ?? [];
  const blamed = new Set(issues.flatMap((i) => (i.side === "both" ? ["a", "b"] : [i.side === "A_end" ? "a" : "b"])));
  const sides = side === "a" ? ["a"] : side === "b" ? ["b"] : side === "both" ? ["a", "b"] : blamed.size ? [...blamed] : ["a", "b"];
  const dur = (id: string) => scenes.find((x) => x.id === id)!.durationFrames / fps;
  for (const sd of sides.sort()) {
    const act = sd === "a" ? s.a : s.b;
    const mine = issues.filter((i) => i.side === "both" || i.side === (sd === "a" ? "A_end" : "B_start"));
    const where = sd === "a" ? `the END of this act (its last ~2 s: act time ${(dur(act) - 2).toFixed(1)}–${dur(act).toFixed(1)} s), where it cuts to ${s.b}` : `the START of this act (its first ~2 s), where it comes in from ${s.a}`;
    const notes = `# Transition fix: ${s.a} → ${s.b}
Fix only ${where}. Keep the rest of the act exactly as it is.
How this cut is handled: ${s.how}.${s.owner !== "-" && s.owner !== act && s.owner !== "both" ? ` ${s.owner} owns the transition: don't add one of your own here.` : ""}
Look at the frames around the cut first: Read ${path.join(out, "..", s.wide)} (white "A" labels = end of ${s.a}, blue "B" = start of ${s.b}, seconds from the cut).
${userNote ? `\nCreator's note (most important): ${userNote}\n` : ""}${mine.length ? `\nReviewer (advisory):\n${mine.map((i) => `- ${i.problem} → ${i.fix}`).join("\n")}\n` : ""}${s.flag && s.flag !== "ok" ? `\nFrame check: ${s.flag}: ${s.note}\n` : ""}
A good ${sd === "a" ? "ending: the final picture is finished, settled and uncluttered for its last ~1 s; nothing half-drawn, no stray labels or fragments at the edges, nothing vanishing in the last frames" : "start: a clean first frame that builds; nothing that flashes, pops or jumps in the first frames"}.
Check with: bun run frames --video ${paths.jobId} --scene ${act} --at ${sd === "a" ? [2, 1, 0.5, 0.1].map((x) => Math.max(0, dur(act) - x).toFixed(2)).join(",") : "0,0.1,0.5,1,2"} --only
`;
    const file = path.join(out, "review", act, `seam_${fixSeam}.md`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, notes);
    console.log(`🔧 ${fixSeam}: fixing ${sd === "a" ? "the end of" : "the start of"} ${act}`);
    const r = spawnSync("bun", ["run", "act", "--video", paths.jobId, "--act", act, "--fix", path.relative(process.cwd(), file)], { stdio: "inherit" });
    if (r.status !== 0) console.log(`   ⚠️  the fix of ${act} did not finish cleanly (see its log)`);
  }
  spawnSync("bun", ["run", "assemble", "--video", paths.jobId], { stdio: "inherit" });
  const again = spawnSync("bun", ["run", "seams", "--video", paths.jobId, "--only", fixSeam, ...(doReview ? ["--review"] : [])], { stdio: "inherit" });
  process.exit(again.status ?? 1);
}

let seamList: ReturnType<typeof plan>["seams"];
let asksNow: Record<string, Ask> | undefined;
if (checkOnly) {
  if (!fs.existsSync(seamsJson)) { console.error("❌ no seams.json yet: run without --check-only"); process.exit(1); }
  seamList = JSON.parse(fs.readFileSync(seamsJson, "utf-8")).seams;
} else {
  const asks = await probe();
  asksNow = asks;
  const p = plan(asks);
  seamList = p.seams;
  for (const s of timeline.scenes) s.seams = p.sides[s.id];
  fs.writeFileSync(tlPath, JSON.stringify(timeline, null, 2));
  fs.writeFileSync(seamsJson, JSON.stringify({ at: new Date().toISOString(), asks, seams: p.seams }, null, 2));
  console.log(`🧵 ${p.seams.length} seams planned:`);
  for (const s of p.seams) console.log(`  ${s.a} → ${s.b}: ${s.how}`);
  if (planOnly) { recordTiming(path.dirname(out), { step: "seams", ms: Date.now() - t0 }); console.log(`✅ seams planned in ${formatDuration(Date.now() - t0)} (clips to watch: Render → Seams)`); process.exit(0); }
}
const todo = onlySeams ? seamList.filter((x) => onlySeams.includes(`${x.a}-${x.b}`)) : seamList;
/** Merge into the earlier report (--only keeps the other seams; seams that no longer exist drop out) and write it. */
function saveReport(done: any[]): any[] {
  const prev = new Map(readReport().map((x) => [`${x.a}-${x.b}`, x]));
  const fresh = new Map(done.map((x) => [`${x.a}-${x.b}`, x]));
  const r: any[] = seamList.map((x) => fresh.get(`${x.a}-${x.b}`) ?? prev.get(`${x.a}-${x.b}`)).filter(Boolean);
  fs.writeFileSync(reportFile, JSON.stringify({ at: new Date().toISOString(), seams: r }, null, 2));
  return r;
}
const order = new Map(todo.map((x, i) => [`${x.a}-${x.b}`, i]));
const checked: any[] = (await check(todo)).sort((a, b) => order.get(`${a.a}-${a.b}`)! - order.get(`${b.a}-${b.b}`)!);
let report = saveReport(checked);   // frames and clips are on disk now, before any review
const critic = roleModel("critic");
if (doReview && critic !== "off") {
  const pending = checked.filter((s) => !s.review);
  // agy calls in parallel slow each other down (30 s alone, 10+ min three at a time): one at a time there
  const lanes = critic.startsWith("agy") ? 1 : 3;
  if (!pending.length) console.log("👁  every seam already has a review (unchanged since)");
  else console.log(`👁  reviewing ${pending.length} transition${pending.length > 1 ? "s" : ""} with ${critic}${lanes === 1 ? ", one at a time" : ""} (limit ${REVIEW_TIMEOUT_S} s each)...`);
  const queue = [...pending];
  let n = 0;
  await Promise.all(Array.from({ length: lanes }, async () => {
    while (queue.length) {
      const s = queue.shift()!, id = `${s.a}-${s.b}`, i = ++n, t = Date.now();
      console.log(`  👁  ${id} (${i}/${pending.length})...`);
      const beat = setInterval(() => console.log(`     … ${id} still being reviewed (${Math.round((Date.now() - t) / 1000)} s)`), 30_000);
      const r = await reviewSeam(s, asksNow, critic);
      clearInterval(beat);
      const secs = Math.round((Date.now() - t) / 1000);
      if (r.review) { s.review = r.review; console.log(`     ${r.review.verdict === "ok" ? "✓" : "⚠️ "} ${id}: ${r.review.score}/10 in ${secs} s`); }
      else console.log(`     ⚠️  ${id}: no review, ${r.error} (run Seams again: it retries only the seams without a review)`);
      report = saveReport(checked);
    }
  }));
}
const bad = report.filter((r: any) => (r.flag && r.flag !== "ok") || r.review?.verdict === "fix");
for (const r of checked) console.log(`  ${r.flag === "ok" && r.review?.verdict !== "fix" ? "✓" : "⚠️ "} ${r.a} → ${r.b} at ${r.atS}s: ${r.kind}${r.flag !== "ok" ? ` — ${r.note}` : ""}${r.review ? ` · ${r.review.score}/10 ${r.review.summary}` : ""}`);
const ms = Date.now() - t0;
recordTiming(path.dirname(out), { step: "seams", ms });
console.log(`${bad.length ? "⚠️ " : "✅"} ${report.length} seams checked, ${bad.length} flagged (review/seams/report.json) in ${formatDuration(ms)}`);
