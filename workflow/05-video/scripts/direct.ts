/**
 * Director stage: Opus plans the video as acts (acts.json + treatment), the checker
 * enforces DIRECTOR.md's rules (errors fed back, max 3 attempts), and a storyboard
 * view (one scene per act) is written so timeline/assemble/render work unchanged.
 *
 * Usage: bun run direct --video <ID> [--model opus] [--check]
 *   --check   validate an existing acts.json without calling the model
 */
import fs from "node:fs";
import path from "node:path";
import { resolveJobPaths } from "../src/lib/workspaceBridge";
import { compactTranscript } from "../src/lib/transcript";
import { checkActs, unverifiedData, actsToStoryboard, type ActsPlan, type Caption, type Chapter } from "../src/lib/acts";
import { runAgent } from "../src/lib/agent";
import { recordTiming, formatDuration } from "../src/lib/timings";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const videoId = flag("--video") ?? flag("-v") ?? args.find((a) => !a.startsWith("-"));
const model = flag("--model") ?? process.env.DIRECTOR_MODEL ?? "opus";
const checkOnly = args.includes("--check");
if (!videoId) {
  console.error("Usage: bun run direct --video <ID> [--model opus] [--check]");
  process.exit(1);
}

const paths = resolveJobPaths(videoId);
const wsDir = path.dirname(paths.outputDir);
const actsFile = path.join(paths.outputDir, "acts.json");
const storyboardFile = path.join(paths.outputDir, "storyboard.json");
const captionsFile = path.join(paths.outputDir, "captions.json");
const reviewDir = path.join(paths.outputDir, "review");
if (!fs.existsSync(captionsFile)) {
  console.error(`❌ Missing ${captionsFile}. Run "bun run captions --video ${paths.jobId}" first.`);
  process.exit(1);
}
const captions: Caption[] = JSON.parse(fs.readFileSync(captionsFile, "utf-8"));
const chaptersFile = path.join(paths.outputDir, "chapters.json");
const chapters: Chapter[] = fs.existsSync(chaptersFile) ? JSON.parse(fs.readFileSync(chaptersFile, "utf-8")) : [];

function validate(): string[] {
  if (!fs.existsSync(actsFile)) return [`${actsFile} was not written`];
  let plan: ActsPlan;
  try {
    plan = JSON.parse(fs.readFileSync(actsFile, "utf-8"));
  } catch (e: any) {
    return [`acts.json is not valid JSON: ${e.message}`];
  }
  return checkActs(plan, captions, chapters);
}

function finish(): void {
  const plan: ActsPlan = JSON.parse(fs.readFileSync(actsFile, "utf-8"));
  // Keep a scene-based storyboard from the older pipeline instead of overwriting it
  if (fs.existsSync(storyboardFile)) {
    const old = JSON.parse(fs.readFileSync(storyboardFile, "utf-8"));
    if (!old.scenes?.every((sc: any) => sc.kind === "act")) {
      fs.copyFileSync(storyboardFile, storyboardFile.replace(/\.json$/, ".scenes-backup.json"));
      console.log(`   (previous scene storyboard kept as storyboard.scenes-backup.json)`);
    }
  }
  fs.writeFileSync(storyboardFile, JSON.stringify(actsToStoryboard(plan), null, 2), "utf-8");
  console.log(`✅ ${plan.acts.length} acts, avg ${Math.round(plan.acts.reduce((s, a) => s + a.endMs - a.startMs, 0) / plan.acts.length / 1000)} s`);
  for (const a of plan.acts) console.log(`   ${a.id} ${String(Math.round((a.endMs - a.startMs) / 1000)).padStart(3)} s  ${a.bpm} BPM  ${a.title}`);
  console.log(`   storyboard view → ${path.relative(process.cwd(), storyboardFile)}`);
  const unverified = unverifiedData(plan);
  if (unverified.length) {
    console.log(`\n⚠️  ${unverified.length} on-screen figure(s) are sourced only from the narration. Fact-check before publishing:`);
    for (const u of unverified) console.log(`   - ${u}`);
  }
}

if (checkOnly) {
  const errs = validate();
  if (errs.length) {
    console.error(`❌ acts.json: ${errs.length} problem(s)\n${errs.map((e) => "   - " + e).join("\n")}`);
    process.exit(1);
  }
  finish();
  process.exit(0);
}

const director = fs.readFileSync(path.resolve(process.cwd(), "workflow/prompts/DIRECTOR.md"), "utf-8");
const prompt = `${director}

# Inputs for ${paths.jobId}
- Style (Read it first): workflow/styles/ledger/STYLE.md
- Narration: ${captions.length} words, ${Math.round(captions[captions.length - 1].endMs / 1000)} s. One sentence per line, [startMs-endMs]:

${compactTranscript(captions)}
${chapters.length ? `\nChapters (from the script; the narration is silent from pauseStartMs to startMs while the chapter card shows). Each chapter must open a new act that starts at its pauseStartMs and has "chapter": {"n", "title"}:\n${chapters.map((c) => `- ${c.n}. ${c.title}: pause ${c.pauseStartMs}–${c.startMs} ms`).join("\n")}\n` : ""}
Write acts.json to this exact path with the Write tool: ${actsFile}
Do not write any other file.`;

let feedback: string[] = [];
for (let attempt = 1; attempt <= 3; attempt++) {
  const task = attempt === 1
    ? prompt
    : `${actsFile} failed validation. Read it, fix ONLY what these errors require, and Write the full corrected JSON back to the same path:\n${feedback.map((e) => "- " + e).join("\n")}`;
  console.log(`\n🎬 Director attempt ${attempt}/3 (${model})...`);
  const res = runAgent({ prompt: task, model, tools: ["Read", "Write"], maxTurns: 12, logPath: path.join(reviewDir, `direct_${attempt}.log`) });
  recordTiming(wsDir, {
    step: `direct (attempt ${attempt})`, ms: res.durationMs, model, costUsd: res.costUsd,
    inputTokens: res.inputTokens, outputTokens: res.outputTokens, cacheReadTokens: res.cacheReadTokens,
  });
  console.log(`   ${formatDuration(res.durationMs)}, ${res.numTurns} turns, $${res.costUsd.toFixed(2)}${res.ok ? "" : `, run failed (see ${res.logPath})`}`);
  feedback = validate();
  if (feedback.length === 0) {
    finish();
    process.exit(0);
  }
  console.log(`   ${feedback.length} problem(s):\n${feedback.slice(0, 12).map((e) => "   - " + e).join("\n")}`);
}
console.error(`❌ acts.json still invalid after 3 attempts.`);
process.exit(1);
