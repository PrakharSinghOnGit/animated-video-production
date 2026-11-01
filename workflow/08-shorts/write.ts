/**
 * Shorts script stage: the long video's approved script + its sourced figures → 2–3 standalone short scripts (≤ 60 s),
 * one nested workspace each, then the creator approves each script before any voice (same gate as the long video).
 *
 * Usage: bun run shorts:write --video <VID> [--count 3] [--model opus|sonnet] [--force]   write all shorts (paid, ~$0.5–1.5)
 *        bun run shorts:write --video <VID> --short S2 [--model ...]                     revise one with S2/02-scripting/feedback.md
 *        bun run shorts:write --video <VID> --approve S1|S1,S3|all                       approve scripts (only the creator decides)
 *        bun run shorts:write --video <VID> --check                                      re-run the checks after a hand edit
 *        bun run shorts:write --video <VID> --status
 *        add --dry-run to print the writer's brief without running it (free)
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { runAgent } from "../05-video/src/lib/agent";
import { roleModel } from "../lib/models";
import { loadPrompt } from "../learning/lessons";
import { recordTiming, formatDuration } from "../05-video/src/lib/timings";
import { planNumbers, numberProblems, BANNED, readText } from "../07-publish/lib";
import {
  REPO, WS_ROOT, SHORT_ID, MIN_WORDS, MAX_WORDS, shortsDir, shortWs, shortVideoId, indexPath, listShorts, readJson, exists, mtime,
  spokenWords, spokenText, approvalState, scaffoldShort, linkWorkspaces, type ShortEntry,
} from "./lib";

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 && !args[i + 1]?.startsWith("--") ? args[i + 1] : undefined; };
const vid = flag("--video") ?? flag("-v");
if (!vid || !exists(path.join(WS_ROOT, vid, "02-scripting"))) {
  console.error("Usage: bun run shorts:write --video <VID> [--count 3] [--model opus|sonnet] [--short S2] [--force] | --approve S1|all | --check | --status");
  process.exit(1);
}
const parent = path.join(WS_ROOT, vid);
const dir = shortsDir(vid);
const plan = readJson(path.join(parent, "05-video", "acts.json"));
const pn = planNumbers(plan);

/** Check one short against the rules the writer was given; writes S/02-scripting/short.json. */
function check(entry: ShortEntry): ShortEntry {
  const ws = shortWs(vid!, entry.id), script = readText(path.join(ws, "02-scripting", "script_raw.md"));
  const errors: string[] = [], warnings: string[] = [];
  if (!/^\*\*VO:\*\*/im.test(script)) errors.push("no **VO:** lines in script_raw.md");
  const words = spokenWords(script);
  if (words > MAX_WORDS) errors.push(`${words} spoken words: over ${MAX_WORDS} (the short would run past 60 s)`);
  if (words < MIN_WORDS) warnings.push(`${words} spoken words: under ${MIN_WORDS}, likely under 25 s`);
  const np = numberProblems(spokenText(script), pn);
  if (plan && np.missing.length) errors.push(`numbers not in the long video's sourced plan: ${[...new Set(np.missing)].join(", ").replace(/,(?=,|$)/g, "")}`);
  if (!plan) warnings.push("the long video has no acts.json yet: numbers could not be checked against its sources");
  if (np.unverified.length) warnings.push(`sourced only from the narration, fact-check: ${[...new Set(np.unverified)].join(", ").replace(/,(?=,|$)/g, "")}`);
  for (const d of entry.data ?? []) if (!d.source?.trim()) errors.push(`data "${d.label}" has no source`);
  if (BANNED.test(spokenText(script)) || BANNED.test(entry.title ?? "")) errors.push("get-rich wording (guaranteed / secret / overnight / get rich …)");
  if (!entry.title) errors.push("no title");
  else if (entry.title.length > 100) errors.push(`title is ${entry.title.length} characters (max 100)`);
  else if (entry.title.length > 60) warnings.push(`title is ${entry.title.length} characters; Shorts show ~40–60`);
  const tags = entry.hashtags ?? [];
  if (tags.length !== 3 || tags[0]?.toLowerCase() !== "#shorts") warnings.push(`hashtags: want 3 with #Shorts first, got ${tags.join(" ") || "none"}`);
  const out = { ...entry, words, checks: { errors, warnings } };
  fs.writeFileSync(path.join(ws, "02-scripting", "short.json"), JSON.stringify(out, null, 2), "utf-8");
  return out;
}

function report(entries: ShortEntry[]): boolean {
  let ok = true;
  for (const e of entries) {
    const c = e.checks!, state = approvalState(shortWs(vid!, e.id));
    console.log(`${c.errors.length ? "❌" : "✅"} ${e.id} [${e.kind}] ${e.title}  (${e.words} words, ~${Math.round(e.words / 2.5)} s, ${state})`);
    for (const x of c.errors) console.log(`     ✖ ${x}`);
    for (const x of c.warnings) console.log(`     ⚠ ${x}`);
    if (c.errors.length) ok = false;
  }
  return ok;
}

const index = () => readJson<{ shorts: ShortEntry[]; notes?: string }>(indexPath(vid!));

if (args.includes("--status")) {
  const ix = index();
  if (!ix) { console.log(`${vid}: no shorts yet (bun run shorts:write --video ${vid})`); process.exit(0); }
  report(ix.shorts.map((s) => readJson<ShortEntry>(path.join(shortWs(vid, s.id), "02-scripting", "short.json")) ?? check(s)));
  process.exit(0);
}

if (args.includes("--check")) {
  const ix = index();
  if (!ix) { console.error("❌ no shorts.json"); process.exit(1); }
  process.exit(report(ix.shorts.map(check)) ? 0 : 1);
}

if (args.includes("--approve")) {
  const which = (flag("--approve") ?? "all").toUpperCase();
  const ids = which === "ALL" ? listShorts(vid) : which.split(",");
  for (const sid of ids) {
    if (!SHORT_ID.test(sid) || !exists(shortWs(vid, sid))) { console.error(`❌ no short ${sid}`); process.exit(1); }
    // re-check first: the script may have been edited by hand since the last check
    const entry = index()?.shorts.find((x) => x.id === sid);
    const sj = entry ? check(entry) : readJson<ShortEntry>(path.join(shortWs(vid, sid), "02-scripting", "short.json"));
    if (sj?.checks?.errors.length) console.warn(`⚠️  ${sid} has failed checks (approving anyway, the creator decides): ${sj.checks.errors.join("; ")}`);
    // the long video's approval writer: same approved.json (sha256 of script_raw.md) that tts:format checks
    const r = spawnSync("bun", ["run", path.join(REPO, "workflow/02-scripting/write_script.ts"), "--video", shortVideoId(vid, sid), "--approve"], { cwd: REPO, stdio: "inherit" });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
  console.log(`Next: bun run shorts --video ${vid} --short ${ids[0]} (voice → align → plan → act → sound → render)`);
  process.exit(0);
}

// ───────────── write / revise (paid) ─────────────
const parentScript = path.join(parent, "02-scripting", "script_raw.md");
if (!exists(parentScript)) { console.error(`❌ the long video has no script: ${path.relative(REPO, parentScript)}`); process.exit(1); }
if (approvalState(parent) !== "approved" && exists(path.join(parent, "02-scripting", "idea.md")))
  console.warn("⚠️  the long video's script is not approved (or changed since): the shorts will be cut from it anyway");
if (!plan) console.warn("⚠️  no 05-video/acts.json: there are no sourced figures, so the shorts must not state numbers");

const one = flag("--short")?.toUpperCase();
const count = Math.min(5, Math.max(1, parseInt(flag("--count") ?? "3", 10)));
const model = roleModel("shortsWriter", flag("--model"));
const existing = listShorts(vid);
if (!one && existing.length && !args.includes("--force")) {
  console.error(`❌ ${existing.length} short(s) exist (${existing.join(", ")}). Revise one: --short S2 (reads S2/02-scripting/feedback.md), or rewrite all: --force`);
  process.exit(1);
}
if (one && !existing.includes(one)) { console.error(`❌ no short ${one} (have: ${existing.join(", ") || "none"})`); process.exit(1); }

const stamp = Date.now();
const targets = one ? [one] : Array.from({ length: count }, (_, i) => `S${i + 1}`);

const allFeedback = path.join(dir, "feedback.md");
let previous = "";
if (one) {
  const fb = path.join(shortWs(vid, one), "02-scripting", "feedback.md");
  if (!exists(fb) || mtime(fb) < mtime(path.join(shortWs(vid, one), "02-scripting", "script_raw.md"))) console.warn(`⚠️  no new ${path.relative(REPO, fb)}: revising without notes`);
  previous = `6. This is a **revision of ${one} only**. Its previous script: \`${path.join(shortWs(vid, one), "02-scripting", `script_raw.${stamp}.bak.md`)}\`; the creator's notes: \`${fb}\` (apply every point). Rewrite only ${one}'s script_raw.md, and Write the index back with ${one}'s entry updated and every other entry unchanged (current index: \`${indexPath(vid)}\`).`;
} else if (exists(allFeedback)) {
  previous = `6. The creator's notes for these shorts (apply them): \`${allFeedback}\`.`;
}
const figures = pn.lines.length ? pn.lines.map((l) => `   - ${l}`).join("\n") : "   (none: the long video has no sourced plan yet. State no numbers except ones the long script says, and list them in notes.)";
const prompt = loadPrompt("SHORTS_WRITER", { video: parent })
  .replace(/{{COUNT}}/g, String(one ? existing.length : count)).replace(/{{SCRIPT}}/g, parentScript)
  .replace(/{{IDEA}}/g, exists(path.join(parent, "02-scripting", "idea.md")) ? path.join(parent, "02-scripting", "idea.md") : "(none)")
  .replace(/{{FIGURES}}/g, figures).replace(/{{PREVIOUS}}/g, previous).replace(/{{SHORTS_DIR}}/g, dir).replace(/{{INDEX}}/g, indexPath(vid))
  .replace(/{{MIN_WORDS}}/g, String(MIN_WORDS)).replace(/{{MAX_WORDS}}/g, String(MAX_WORDS));
if (args.includes("--dry-run")) { console.log(prompt); process.exit(0); }   // free: show the brief the writer would get

fs.mkdirSync(dir, { recursive: true });
for (const sid of targets) {
  const s = path.join(shortWs(vid, sid), "02-scripting", "script_raw.md");
  if (exists(s)) fs.copyFileSync(s, s.replace(/\.md$/, `.${stamp}.bak.md`));
  fs.rmSync(path.join(shortWs(vid, sid), "02-scripting", "approved.json"), { force: true });   // a new script needs a new approval
}
if (exists(indexPath(vid))) fs.copyFileSync(indexPath(vid), indexPath(vid).replace(/\.json$/, `.${stamp}.bak.json`));
if (!one) for (const sid of existing.filter((s) => !targets.includes(s))) console.warn(`⚠️  ${sid} is not part of the new set: its folder is left as is (delete it by hand if unwanted)`);
for (const sid of targets) scaffoldShort(vid, sid);   // the writer writes into S<n>/02-scripting/

console.log(`✂️  ${one ? `Revising ${one}` : `Writing ${count} shorts`} for ${vid} (${model})...`);
const r = runAgent({
  prompt, model, maxTurns: 30, cwd: REPO, tools: ["Read", "Write", "Bash(python3 workflow/02-scripting/yt-script/hookscore.py:*)"],
  logPath: path.join(dir, `write_${stamp}.log`),
});
recordTiming(parent, { step: one ? `shorts write (${one} revision)` : "shorts write", ms: r.durationMs, model, costUsd: r.costUsd, inputTokens: r.inputTokens, outputTokens: r.outputTokens, cacheReadTokens: r.cacheReadTokens });
console.log(`   ${formatDuration(r.durationMs)}, ${r.numTurns} turns, $${r.costUsd.toFixed(2)}${r.ok ? "" : ` — run failed, see ${r.logPath}`}`);

const ix = index();
if (!ix?.shorts?.length) { console.error(`❌ no usable ${path.relative(REPO, indexPath(vid))} was written`); process.exit(1); }
const fresh = ix.shorts.map((s) => s.id).filter((sid) => SHORT_ID.test(sid)).map((sid) => scaffoldShort(vid, sid)).some(Boolean);
if (fresh || !one) linkWorkspaces();
const ok = report(ix.shorts.map(check));
if (ix.notes) console.log(`\n📝 ${ix.notes}`);
console.log(`\nReview the scripts in ${path.relative(REPO, dir)}/S*/02-scripting/script_raw.md (edit freely, then --check), or write S<n>/02-scripting/feedback.md and run --short S<n>.`);
console.log(`Approve: bun run shorts:write --video ${vid} --approve S1   (or all)`);
process.exit(ok ? 0 : 1);
