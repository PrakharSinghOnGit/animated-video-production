/**
 * Script stage: the creator's plain-text idea → a finished, chunked narration script (yt-script method),
 * then a human approval gate before any voice is generated.
 *
 *   02-scripting/idea.md          the creator's draft (plain text; [brackets] = instructions to the writer)
 *   02-scripting/feedback.md      optional: the creator's notes on the last script, for a revision
 *   → 02-scripting/script_raw.md  the script (### Part/CHAPTER, **VO:** beats, **[ON SCREEN]:** hints)
 *   → 02-scripting/script_notes.md hooks + scores, numbers to verify, changes, questions, runtime
 *   → 02-scripting/approved.json  written by --approve (sha256 of script_raw.md); tts:format refuses without it
 *
 * Usage: bun run write --video <ID> [--model <provider:model>] [--minutes 9]   write or revise the script (paid)
 *        bun run write --video <ID> --parts 2,4                            revise only parts 2 and 4 with feedback.md;
 *                                                                          every other part stays exactly as it is, so
 *                                                                          only their lines are voiced again (voice:sync)
 *        bun run write --video <ID> --approve                              approve the current script_raw.md
 *        bun run write --video <ID> --status                               show approval state
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { runAgent } from "../05-video/src/lib/agent";
import { roleModel } from "../lib/models";
import { loadPrompt } from "../learning/lessons";
import { recordTiming, formatDuration } from "../05-video/src/lib/timings";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const videoId = flag("--video") ?? flag("-v");
if (!videoId) {
  console.error("Usage: bun run write --video <ID> [--model <provider:model>] [--minutes 9] | --approve | --status");
  process.exit(1);
}
const REPO = path.resolve(import.meta.dir, "../..");
const ws = path.join(REPO, "workspace", videoId);
if (!fs.existsSync(ws)) {
  console.error(`❌ no workspace ${ws} (bun run new-video ${videoId})`);
  process.exit(1);
}
const dir = path.join(ws, "02-scripting");
const F = {
  idea: path.join(dir, "idea.md"),
  feedback: path.join(dir, "feedback.md"),
  script: path.join(dir, "script_raw.md"),
  notes: path.join(dir, "script_notes.md"),
  hooks: path.join(dir, "hooks.txt"),
  approved: path.join(dir, "approved.json"),
};
const sha = (p: string) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");

/** "approved" | "changed since approval" | "not approved" | "no script" */
export function approvalState(): string {
  if (!fs.existsSync(F.script)) return "no script";
  if (!fs.existsSync(F.approved)) return "not approved";
  try {
    return JSON.parse(fs.readFileSync(F.approved, "utf-8")).sha256 === sha(F.script) ? "approved" : "changed since approval";
  } catch {
    return "not approved";
  }
}

if (args.includes("--status")) {
  console.log(`${videoId}: script ${approvalState()}`);
  process.exit(0);
}

if (args.includes("--approve")) {
  if (!fs.existsSync(F.script)) {
    console.error(`❌ no ${path.relative(REPO, F.script)} to approve`);
    process.exit(1);
  }
  const text = fs.readFileSync(F.script, "utf-8");
  const words = text.split("\n").filter((l) => /^\*\*VO:\*\*/i.test(l)).join(" ").replace(/`\[[^\]]*\]`/g, "").replace(/\*\*VO:\*\*/gi, "").split(/\s+/).filter(Boolean).length;
  fs.writeFileSync(F.approved, JSON.stringify({ sha256: sha(F.script), at: new Date().toISOString(), words }, null, 2), "utf-8");
  console.log(`✅ approved ${path.relative(REPO, F.script)} (${words} spoken words, ~${(words / 150).toFixed(1)} min). Next: bun run tts:format --video ${videoId}`);
  process.exit(0);
}

if (!fs.existsSync(F.idea)) {
  console.error(`❌ write your draft first: ${path.relative(REPO, F.idea)} (plain text; [brackets] are instructions to the writer)`);
  process.exit(1);
}
const model = roleModel("writer", flag("--model"));
const minutes = parseFloat(flag("--minutes") ?? "9");
// --parts 2,4: by position of the "### " headings (1 = the first part), as the dashboard lists them
const onlyParts = flag("--parts") ? [...new Set(flag("--parts")!.split(/[\s,]+/).filter(Boolean).map(Number))] : null;
/** [text before the first heading, each "### " part with its lines] */
const splitParts = (t: string) => { const b = t.split(/^(?=### )/m); return { head: b[0].startsWith("### ") ? "" : b[0], parts: b[0].startsWith("### ") ? b : b.slice(1) }; };
const oldScript = fs.existsSync(F.script) ? fs.readFileSync(F.script, "utf-8") : "";
if (onlyParts) {
  const n = splitParts(oldScript).parts.length;
  if (!oldScript) { console.error("❌ --parts revises an existing script: there is none yet"); process.exit(1); }
  if (onlyParts.some((p) => !Number.isInteger(p) || p < 1 || p > n)) { console.error(`❌ --parts: the script has parts 1-${n}`); process.exit(1); }
  if (!fs.existsSync(F.feedback) || !fs.readFileSync(F.feedback, "utf-8").trim()) { console.error("❌ --parts needs feedback.md: write what to change in those parts"); process.exit(1); }
}
const revising = !!onlyParts || (fs.existsSync(F.script) && fs.existsSync(F.feedback) && fs.statSync(F.feedback).mtimeMs > fs.statSync(F.script).mtimeMs);
if (fs.existsSync(F.script)) fs.copyFileSync(F.script, F.script.replace(/\.md$/, `.${Date.now()}.bak.md`));
if (fs.existsSync(F.approved)) fs.rmSync(F.approved);   // a new script needs a new approval

const partTitles = splitParts(oldScript).parts.map((p, i) => `${i + 1}. ${p.split("\n")[0].replace(/^###\s*/, "")}`);
const previous = onlyParts
  ? `4. This is a **partial revision**. Your previous script: \`${F.script}\`. The creator's feedback: \`${F.feedback}\`. Rewrite ONLY these parts: ${onlyParts.map((p) => partTitles[p - 1]).join("; ")}. Every other part must stay exactly as it is, character for character (its lines are already voiced), and keep the same number of "### " parts in the same order. Make the rewritten parts flow into the unchanged parts around them. In the notes, say what changed.`
  : revising
  ? `4. This is a **revision**. Your previous script: \`${F.script}\`. The creator's feedback on it: \`${F.feedback}\`. Apply every point of the feedback; keep what they didn't criticise.`
  : "";
const prompt = loadPrompt("WRITER", { video: videoId })
  .replace(/{{IDEA}}/g, F.idea).replace(/{{PREVIOUS}}/g, previous)
  .replace(/{{SCRIPT}}/g, F.script).replace(/{{NOTES}}/g, F.notes).replace(/{{HOOKS}}/g, F.hooks)
  .replace(/{{MINUTES}}/g, String(minutes)).replace(/{{WORDS}}/g, `${Math.round(minutes * 140)}–${Math.round(minutes * 160)}`);

console.log(`✍️  ${revising ? "Revising" : "Writing"} the script for ${videoId} (${model}, ~${minutes} min)...`);
const r = runAgent({
  prompt, model, maxTurns: 30, cwd: REPO,
  tools: ["Read", "Write", "Bash(python3 workflow/02-scripting/yt-script/hookscore.py:*)"],
  logPath: path.join(dir, `write_${Date.now()}.log`),
});
recordTiming(ws, { step: revising ? "write script (revision)" : "write script", ms: r.durationMs, model, costUsd: r.costUsd, inputTokens: r.inputTokens, outputTokens: r.outputTokens, cacheReadTokens: r.cacheReadTokens });
console.log(`   ${formatDuration(r.durationMs)}, ${r.numTurns} turns, $${r.costUsd.toFixed(2)}${r.ok ? "" : ` — run failed, see ${r.logPath}`}`);
if (!fs.existsSync(F.script) || !/^\*\*VO:\*\*/im.test(fs.readFileSync(F.script, "utf-8"))) {
  console.error("❌ no usable script_raw.md was written");
  process.exit(1);
}
if (onlyParts) {
  // enforce it: the untouched parts come from the previous script, whatever the model did to them
  const was = splitParts(oldScript), now = splitParts(fs.readFileSync(F.script, "utf-8"));
  if (now.parts.length !== was.parts.length) {
    fs.writeFileSync(F.script, oldScript);
    console.error(`❌ the writer changed the number of parts (${was.parts.length} → ${now.parts.length}); the previous script is restored. Run again, or edit by hand.`);
    process.exit(1);
  }
  const touched = was.parts.map((p, i) => (onlyParts.includes(i + 1) ? now.parts[i] : p));
  const strayEdits = was.parts.filter((p, i) => !onlyParts.includes(i + 1) && p !== now.parts[i]).length;
  fs.writeFileSync(F.script, was.head + touched.join(""));
  console.log(`✂️  revised part(s) ${onlyParts.join(", ")} only${strayEdits ? ` (the writer also touched ${strayEdits} other part(s): those edits were discarded)` : ""}`);
}
console.log(`✅ ${path.relative(REPO, F.script)} + ${path.relative(REPO, F.notes)}`);
console.log(`   Review it (edit freely, or write feedback.md and run again), then: bun run write --video ${videoId} --approve`);
