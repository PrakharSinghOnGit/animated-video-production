/**
 * On-demand reviewer for one act: is what's on screen in sync with what the voice is saying?
 * Renders frames (every N s + at every hit word), hands them to the chosen agent together with the act's
 * timed narration (word-aligned voiceover), and saves its findings. Separate from the author's critic: you
 * pick the agent and the context.
 *
 * Usage: bun run review --video <ID> --act A01 [--agent <provider:model>] [--give transcript,plan,script,code]
 *                       [--every 2] [--focus "text"] [--to-notes] [--no-frames]
 *   --agent     agy = Gemini Flash via Antigravity (free, default); haiku/sonnet/opus = Claude (paid)
 *   --give      context besides the frames (default transcript,plan): transcript = the voiceover's words with
 *               act-relative times; plan = the act's beats/hits; script = the script's [ON SCREEN] hints;
 *               code = the act's source file (lets the reviewer point at the line to change)
 *   --every     seconds between frames (default 2)
 *   --focus     what to look at hardest (e.g. "sync of the strips with the words")
 *   --to-notes  append the findings to review/<act>/director_notes.md (the notes "Fix with notes" sends)
 *   --no-frames reuse the frames already in review/<act>/
 * Output: review/<act>/reviews/<time>_<agent>.json + .md
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { resolveJobPaths } from "../src/lib/workspaceBridge";
import { runAgentAsync, runAgyJson, extractJson } from "../src/lib/agent";
import { roleModel, isAgy, agyModel, specSlug } from "../../lib/models";
import { recordTiming, formatDuration } from "../src/lib/timings";
import { keepAwake } from "../../lib/awake";
keepAwake();  // a long run: the Mac must not sleep mid-way (workflow/lib/awake.ts)

const args = process.argv.slice(2);
const flag = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const videoId = flag("--video") ?? flag("-v");
const actId = (flag("--act") ?? flag("--scene"))?.toUpperCase();
const agent = roleModel("actReview", flag("--agent"));
const agentSlug = specSlug(agent);
const give = new Set((flag("--give") ?? "transcript,plan").split(",").map((s) => s.trim()).filter(Boolean));
const every = flag("--every") ?? "2";
const focus = flag("--focus");
if (!videoId || !actId || !agent) {
  console.error("Usage: bun run review --video <ID> --act A01 [--agent agy|haiku|sonnet|opus] [--give transcript,plan,script,code] [--every 2] [--focus text] [--to-notes] [--no-frames]");
  process.exit(1);
}

const paths = resolveJobPaths(videoId);
const ws = path.dirname(paths.outputDir);
const reviewDir = path.join(paths.outputDir, "review", actId);
const timeline = JSON.parse(fs.readFileSync(path.join(paths.outputDir, "timeline.json"), "utf-8"));
const scene = timeline.scenes.find((s: any) => s.id.toUpperCase() === actId);
if (!scene) {
  console.error(`❌ ${actId} is not in timeline.json`);
  process.exit(1);
}
const fps: number = timeline.fps;
const winMs = (scene.windowStartFrame / fps) * 1000, durS = scene.durationFrames / fps;

// 1. frames
const t0 = Date.now();
if (!args.includes("--no-frames")) {
  console.log(`🖼  Rendering frames of ${actId} every ${every} s + hit words...`);
  const fr = spawnSync("bun", ["run", "frames", "--video", paths.jobId, "--scene", actId, "--every", every, "--words"], { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
  if (fr.status !== 0) {
    console.error(`❌ frames failed:\n${(fr.stderr || fr.stdout).slice(-1500)}`);
    process.exit(1);
  }
}
const frames = fs.readdirSync(reviewDir).filter((f) => /^t_[\d.]+\.jpg$/.test(f)).sort()
  .map((f) => ({ t: parseFloat(f.slice(2, -4)), file: path.join(reviewDir, f) }));
if (!frames.length) {
  console.error(`❌ no frames in ${reviewDir}`);
  process.exit(1);
}

// 2. context
type W = { text: string; startMs: number; endMs: number };
const words: W[] = JSON.parse(fs.readFileSync(path.join(paths.outputDir, "captions.json"), "utf-8"))
  .filter((w: W) => w.startMs >= winMs - 50 && w.startMs < winMs + durS * 1000);
const sec = (ms: number) => ((ms - winMs) / 1000).toFixed(1);
const sentences: string[] = [];
let cur: W[] = [];
for (const w of words) {
  cur.push(w);
  if (/[.!?…]["”’)]?$/.test(w.text.trim()) || cur.length >= 22) { sentences.push(`${sec(cur[0].startMs)}–${sec(cur[cur.length - 1].endMs)} s: ${cur.map((x) => `${x.text.trim()}@${sec(x.startMs)}`).join(" ")}`); cur = []; }
}
if (cur.length) sentences.push(`${sec(cur[0].startMs)}–${sec(cur[cur.length - 1].endMs)} s: ${cur.map((x) => `${x.text.trim()}@${sec(x.startMs)}`).join(" ")}`);

const plan = JSON.parse(fs.readFileSync(path.join(paths.outputDir, "acts.json"), "utf-8"));
const act = plan.acts?.find((a: any) => a.id.toUpperCase() === actId);
const sceneDir = path.join(paths.outputDir, "src", "scenes");
const code = fs.existsSync(sceneDir) ? fs.readdirSync(sceneDir).find((f) => f.startsWith(`${actId}_`) && f.endsWith(".tsx")) : undefined;
const scriptFile = path.join(ws, "02-scripting", "script_raw.md");
const style = plan.style ?? "briefing";

const ctx: string[] = [];
if (give.has("transcript")) ctx.push(`## The voiceover (word-aligned; each word is "word@second" in act time, the same clock as the frame names)\n${sentences.join("\n")}`);
if (give.has("plan") && act) ctx.push(`## What the plan says should happen (beats; a hit is a visual event that must be COMPLETE when its word starts)\n${JSON.stringify(act.beats ?? [], null, 1).slice(0, 12000)}\n(beat startMs/endMs are absolute; subtract ${Math.round(winMs)} ms for act time)`);
if (give.has("script") && fs.existsSync(scriptFile)) ctx.push(`## The script's on-screen hints: read ${scriptFile} (the [ON SCREEN] lines near this act's sentences)`);
if (give.has("code") && code) ctx.push(`## The act's source: ${path.join(sceneDir, code)} (a pure canvas draw function of time; hits are keyed to ctx.word(...)). Name the function/line to change in each fix.`);

const out = path.join(reviewDir, "reviews");
fs.mkdirSync(out, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const jsonOut = path.join(out, `${stamp}_${agentSlug}.json`);

const prompt = `You review one act (${actId}, ${durS.toFixed(1)} s) of a narrated finance explainer. Your main job is SYNC: does what is on screen match what the voice says, at the moment it says it?

Frames (act time in seconds in each file name, t_012.30.jpg = 12.30 s). Look at every one:
${frames.map((f) => `- ${f.t.toFixed(2)} s: ${f.file}`).join("\n")}
Also the contact sheet: ${path.join(reviewDir, "sheet.jpg")}. The house style is described in workflow/styles/${style}/STYLE.md (skim it if a frame's look confuses you).

${ctx.join("\n\n")}
${focus ? `\nThe creator asks you to look hardest at: ${focus}\n` : ""}
Check, sentence by sentence:
1. SYNC: when a thing is named (a number, a term, an object, a person), is it on screen and finished at that word? Late (appears after the word), early (shown long before it is mentioned and steals the reveal), missing, or showing something unrelated to what is being said.
2. LAYOUT: anything clipped by the frame edge on a held shot, overlapping, too small to read at 1080p, an empty or near-empty frame.
3. CLARITY: would a first-time viewer understand what the picture means while hearing the line?
Only report what you can see in the frames; quote the words with their times. Never guess about frames you did not look at.

${isAgy(agent) ? "Do not create or edit any file. Reply ONLY with" : "Reply ONLY with"} this JSON (no prose around it):
{"sync_score": 1-10, "overall": 1-10, "summary": "two sentences", "issues": [{"time": "12.3 s", "kind": "sync|layout|clarity", "severity": "high|medium|low", "said": "the words at that time", "seen": "what the frame shows", "fix": "what should change"}]}
Most important first, max 15 issues.`;

// 3. run
console.log(`🔎 Reviewing ${actId} with ${agent} (${frames.length} frames; context: ${[...give].join(", ") || "frames only"})...`);
const logPath = path.join(out, `${stamp}_${agentSlug}.log`);
let result: any = null, costUsd = 0, ms = 0, lastText = "";
if (isAgy(agent)) {
  const r = await runAgyJson({ prompt, model: agyModel(agent), logPath }).catch((e) => ({ r: null as any, json: null, e }));
  result = r.json; ms = r.r?.durationMs ?? Date.now() - t0;
} else {
  const r = await runAgentAsync({ prompt, model: agent, tools: ["Read"], maxTurns: 40, logPath, cwd: path.resolve(import.meta.dir, "../../..") });
  lastText = r.text;
  try { result = extractJson(r.text); } catch {}
  costUsd = r.costUsd; ms = r.durationMs;
  recordTiming(ws, { step: `review ${actId} (${agent})`, ms, model: agent, costUsd, inputTokens: r.inputTokens, outputTokens: r.outputTokens, cacheReadTokens: r.cacheReadTokens });
}
if (isAgy(agent)) recordTiming(ws, { step: `review ${actId} (${agent})`, ms, model: agent, costUsd: 0 });
if (!result?.issues) {
  console.error(`❌ the reviewer returned no usable JSON${lastText && !/[{]/.test(lastText) ? `: "${lastText.slice(0, 200)}"` : ""} (log: ${path.relative(process.cwd(), logPath)})`);
  process.exit(1);
}
result = { act: actId, agent, give: [...give], every: Number(every), focus: focus ?? null, frames: frames.length, at: new Date().toISOString(), costUsd, ms, ...result };
fs.writeFileSync(jsonOut, JSON.stringify(result, null, 2), "utf-8");
const md = [`## Review: ${actId} by ${agent}, ${new Date().toLocaleString()} (sync ${result.sync_score}/10, overall ${result.overall}/10)`, result.summary ?? "",
  ...result.issues.map((i: any) => `- ${i.time} [${i.kind}, ${i.severity}]: said "${i.said}", seen: ${i.seen}. Fix: ${i.fix}`)].join("\n");
fs.writeFileSync(jsonOut.replace(/\.json$/, ".md"), md + "\n", "utf-8");
if (args.includes("--to-notes")) {
  const notes = path.join(reviewDir, "director_notes.md");
  fs.appendFileSync(notes, `${fs.existsSync(notes) && fs.readFileSync(notes, "utf-8").trim() ? "\n\n" : ""}${md}\n`, "utf-8");
  console.log(`   appended to ${path.relative(process.cwd(), notes)}`);
}
console.log(`✅ sync ${result.sync_score}/10, overall ${result.overall}/10, ${result.issues.length} issue(s) in ${formatDuration(Date.now() - t0)}${costUsd ? `, $${costUsd.toFixed(2)}` : ", free"}`);
for (const i of result.issues.slice(0, 15)) console.log(`   - ${i.time} [${i.kind}/${i.severity}] ${i.seen} → ${i.fix}`);
console.log(`   ${path.relative(process.cwd(), jsonOut)}`);
