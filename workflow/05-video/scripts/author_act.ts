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
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { resolveJobPaths } from "../src/lib/workspaceBridge";
import { type ActsPlan, type Act } from "../src/lib/acts";
import { runAgentAsync, runAgy, runAgyJson, extractJson, type AgentResult } from "../src/lib/agent";
import { roleModel, isAgy, agyModel } from "../../lib/models";
import { loadPrompt } from "../../learning/lessons";
import { recordTiming, formatDuration } from "../src/lib/timings";
import { isShortWorkspace } from "../src/lib/format";
import { requireFresh } from "../src/lib/freshness";
import { retireOldScenes, planChanged, recordPlanHash } from "../src/lib/scenes";

const args = process.argv.slice(2);
const flag = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const videoId = flag("--video") ?? flag("-v");
const only = flag("--act")?.toUpperCase().split(",");
const parallel = Math.max(1, parseInt(flag("--parallel") ?? "2", 10));
const criticModel = roleModel("critic", flag("--critic"));
const useCritic = !args.includes("--no-critic");
const force = args.includes("--force");
const strict = args.includes("--strict"); // let a failed critic verdict trigger a paid fix round
// --fix [notes.md]: one fix round on an existing act, in the author's own session, with the critic's notes (+ yours)
const fixMode = args.includes("--fix");
const fixNotesFile = fixMode && flag("--fix") && !flag("--fix")!.startsWith("--") ? flag("--fix") : undefined;
const MAX_FIX_ROUNDS = 1;
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
const model = roleModel(short ? "shortsAct" : "actAuthor", flag("--model"));
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
  return `Act window: ${(scene.durationFrames / fps).toFixed(2)} s (voice starts at ${(scene.voiceStartFrame / fps).toFixed(2)} s). Times are act-relative; ctx.word() gives exact word starts.\n${lines.join("\n")}`;
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
type Outcome = "ok" | "notes" | "failed";

async function authorAct(act: Act): Promise<Outcome> {
  const file = sceneFile(act);
  const reviewDir = path.join(paths.outputDir, "review", act.id);
  if (fixMode) {
    if (!fs.existsSync(file)) { console.log(`❌ ${act.id}: no act file to fix (${path.basename(file)}); author it first`); return "failed"; }
    return fixAct(act, file, reviewDir);
  }
  if (fs.existsSync(file) && !force) {
    if (!planChanged(paths.outputDir, act.id, file)) {
      console.log(`⏩ ${act.id} exists (${path.basename(file)}); --force to redo`);
      return "ok";
    }
    console.log(`♻️  ${act.id}: its plan changed since the act was written, redoing it`);
  }
  const brief = `${actPrompt}

# This act
Video: ${paths.jobId}. Act ${act.id}. Scene file to write: ${file}
Previous act: ${plan.acts[plan.acts.indexOf(act) - 1]?.title ?? "(none: this opens the video)"}. Next act: ${plan.acts[plan.acts.indexOf(act) + 1]?.title ?? "(none: this ends the video)"}.

Plan:
${JSON.stringify(act, null, 1)}

Narration:
${actWords(act)}`;

  console.log(`✏️  ${act.id} authoring (${model})...`);
  let r = await runAgentAsync({ prompt: brief, model, tools: AUTHOR_TOOLS, maxTurns: 80, logPath: path.join(reviewDir, "author_0.log") });
  account(`act ${act.id} author`, model, r);
  console.log(`   ${act.id} author: ${r.ok ? "ok" : "FAILED"} in ${formatDuration(r.durationMs)}, ${r.numTurns} turns, $${r.costUsd.toFixed(2)}`);
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
    r = await runAgentAsync({ prompt: resume ? fix : fresh, fresh, model, tools: AUTHOR_TOOLS, maxTurns: resume ? 40 : 80, resume, logPath: path.join(reviewDir, `author_${round}.log`) });
    account(`act ${act.id} fix r${round}`, model, r);
    console.log(`   ${act.id} fix r${round}: ${r.ok ? "ok" : "FAILED"} in ${formatDuration(r.durationMs)}, $${r.costUsd.toFixed(2)}`);
    if (r.ok) recordPlanHash(paths.outputDir, act.id);
  }
  return "notes";   // the act file is there; the last critic verdict is in review/<act>/
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

async function fixAct(act: Act, file: string, reviewDir: string): Promise<Outcome> {
  const extra = fixNotesFile ? fs.readFileSync(fixNotesFile, "utf-8") : "";
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
  const fix = `Review of ${act.id} (${file}). Fix these, then re-run assemble and frames, check the layout report and the sheet once:\n${extra ? `Director's notes (most important):\n${extra}\n` : ""}${critic ? `Critic (advisory, from the contact sheet):\n${critic}\n` : ""}Keep everything that works. Reply with 2 lines when done.`;
  const fresh = `${actPrompt}\n\n# Act ${act.id}, file ${file} (it exists: Read it first and revise it, don't start over)\n${fix}`;
  console.log(`🔧 ${act.id} fix round (${model}${resume ? ", resuming the author's session" : ""})...`);
  const r = await runAgentAsync({ prompt: resume ? fix : fresh, fresh, model, tools: AUTHOR_TOOLS, maxTurns: resume ? 40 : 80, resume, logPath: path.join(reviewDir, `author_${n}.log`) });
  account(`act ${act.id} fix`, model, r);
  console.log(`   ${act.id} fix: ${r.ok ? "ok" : "FAILED"} in ${formatDuration(r.durationMs)}, $${r.costUsd.toFixed(2)}`);
  if (r.ok) recordPlanHash(paths.outputDir, act.id);
  return r.ok ? "ok" : "failed";
}

const todo = plan.acts.filter((a) => !only || only.includes(a.id));
const t0 = Date.now();
const results: Record<string, Outcome> = {};
const queue = [...todo];
await Promise.all(
  Array.from({ length: Math.min(parallel, queue.length) }, async () => {
    while (queue.length) {
      const act = queue.shift()!;
      results[act.id] = await authorAct(act);
    }
  })
);
spawnSync("bun", ["run", "assemble", "--video", paths.jobId], { stdio: "inherit" });
const mark = { ok: "✅", notes: "📝", failed: "❌" } as const;
console.log(`\n${Object.entries(results).map(([id, o]) => `${mark[o]} ${id}`).join("  ")}   (${formatDuration(Date.now() - t0)} total)`);
if (Object.values(results).includes("notes")) console.log("📝 = written; the critic's notes are in review/<act>/ for you to look at (Review / Fix with notes if they matter).");
if (Object.values(results).includes("failed")) {
  console.log("❌ = no act was written, or the fix run failed: see review/<act>/author_*.log.");
  process.exit(1);
}
