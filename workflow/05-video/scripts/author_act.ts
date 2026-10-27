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
import { recordTiming, formatDuration } from "../src/lib/timings";

const args = process.argv.slice(2);
const flag = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const videoId = flag("--video") ?? flag("-v");
const only = flag("--act")?.toUpperCase().split(",");
const parallel = Math.max(1, parseInt(flag("--parallel") ?? "2", 10));
const model = flag("--model") ?? process.env.ACT_MODEL ?? "opus";
const criticModel = flag("--critic") ?? process.env.CRITIC_MODEL ?? "agy";
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
const plan: ActsPlan = JSON.parse(fs.readFileSync(path.join(paths.outputDir, "acts.json"), "utf-8"));
const scenesDir = path.join(paths.outputDir, "src", "scenes");
fs.mkdirSync(scenesDir, { recursive: true });
const style = plan.style || "ledger";
const styleGuide = `workflow/styles/${style}/STYLE.md`;
if (!fs.existsSync(path.resolve(process.cwd(), `workflow/styles/${style}/ACT.md`))) {
  console.error(`❌ style "${style}" has no workflow/styles/${style}/ACT.md`);
  process.exit(1);
}
const actPrompt = fs.readFileSync(path.resolve(process.cwd(), "workflow/prompts/ACT.md"), "utf-8").replace(/{{STYLE}}/g, style);
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
  const frames = spawnSync("bun", ["run", "frames", "--video", paths.jobId, "--scene", act.id, "--every", "4", "--words"], { encoding: "utf-8" });
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
  const free = criticModel === "agy";
  const plan_ = JSON.stringify({ idea: act.idea, sheet: act.sheet, signature: act.signature, camera: act.camera, hits: act.beats.flatMap((b) => b.hits ?? []) });
  const prompt = `You are a strict motion-design critic. You have never seen this project's code. Read the style guide ${path.resolve(styleGuide)}, then look at the contact sheet image ${sheet} (one frame every few seconds plus frames at the narration's hit words; each tile is labelled with its act-relative time).

The act's plan: ${plan_}

The measured layout report (free pixel checks) is in ${path.join(reviewDir, "layout.json")}: treat its flags as facts.

Judge: (1) does it follow the style guide and not look like slides/boxes; (2) legibility at 1080p, nothing clipped or overlapping, nothing important in the subtitle band except the subtitle; (3) subjects large enough, frames never empty or static-looking; (4) the signature move is visible; (5) numbers on screen match the plan's data. Look at individual frames in ${reviewDir} if a tile is unclear.

${free ? "Do not create or edit any file. Reply ONLY with" : `Write to ${out} with the Write tool`} this JSON: {"pass": boolean, "score": 1-10, "issues": [{"time": "12.0s", "problem": "...", "fix": "..."}]}. pass = score >= 7 and no issue that a viewer would notice. Max 8 issues, most important first.${free ? "" : ' Then reply "done".'}`;
  const agy = free ? await runAgyJson({ prompt, logPath: path.join(reviewDir, `critic_${round}.log`) }).catch(() => null) : null;
  const r = agy ? agy.r : free
    ? await runAgy({ prompt, logPath: path.join(reviewDir, `critic_${round}.log`) })
    : await runAgentAsync({ prompt, model: criticModel, tools: ["Read", "Write"], maxTurns: 12, logPath: path.join(reviewDir, `critic_${round}.log`) });
  account(`critic ${act.id} r${round}`, free ? "agy" : criticModel, r);
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

async function authorAct(act: Act): Promise<boolean> {
  const file = sceneFile(act);
  const reviewDir = path.join(paths.outputDir, "review", act.id);
  if (fixMode && fs.existsSync(file)) return fixAct(act, file, reviewDir);
  if (fs.existsSync(file) && !force) {
    console.log(`⏩ ${act.id} exists (${path.basename(file)}); --force to redo`);
    return true;
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
  if (!r.ok || !fs.existsSync(file)) return false;
  if (!useCritic) return true;

  for (let round = 1; round <= MAX_FIX_ROUNDS + 1; round++) {
    const v = await critique(act, round);
    // The vision critic is advisory (it has miscounted marks and is harsh on taste); only the
    // free layout gate, or --strict, sends an act back for a paid fix round.
    if (v.pass || round > MAX_FIX_ROUNDS || (!v.layout && !strict)) {
      if (!v.pass && !v.layout) console.log(`   📝 ${act.id}: critic notes saved for your review (review/${act.id}/critic_${round}.json); no paid fix round`);
      return v.pass || !v.layout;
    }
    const fix = `A critic who has not seen your code reviewed ${act.id} (${file}) from its contact sheet. Fix these issues, then re-run assemble and frames and check the sheet once:\n${v.notes}\nKeep everything that works. Reply with 2 lines when done.`;
    // Resume the author's own session: it already knows the style, the engine and its file
    const resume = r.sessionId || undefined;
    r = await runAgentAsync({ prompt: resume ? fix : `${brief}\n\n# Fix round ${round}\n${fix}`, model, tools: AUTHOR_TOOLS, maxTurns: 40, resume, logPath: path.join(reviewDir, `author_${round}.log`) });
    account(`act ${act.id} fix r${round}`, model, r);
    console.log(`   ${act.id} fix r${round}: ${r.ok ? "ok" : "FAILED"} in ${formatDuration(r.durationMs)}, $${r.costUsd.toFixed(2)}`);
  }
  return false;
}

/** The author's latest session id (from its run logs), so a fix round reuses its context. */
function lastSession(reviewDir: string): string | undefined {
  const logs = fs.existsSync(reviewDir) ? fs.readdirSync(reviewDir).filter((f) => /^author_\d+\.log$/.test(f)).sort((a, b) => parseInt(a.slice(7)) - parseInt(b.slice(7))) : [];
  for (const f of logs.reverse()) {
    const m = fs.readFileSync(path.join(reviewDir, f), "utf-8").match(/"session_id":"([^"]+)"/);
    if (m) return m[1];
  }
  return undefined;
}

async function fixAct(act: Act, file: string, reviewDir: string): Promise<boolean> {
  const v = await critique(act, 1);
  const extra = fixNotesFile ? fs.readFileSync(fixNotesFile, "utf-8") : "";
  if (v.pass && !extra) { console.log(`   ✅ ${act.id}: critic passes, nothing to fix`); return true; }
  const resume = lastSession(reviewDir);
  const n = fs.readdirSync(reviewDir).filter((f) => /^author_\d+\.log$/.test(f)).length;
  const fix = `Review of ${act.id} (${file}). Fix these, then re-run assemble and frames, check the layout report and the sheet once:\n${extra ? `Director's notes (most important):\n${extra}\n` : ""}${v.notes ? `Critic (advisory, from the contact sheet):\n${v.notes}\n` : ""}Keep everything that works. Reply with 2 lines when done.`;
  console.log(`🔧 ${act.id} fix round (${model}${resume ? ", resumed session" : ""})...`);
  const r = await runAgentAsync({ prompt: resume ? fix : `${actPrompt}\n\n# Act ${act.id}, file ${file}\n${fix}`, model, tools: AUTHOR_TOOLS, maxTurns: 40, resume, logPath: path.join(reviewDir, `author_${n}.log`) });
  account(`act ${act.id} fix`, model, r);
  console.log(`   ${act.id} fix: ${r.ok ? "ok" : "FAILED"} in ${formatDuration(r.durationMs)}, $${r.costUsd.toFixed(2)}`);
  return r.ok;
}

const todo = plan.acts.filter((a) => !only || only.includes(a.id));
const t0 = Date.now();
const results: Record<string, boolean> = {};
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
console.log(`\n${Object.entries(results).map(([id, ok]) => `${ok ? "✅" : "⚠️ "} ${id}`).join("  ")}   (${formatDuration(Date.now() - t0)} total)`);
if (Object.values(results).some((ok) => !ok)) {
  console.log("Acts marked ⚠️ failed authoring or the critic after the fix rounds; check review/<act>/critic_*.json.");
  process.exit(1);
}
