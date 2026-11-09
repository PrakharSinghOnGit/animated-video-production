/**
 * Director stage: Opus plans the video as acts (acts.json + treatment), the checker
 * enforces DIRECTOR.md's rules (errors fed back, max 3 attempts), and a storyboard
 * view (one scene per act) is written so timeline/assemble/render work unchanged.
 *
 * Usage: bun run direct --video <ID> [--model opus] [--style briefing|drafting] [--check]
 *   --check   validate an existing acts.json without calling the model
 */
import fs from "node:fs";
import path from "node:path";
import { resolveJobPaths } from "../src/lib/workspaceBridge";
import { compactTranscript } from "../src/lib/transcript";
import { checkActs, unverifiedData, actsToStoryboard, type ActsPlan, type Caption, type Chapter } from "../src/lib/acts";
import { runAgentAsync } from "../src/lib/agent";
import { roleModel } from "../../lib/models";
import { loadPrompt } from "../../learning/lessons";
import { recordTiming, formatDuration } from "../src/lib/timings";
import { isShortWorkspace } from "../src/lib/format";
import { requireFresh } from "../src/lib/freshness";
import { retireOldScenes } from "../src/lib/scenes";
import { snapshotPlanCaptions, changedActsPath } from "../src/lib/replan";
import { researchNote } from "../../02-scripting/research_lib";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const videoId = flag("--video") ?? flag("-v") ?? args.find((a) => !a.startsWith("-"));
// A 9:16 short (workspace/<VID>/shorts/S1, config.json format "short"): one act, SHORT_DIRECTOR.md, Sonnet and the shorts style by default
const short = !!videoId && isShortWorkspace(path.dirname(resolveJobPaths(videoId).outputDir));
const model = roleModel(short ? "shortsDirector" : "director", flag("--model"));
// House style: workflow/styles/<style>/ (STYLE.md + ACT.md). Saved in acts.json for the act authors.
const style = flag("--style") ?? (short ? "shorts" : process.env.WG_STYLE ?? "briefing");
if (!fs.existsSync(path.resolve(process.cwd(), `workflow/styles/${style}/STYLE.md`))) {
  console.error(`❌ unknown style "${style}" (no workflow/styles/${style}/STYLE.md)`);
  process.exit(1);
}
const checkOnly = args.includes("--check");
if (!videoId) {
  console.error("Usage: bun run direct --video <ID> [--model opus] [--style briefing|drafting] [--check]");
  process.exit(1);
}

const paths = resolveJobPaths(videoId);
const wsDir = path.dirname(paths.outputDir);
if (!process.argv.includes("--check")) requireFresh(wsDir, "plan");
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
  return checkActs(plan, captions, chapters, { short });
}

function finish(): void {
  const plan: ActsPlan = JSON.parse(fs.readFileSync(actsFile, "utf-8"));
  if (!checkOnly && plan.style !== style) {
    plan.style = style;
    fs.writeFileSync(actsFile, JSON.stringify(plan, null, 2), "utf-8");
  }
  // Keep a scene-based storyboard from the older pipeline instead of overwriting it
  if (fs.existsSync(storyboardFile)) {
    const old = JSON.parse(fs.readFileSync(storyboardFile, "utf-8"));
    if (!old.scenes?.every((sc: any) => sc.kind === "act")) {
      fs.copyFileSync(storyboardFile, storyboardFile.replace(/\.json$/, ".scenes-backup.json"));
      console.log(`   (previous scene storyboard kept as storyboard.scenes-backup.json)`);
    }
  }
  fs.writeFileSync(storyboardFile, JSON.stringify(actsToStoryboard(plan), null, 2), "utf-8");
  if (!checkOnly) {
    // the captions this plan is timed against (replan moves it to a later voice), and a fresh plan has no pending changes
    snapshotPlanCaptions(paths.outputDir);
    fs.rmSync(changedActsPath(paths.outputDir), { force: true });
  }
  // a new plan can reuse act IDs for different acts: the old plan's scene files are moved aside so they are not used
  const moved = retireOldScenes(paths.outputDir, plan.acts);
  if (moved.length) console.log(`🗄  ${moved.length} scene file(s) from the previous plan moved aside:\n${moved.map((m) => "   " + m).join("\n")}`);
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

const scriptFile = path.join(wsDir, "02-scripting", "script_raw.md");
const scriptHints = fs.existsSync(scriptFile) && /\*\*\[ON SCREEN\]:\*\*/i.test(fs.readFileSync(scriptFile, "utf-8")) ? scriptFile : "";
const director = loadPrompt(short ? "SHORT_DIRECTOR" : "DIRECTOR", { video: wsDir }).replace(/{{STYLE}}/g, style);
// A short's sourced figures come from its short.json (copied by shorts:write from the long video's plan)
const shortInfo = short ? (() => { try { return JSON.parse(fs.readFileSync(path.join(wsDir, "02-scripting", "short.json"), "utf-8")); } catch { return null; } })() : null;
const shortFigures = shortInfo?.data?.length
  ? `- The short's sourced figures (the only numbers allowed on screen; copy label/value/unit/source into beat data):\n${shortInfo.data.map((d: any) => `  - ${d.label}: ${d.value}${d.unit ? " " + d.unit : ""} [source: ${d.source}]`).join("\n")}\n`
  : short ? "- The short has no sourced figures: show no numbers that the narration does not say, and mark those \"narration (unverified)\".\n" : "";
// the music the short is cut to (06-audio/rhythm.json, bun run music:beat)
const rhythm = (() => { try { return JSON.parse(fs.readFileSync(path.join(wsDir, "06-audio", "rhythm.json"), "utf-8")); } catch { return null; } })();
const prompt = `${director}

# Inputs for ${paths.jobId}
- Style (Read it first): workflow/styles/${style}/STYLE.md
${shortFigures}${short ? "" : researchNote(wsDir, "director")}${scriptHints ? `- The writer's script with **[ON SCREEN]** hints per beat (suggestions: use them where they serve the style, ignore them where they don't): ${scriptHints}\n` : ""}- Narration: ${captions.length} words, ${Math.round(captions[captions.length - 1].endMs / 1000)} s. One sentence per line, [startMs-endMs]:

${compactTranscript(captions)}
${rhythm ? `\nMusic: the short is cut to ${rhythm.title} at ${rhythm.bpm} BPM (a bar every ${((4 * 60) / rhythm.bpm).toFixed(2)} s). Put beat changes and the big reveal on bar starts where the narration allows; bar starts (ms): ${rhythm.downbeats.map((t: number) => Math.round(t * 1000)).join(", ")}. Big accents (ms): ${rhythm.accents.filter((a: any) => a.s >= 0.5).map((a: any) => Math.round(a.t * 1000)).join(", ") || "none"}.\n` : ""}${chapters.length ? `\nChapters (from the script; the narration is silent from pauseStartMs to startMs while the chapter card shows). Each chapter must open a new act that starts at its pauseStartMs and has "chapter": {"n", "title"}:\n${chapters.map((c) => `- ${c.n}. ${c.title}: pause ${c.pauseStartMs}–${c.startMs} ms`).join("\n")}\n` : ""}
Write acts.json to this exact path with the Write tool: ${actsFile}
Do not write any other file.`;

let feedback: string[] = [];
for (let attempt = 1; attempt <= 3; attempt++) {
  const task = attempt === 1
    ? prompt
    : `${actsFile} failed validation. Read it, fix ONLY what these errors require, and Write the full corrected JSON back to the same path:\n${feedback.map((e) => "- " + e).join("\n")}`;
  console.log(`\n🎬 Director attempt ${attempt}/3 (${model})...`);
  const res = await runAgentAsync({ prompt: task, model, tools: ["Read", "Write"], maxTurns: 12, logPath: path.join(reviewDir, `direct_${attempt}.log`) });
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
