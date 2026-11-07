/**
 * Act authoring: Opus draws each act (one continuous take) and reviews its own frames;
 * then a fresh-context critic (never the author) scores the contact sheet against
 * STYLE.md. Failed acts get the critic's notes back, at most 2 fix rounds.
 *
 * The critic is advisory and runs free on Gemini Flash through `agy` by default
 * (`--critic sonnet` uses Claude instead). The act brief is workflow/prompts/ACT.md with
 * the plan's style filled in (workflow/styles/<style>/STYLE.md + ACT.md).
 *
 * Usage: bun run act --video <ID> [--act A01,A03] [--parallel 2] [--model opus] [--critic agy|sonnet] [--no-critic] [--force] [--strict] [--fix [notes.md]]
 *
 * --changed: only the acts whose narration a script change rewrote (05-video/changed_acts.json, written by replan):
 *   an act that is drawn gets one update round in its author's session (what was said before, what is said now, keep
 *   the rest); an act not drawn yet is authored. Each one leaves the list when it succeeds.
 *
 * Batch controls (so a run doesn't die half way on a plan limit):
 *   --models A01=claude:sonnet,A04=codex:gpt-6-luna   per-act model (others use --model / the default)
 *   --stop-at 90        start no new act once Claude's 5-hour usage is at or above 90% (status-line file, see limitPct)
 *   --on-limit <model>  when an act stops on a usage limit: redo it and the rest with this model (e.g. claude-iit:opus);
 *                       without it, no new acts start after a limit
 *   A file 05-video/.batch_stop (dashboard: "Start no more acts") lets the running acts finish and starts no new ones.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { resolveJobPaths } from "../src/lib/workspaceBridge";
import { type ActsPlan, type Act } from "../src/lib/acts";
import { runAgentAsync, runAgy, runAgyJson, extractJson, claudeHasSession, type AgentResult } from "../src/lib/agent";
import { roleModel, isAgy, agyModel, parseSpec } from "../../lib/models";
import { loadPrompt } from "../../learning/lessons";
import { recordTiming, formatDuration } from "../src/lib/timings";
import { isShortWorkspace } from "../src/lib/format";
import { requireFresh } from "../src/lib/freshness";
import { retireOldScenes, planChanged, recordPlanHash } from "../src/lib/scenes";
import { changedActsPath } from "../src/lib/replan";

const args = process.argv.slice(2);
const flag = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const videoId = flag("--video") ?? flag("-v");
const changedMode = args.includes("--changed");
const changedFile = () => { try { return JSON.parse(fs.readFileSync(changedActsPath(resolveJobPaths(flag("--video") ?? flag("-v") ?? "").outputDir), "utf-8")); } catch { return { acts: {} }; } };
const changedList: Record<string, { before: string; now: string; notes: string[] }> = changedMode ? changedFile().acts ?? {} : {};
const only = changedMode ? Object.keys(changedList) : flag("--act")?.toUpperCase().split(",");
const parallel = Math.max(1, parseInt(flag("--parallel") ?? "2", 10));
const criticModel = roleModel("critic", flag("--critic"));
const useCritic = !args.includes("--no-critic");
const force = args.includes("--force");
const strict = args.includes("--strict"); // let a failed critic verdict trigger a paid fix round
// --fix [notes.md]: one fix round on an existing act, in the author's own session, with the critic's notes (+ yours)
const fixMode = args.includes("--fix");
const fixNotesFile = fixMode && flag("--fix") && !flag("--fix")!.startsWith("--") ? flag("--fix") : undefined;
const MAX_FIX_ROUNDS = 1;
// per-act models: "A01=claude:sonnet,A04=opus"
const perActModel: Record<string, string> = Object.fromEntries((flag("--models") ?? "").split(",").map((x) => x.trim()).filter((x) => x.includes("="))
  .map((x) => { const i = x.indexOf("="); return [x.slice(0, i).trim().toUpperCase(), roleModel("actAuthor", x.slice(i + 1).trim())]; }));
const stopAt = flag("--stop-at") ? parseFloat(flag("--stop-at")!) : undefined;
const onLimit = flag("--on-limit") ? roleModel("actAuthor", flag("--on-limit")) : undefined;
if (!videoId) {
  console.error("Usage: bun run act --video <ID> [--act A01] [--parallel 2] [--model opus] [--critic sonnet] [--no-critic] [--force]");
  process.exit(1);
}

const paths = resolveJobPaths(videoId);
const wsDir = path.dirname(paths.outputDir);
requireFresh(wsDir, "acts");
const plan: ActsPlan = JSON.parse(fs.readFileSync(path.join(paths.outputDir, "acts.json"), "utf-8"));
const scenesDir = path.join(paths.outputDir, "src", "scenes");
fs.mkdirSync(scenesDir, { recursive: true });
// files from an older plan (an ID that left the plan, or the same ID with another slug) would be picked up instead
for (const m of retireOldScenes(paths.outputDir, plan.acts)) console.log(`🗄  older plan's scene moved: ${m}`);
const style = plan.style || "briefing";
const styleGuide = `workflow/styles/${style}/STYLE.md`;
if (!fs.existsSync(path.resolve(process.cwd(), `workflow/styles/${style}/ACT.md`))) {
  console.error(`❌ style "${style}" has no workflow/styles/${style}/ACT.md`);
  process.exit(1);
}
// 9:16 shorts (config.json format "short") get their own brief: one act, hook on frame 1, loop, captions
const short = isShortWorkspace(wsDir);
const authorModel = roleModel(short ? "shortsAct" : "actAuthor", flag("--model"));
/** Set once an act stopped on a usage limit: the model every act started after that uses (or null = start no more). */
let limitSwitch: string | null | undefined;
/** The model for an act: after a usage limit the fallback, else its own (--models), else the batch model. */
const modelFor = (id: string) => (limitSwitch ? limitSwitch : perActModel[id] ?? authorModel);
const actPrompt = loadPrompt(short ? "SHORT_ACT" : "ACT", { video: wsDir }).replace(/{{STYLE}}/g, style);
const AUTHOR_TOOLS = ["Read", "Write", "Edit", "Bash(bun run assemble:*)", "Bash(bun run frames:*)"];

// Timeline + registry must exist before any act can be previewed
const assemble = spawnSync("bun", ["run", "assemble", "--video", paths.jobId], { encoding: "utf-8" });
if (assemble.status !== 0) {
  console.error(`❌ assemble failed:\n${assemble.stderr || assemble.stdout}`);
  process.exit(1);
}
const timeline = JSON.parse(fs.readFileSync(path.join(paths.outputDir, "timeline.json"), "utf-8"));

/** The act's narration with act-relative times, one sentence per line. */
function actWords(act: Act): string {
  const scene = timeline.scenes.find((s: any) => s.id === act.id);
  const fps = timeline.fps;
  const lines: string[] = [];
  let buf: any[] = [];
  for (const w of scene.words) {
    buf.push(w);
    if (/[.!?]["')\]]*$/.test(w.text) || buf.length >= 30) {
      lines.push(`[${(buf[0].startFrame / fps).toFixed(2)}s] ${buf.map((x) => x.text).join(" ")}`);
      buf = [];
    }
  }
  if (buf.length) lines.push(`[${(buf[0].startFrame / fps).toFixed(2)}s] ${buf.map((x) => x.text).join(" ")}`);
  const m = scene.music;
  const music = m ? `\n\nMusic (cut to it: see "Cutting to the beat" in the act guide): ${m.title ?? "track"}, ${m.bpm} BPM, a beat every ${(60 / m.bpm).toFixed(3)} s. In code: ctx.music.beats / .downbeats / .accents (act seconds), beatPulse(t, ctx.music.beats).
Downbeats (bar starts, act s): ${m.downbeats.filter((t: number) => t >= 0).map((t: number) => t.toFixed(2)).join(", ")}
Big accents (drops, hits; strength 0-1): ${m.accents.filter((a: any) => a.s >= 0.5 && a.t >= 0).map((a: any) => `${a.t.toFixed(2)} (${a.s})`).join(", ") || "none"}` : "";
  return `Act window: ${(scene.durationFrames / fps).toFixed(2)} s (voice starts at ${(scene.voiceStartFrame / fps).toFixed(2)} s). Times are act-relative; ctx.word() gives exact word starts.\n${lines.join("\n")}${music}`;
}

function sceneFile(act: Act): string {
  return path.join(scenesDir, `${act.id}_${act.slug}.tsx`);
}

function account(step: string, m: string, r: AgentResult): void {
  recordTiming(wsDir, { step, ms: r.durationMs, model: m, costUsd: r.costUsd, inputTokens: r.inputTokens, outputTokens: r.outputTokens, cacheReadTokens: r.cacheReadTokens });
}

async function critique(act: Act, round: number): Promise<{ pass: boolean; notes: string; layout?: boolean }> {
  const reviewDir = path.join(paths.outputDir, "review", act.id);
  const sheet = path.join(reviewDir, "sheet.jpg");
  const frames = spawnSync("bun", ["run", "frames", "--video", paths.jobId, "--scene", act.id, "--every", short ? "2" : "4", "--words"], { encoding: "utf-8" });
  if (frames.status !== 0 || !fs.existsSync(sheet)) return { pass: false, layout: true, notes: `Frames failed to render:\n${(frames.stderr || frames.stdout).slice(-2000)}` };
  // Free gate first: measured layout problems go straight back to the author, no critic call
  try {
    const layout: { t: number; flags: string[] }[] = JSON.parse(fs.readFileSync(path.join(reviewDir, "layout.json"), "utf-8"));
    const real = layout
      .map((r) => ({ t: r.t, flags: r.flags.filter((f) => !f.includes("right edge")) }))
      .filter((r) => r.flags.length);
    if (real.length > 2) {
      console.log(`   📏 ${act.id} layout r${round}: ${real.length} frames flagged, skipping the critic`);
      return { pass: false, layout: true, notes: real.map((r) => `- ${r.t}s: ${r.flags.join("; ")}`).join("\n") };
    }
  } catch {}
  const out = path.join(reviewDir, `critic_${round}.json`);
  const free = isAgy(criticModel);
  const plan_ = JSON.stringify({ idea: act.idea, sheet: act.sheet, signature: act.signature, camera: act.camera, hits: act.beats.flatMap((b) => b.hits ?? []) });
  const prompt = `You are a strict motion-design critic. You have never seen this project's code. Read the style guide ${path.resolve(styleGuide)}, then look at the contact sheet image ${sheet} (one frame every few seconds plus frames at the narration's hit words; each tile is labelled with its act-relative time).

The act's plan: ${plan_}

The measured layout report (free pixel checks) is in ${path.join(reviewDir, "layout.json")}: treat its flags as facts.

Judge: (1) does it follow the style guide and not look like slides/boxes; (2) legibility at 1080p, nothing clipped or overlapping, nothing important in the subtitle band except the subtitle; (3) subjects large enough, frames never empty or static-looking; (4) the signature move is visible; (5) numbers on screen match the plan's data. Look at individual frames in ${reviewDir} if a tile is unclear.

${free ? "Do not create or edit any file. Reply ONLY with" : `Write to ${out} with the Write tool`} this JSON: {"pass": boolean, "score": 1-10, "issues": [{"time": "12.0s", "problem": "...", "fix": "..."}]}. pass = score >= 7 and no issue that a viewer would notice. Max 8 issues, most important first.${free ? "" : ' Then reply "done".'}`;
  const agy = free ? await runAgyJson({ prompt, model: agyModel(criticModel), logPath: path.join(reviewDir, `critic_${round}.log`) }).catch(() => null) : null;
  const r = agy ? agy.r : free
    ? await runAgy({ prompt, model: agyModel(criticModel), logPath: path.join(reviewDir, `critic_${round}.log`) })
    : await runAgentAsync({ prompt, model: criticModel, tools: ["Read", "Write"], maxTurns: 12, logPath: path.join(reviewDir, `critic_${round}.log`) });
  account(`critic ${act.id} r${round}`, criticModel, r);
  try {
    if (free) fs.writeFileSync(out, JSON.stringify(agy ? agy.json : extractJson(r.text), null, 2), "utf-8");
    const v = JSON.parse(fs.readFileSync(out, "utf-8"));
    const notes = (v.issues ?? []).map((i: any) => `- ${i.time}: ${i.problem} → ${i.fix}`).join("\n");
    console.log(`   🔎 ${act.id} critic r${round}: score ${v.score}/10 ${v.pass ? "PASS" : "FAIL"} (${formatDuration(r.durationMs)}, $${r.costUsd.toFixed(2)})`);
    return { pass: !!v.pass, notes };
  } catch {
    return { pass: true, notes: "" }; // a broken critic run never blocks the act
  }
}

/** ok = written (critic passed or not used); notes = written, the critic's notes are saved for you; failed = no act. */
type Outcome = "ok" | "notes" | "failed" | "limit";

/** An act stopped on a usage limit: switch the rest of the batch to --on-limit (and queue this act again), or stop starting acts. */
function hitLimit(act: Act, model: string): Outcome {
  if (onLimit && onLimit !== model && limitSwitch === undefined) {
    limitSwitch = onLimit;
    console.log(`   ⛔ ${act.id}: ${model} hit its usage limit: this act and the rest continue with ${onLimit}`);
    queue.unshift(act);
    return "limit";
  }
  if (limitSwitch !== null) limitSwitch = null;
  console.log(`   ⛔ ${act.id}: ${model} hit its usage limit: no new acts will start (the ones running finish)`);
  return "limit";
}

/** Claude's 5-hour usage in % from the status-line file the dashboard reads (~/.claude/wealthgap/statusline.json), or
 *  null when it is missing, older than 30 min, or its window has reset since. Covers the default Claude profile. */
function limitPct(): number | null {
  try {
    const f = path.join(os.homedir(), ".claude/wealthgap/statusline.json");
    if (Date.now() - fs.statSync(f).mtimeMs > 30 * 60_000) return null;
    const w = JSON.parse(fs.readFileSync(f, "utf-8"))?.rate_limits?.five_hour;
    if (!w || typeof w.used_percentage !== "number") return null;
    if (typeof w.resets_at === "number" && w.resets_at * 1000 < Date.now()) return 0;
    return w.used_percentage;
  } catch { return null; }
}
const stopFile = path.join(paths.outputDir, ".batch_stop");

/** Why the batch should start no new act now, or "" to go on. */
function holdReason(id: string): string {
  if (fs.existsSync(stopFile)) return "you asked to start no more acts";
  if (limitSwitch === null) return "a model hit its usage limit";
  const m = parseSpec(modelFor(id));
  if (stopAt !== undefined && m.provider === "claude") {
    const pct = limitPct();
    if (pct !== null && pct >= stopAt) return `Claude's 5-hour usage is at ${pct}% (stop at ${stopAt}%)`;
  }
  return "";
}

async function authorAct(act: Act): Promise<Outcome> {
  const file = sceneFile(act);
  const reviewDir = path.join(paths.outputDir, "review", act.id);
  if (fixMode) {
    if (!fs.existsSync(file)) { console.log(`❌ ${act.id}: no act file to fix (${path.basename(file)}); author it first`); return "failed"; }
    return fixAct(act, file, reviewDir);
  }
  if (changedMode && fs.existsSync(file)) {
    const c = changedList[act.id];
    const notes = `The script changed and this act's narration was re-voiced. The plan (acts.json) already has the new times and beat narration for ${act.id}; act-relative word times moved with it.
What was said before: "${c.before}"
What is said now: "${c.now}"
${c.notes.length ? `Plan changes that came with it:\n${c.notes.map((n) => "- " + n).join("\n")}\n` : ""}Update the act so it fits the new narration: any ctx.word() lookups of words that are gone, hits and text that quoted the old lines, and timing around the changed stretch. Keep everything else exactly as it is (this is not a redesign).`;
    console.log(`✏️  ${act.id}: narration changed, updating the drawn act`);
    return fixAct(act, file, reviewDir, notes);
  }
  if (fs.existsSync(file) && !force) {
    if (!planChanged(paths.outputDir, act.id, file)) {
      console.log(`⏩ ${act.id} exists (${path.basename(file)}); --force to redo`);
      return "ok";
    }
    console.log(`♻️  ${act.id}: its plan changed since the act was written, redoing it`);
  }
  const brief = briefFor(act, file);
  const model = modelFor(act.id);

  console.log(`✏️  ${act.id} authoring (${model})...`);
  let r = await runAgentAsync({ prompt: brief, model, tools: AUTHOR_TOOLS, maxTurns: 80, logPath: path.join(reviewDir, "author_0.log") });
  account(`act ${act.id} author`, model, r);
  console.log(`   ${act.id} author: ${r.ok ? "ok" : "FAILED"} in ${formatDuration(r.durationMs)}, ${r.numTurns} turns, $${r.costUsd.toFixed(2)}`);
  if (r.limit) return hitLimit(act, model);
  if (!r.ok || !fs.existsSync(file)) return "failed";
  recordPlanHash(paths.outputDir, act.id);
  if (!useCritic) return "ok";

  for (let round = 1; round <= MAX_FIX_ROUNDS + 1; round++) {
    const v = await critique(act, round);
    // The vision critic is advisory (it has miscounted marks and is harsh on taste); only the
    // free layout gate, or --strict, sends an act back for a paid fix round.
    if (v.pass || round > MAX_FIX_ROUNDS || (!v.layout && !strict)) {
      if (!v.pass) console.log(`   📝 ${act.id}: ${v.layout ? "layout flags" : "critic notes"} saved for your review (review/${act.id}/${v.layout ? "layout.json" : `critic_${round}.json`})${round > MAX_FIX_ROUNDS ? " after the fix round" : "; no paid fix round"}`);
      return v.pass ? "ok" : "notes";
    }
    const fix = `A critic who has not seen your code reviewed ${act.id} (${file}) from its contact sheet. Fix these issues, then re-run assemble and frames and check the sheet once:\n${v.notes}\nKeep everything that works. Reply with 2 lines when done.`;
    // Resume the author's own session: it already knows the style, the engine and its file
    const resume = r.sessionId || undefined;
    const fresh = `${brief}\n\n# Fix round ${round}\n${fix}`;
    r = await runAgentAsync({ prompt: resume ? fix : fresh, fresh, model, tools: AUTHOR_TOOLS, maxTurns: resume ? 40 : 80, freshMaxTurns: 80, resume, logPath: path.join(reviewDir, `author_${round}.log`) });
    account(`act ${act.id} fix r${round}`, model, r);
    console.log(`   ${act.id} fix r${round}: ${r.ok ? "ok" : "FAILED"} in ${formatDuration(r.durationMs)}, $${r.costUsd.toFixed(2)}`);
    if (r.ok) recordPlanHash(paths.outputDir, act.id);
  }
  return "notes";   // the act file is there; the last critic verdict is in review/<act>/
}

/** The full brief for an act: the act prompt, its plan and its word-timed narration (a fresh session needs all of it). */
function briefFor(act: Act, file: string): string {
  return `${actPrompt}

# This act
Video: ${paths.jobId}. Act ${act.id}. Scene file to write: ${file}
Previous act: ${plan.acts[plan.acts.indexOf(act) - 1]?.title ?? "(none: this opens the video)"}. Next act: ${plan.acts[plan.acts.indexOf(act) + 1]?.title ?? "(none: this ends the video)"}.

Plan:
${JSON.stringify(act, null, 1)}

Narration:
${actWords(act)}`;
}

const ranOutOfTurns = (r: AgentResult) => { try { return /error_max_turns/.test(fs.readFileSync(r.logPath, "utf-8")); } catch { return false; } };

/**
 * After a fix run: a plan edit (an act boundary moved because a note asked for it) is kept only if the plan still
 * validates, else acts.json and storyboard.json are restored. Returns a line to print, or "".
 */
function checkPlanEdit(before: { acts: string; board: string | null }): string {
  const actsFile = path.join(paths.outputDir, "acts.json"), board = path.join(paths.outputDir, "storyboard.json");
  if (fs.readFileSync(actsFile, "utf-8") === before.acts) return "";
  const ok = spawnSync("bun", ["run", "direct", "--video", paths.jobId, "--check"], { encoding: "utf-8" }).status === 0;
  if (ok) return "   ℹ️  the fix also changed acts.json (valid): the neighbouring act's plan changed, so re-check or redo it";
  fs.writeFileSync(actsFile, before.acts);
  if (before.board !== null) fs.writeFileSync(board, before.board);
  return "   ⚠️  the fix changed acts.json into an invalid plan: acts.json and storyboard.json restored";
}

/** The author's latest session id (from its run logs), so a fix round reuses its context. Only a session from the
 *  same model profile can be resumed (a claude-iit session does not exist for claude); runAgentAsync checks that and
 *  falls back to a fresh run with the full brief. */
function lastSession(reviewDir: string): string | undefined {
  const logs = fs.existsSync(reviewDir) ? fs.readdirSync(reviewDir).filter((f) => /^author_\d+\.log$/.test(f)).sort((a, b) => parseInt(a.slice(7)) - parseInt(b.slice(7))) : [];
  for (const f of logs.reverse()) {
    const m = fs.readFileSync(path.join(reviewDir, f), "utf-8").match(/"session_id":"([^"]+)"/);
    if (m) return m[1];
  }
  return undefined;
}

async function fixAct(act: Act, file: string, reviewDir: string, notes?: string): Promise<Outcome> {
  const extra = notes ?? (fixNotesFile ? fs.readFileSync(fixNotesFile, "utf-8") : "");
  // with your review notes the critic is skipped (the review already looked at the act); without, it finds the issues
  let critic = "";
  if (!extra) {
    const n = fs.readdirSync(reviewDir).filter((f) => /^critic_\d+\.json$/.test(f)).length + 1;
    const v = await critique(act, n);
    if (v.pass) { console.log(`   ✅ ${act.id}: critic passes, nothing to fix`); return "ok"; }
    critic = v.notes;
  }
  const resume = lastSession(reviewDir);
  const n = fs.readdirSync(reviewDir).filter((f) => /^author_\d+\.log$/.test(f)).length;
  // model left at default: follow the Claude profile that wrote the act, so its session can be resumed (much cheaper
  // than a fresh session re-reading everything). An explicit --model is always used as given.
  let model = modelFor(act.id);
  const sp = parseSpec(model);
  if (resume && !flag("--model") && !perActModel[act.id] && !limitSwitch && (sp.provider === "claude" || sp.provider === "claude-iit")) {
    const other = sp.provider === "claude" ? "claude-iit" : "claude";
    if (!claudeHasSession(sp.provider, resume) && claudeHasSession(other, resume)) {
      model = `${other}:${sp.model}`;
      console.log(`   (the act was written with the ${other} profile: fixing with ${model} to continue its session)`);
    }
  }
  const fix = `Review of ${act.id} (${file}). Fix these, then re-run assemble and frames, check the layout report and the sheet once:\n${extra ? `Director's notes (most important):\n${extra}\n` : ""}${critic ? `Critic (advisory, from the contact sheet):\n${critic}\n` : ""}Keep everything that works. Reply with 2 lines when done.`;
  // a fresh session gets the full brief (plan + timed narration), so it doesn't spend turns hunting for them
  const fresh = `${briefFor(act, file)}\n\n# Fix round\nThe scene file exists: Read it first and revise it, don't start over.\n${fix}`;
  const before = { acts: fs.readFileSync(path.join(paths.outputDir, "acts.json"), "utf-8"), board: (() => { try { return fs.readFileSync(path.join(paths.outputDir, "storyboard.json"), "utf-8"); } catch { return null; } })() };
  const sceneBefore = fs.statSync(file).mtimeMs;
  console.log(`🔧 ${act.id} fix round (${model}${resume ? ", resuming the author's session" : ""})...`);
  const r = await runAgentAsync({ prompt: resume ? fix : fresh, fresh, model, tools: AUTHOR_TOOLS, maxTurns: resume ? 40 : 80, freshMaxTurns: 80, resume, logPath: path.join(reviewDir, `author_${n}.log`) });
  account(`act ${act.id} fix`, model, r);
  if (r.limit && fs.statSync(file).mtimeMs <= sceneBefore) return hitLimit(act, model);
  const edited = fs.statSync(file).mtimeMs > sceneBefore;
  const outOfTurns = !r.ok && ranOutOfTurns(r);
  console.log(`   ${act.id} fix: ${r.ok ? "ok" : outOfTurns ? `ran out of turns (${r.numTurns})` : "FAILED"} in ${formatDuration(r.durationMs)}, $${r.costUsd.toFixed(2)}`);
  const planNote = checkPlanEdit(before);
  if (planNote) console.log(planNote);
  if (r.ok || edited) recordPlanHash(paths.outputDir, act.id);
  if (r.ok) return "ok";
  // its edits are on disk: keep them and say so, instead of calling the whole run a failure
  if (edited) { console.log(`   📝 ${act.id}: the fix's edits are kept (it stopped before its final check): render frames / preview and look`); return "notes"; }
  return "failed";
}

const todo = plan.acts.filter((a) => !only || only.includes(a.id));
if (changedMode && !todo.length) { console.log("✅ no act's narration changed: nothing to update"); process.exit(0); }
const t0 = Date.now();
const results: Record<string, Outcome> = {};
const skipped: string[] = [];
const queue = [...todo];
try { fs.rmSync(stopFile); } catch {}
if (Object.keys(perActModel).length) console.log(`Per-act models: ${Object.entries(perActModel).map(([k, v]) => `${k}=${v}`).join(", ")}`);
await Promise.all(
  Array.from({ length: Math.min(parallel, queue.length) }, async () => {
    while (queue.length) {
      const why = holdReason(queue[0].id);
      if (why) { console.log(`⏸  Not starting ${queue.map((a) => a.id).join(", ")}: ${why}.`); skipped.push(...queue.splice(0).map((a) => a.id)); break; }
      const act = queue.shift()!;
      results[act.id] = await authorAct(act);
    }
  })
);
try { fs.rmSync(stopFile); } catch {}
if (changedMode) {
  // updated acts leave the list; the rest stay for the next run
  const f = changedActsPath(paths.outputDir), cur = changedFile();
  for (const [id, o] of Object.entries(results)) if (o === "ok" || o === "notes") delete cur.acts?.[id];
  if (Object.keys(cur.acts ?? {}).length) fs.writeFileSync(f, JSON.stringify(cur, null, 2)); else fs.rmSync(f, { force: true });
}
spawnSync("bun", ["run", "assemble", "--video", paths.jobId], { stdio: "inherit" });
const mark = { ok: "✅", notes: "📝", failed: "❌", limit: "⛔" } as const;
if (skipped.length) console.log(`⏸  Not started: ${skipped.join(", ")}. Run Author acts again later (acts that have a file are skipped).`);
console.log(`\n${Object.entries(results).map(([id, o]) => `${mark[o]} ${id}`).join("  ")}   (${formatDuration(Date.now() - t0)} total)`);
if (Object.values(results).includes("notes")) console.log("📝 = written; the critic's notes are in review/<act>/ for you to look at (Review / Fix with notes if they matter).");
if (Object.values(results).includes("limit") && !Object.values(results).includes("failed")) console.log("⛔ = stopped on a usage limit: run it again later or with another model.");
if (Object.values(results).includes("failed")) {
  console.log("❌ = no act was written, or the fix run failed: see review/<act>/author_*.log.");
  process.exit(1);
}
