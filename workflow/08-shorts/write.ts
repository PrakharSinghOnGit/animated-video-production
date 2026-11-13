/**
 * Shorts script stage: the long video's approved script + its sourced figures → 2–3 standalone short scripts (60 s by default),
 * one nested workspace each, then the creator approves each script before any voice (same gate as the long video).
 *
 * Usage: bun run shorts:write --video <VID> [--count 3] [--model opus|sonnet] [--force]   write all shorts (paid, ~$0.5–1.5)
 *        bun run shorts:write --video <VID> --short S2 [--model ...]                     revise one with S2/02-scripting/feedback.md
 *        bun run shorts:write --video <VID> --add [--idea "..."] [--model ...]             write ONE more short, different from the existing ones (paid, ~$0.3–0.8)
 *        bun run shorts:write --video <VID> --add --blank [--idea "..."]                   add an empty short you write yourself (free)
 *        bun run shorts:write --video <VID> --remove S2                                   delete a short (its folder goes to shorts/.removed/)
 *        bun run shorts:write --video <VID> --approve S1|S1,S3|all                       approve scripts (only the creator decides)
 *        bun run shorts:write --video <VID> --check                                      re-run the checks after a hand edit
 *        bun run shorts:write --video <VID> --status
 *        --length 60|90|120|160|180   the length limit in seconds for the shorts written (default 60; Revise keeps the short's own;
 *                                     YouTube Shorts and Reels allow up to 3 min). Stored in each short's config.json "maxS".
 *        add --series to a set: the shorts are Parts 1..N of one story, in order (kept for later Add/Revise)
 *
 * A shorts project (SH<n>_<Name>, no long video) writes from its brief, 02-scripting/idea.md, instead of a long script:
 *        bun run shorts:write --video SH01_Fed_Cut --count 1      one short     |  --count 3 --series   a three-part series
 *        add --dry-run to print the writer's brief without running it (free)
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { runAgentAsync } from "../05-video/src/lib/agent";
import { roleModel } from "../lib/models";
import { loadPrompt } from "../learning/lessons";
import { recordTiming, formatDuration } from "../05-video/src/lib/timings";
import { planNumbers, numberProblems, BANNED, readText } from "../07-publish/lib";
import { applyAccepted } from "../lib/accepted";
import { researchNote, verifiedResearchText } from "../02-scripting/research_lib";
import { hookscoreTools } from "../02-scripting/hookscore";
import { lengthLabel, SHORT_LENGTHS, SHORT_CAP_S } from "../05-video/src/lib/format";
import {
  REPO, WS_ROOT, SHORT_ID, MIN_WORDS, maxWords, lengthOf, setLength, shortsDir, shortWs, shortVideoId, indexPath, listShorts, readJson, exists, mtime,
  spokenWords, spokenText, approvalState, scaffoldShort, linkWorkspaces, isShortsProject, briefPath, briefNumbers, briefWritten, type ShortEntry,
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
/** A shorts project: no long video, the shorts are written from the creator's brief (its numbers are the allowed ones). */
const standalone = isShortsProject(vid);
const brief = standalone ? readText(briefPath(vid)) : "";
const plan = standalone ? null : readJson(path.join(parent, "05-video", "acts.json"));
// a shorts project may also say the numbers of its ✓ web research facts
const pn = standalone ? briefNumbers(`${brief}\n${verifiedResearchText(parent)}`) : planNumbers(plan);

/** Check one short against the rules the writer was given; writes S/02-scripting/short.json. */
function check(entry: ShortEntry): ShortEntry {
  const ws = shortWs(vid!, entry.id), script = readText(path.join(ws, "02-scripting", "script_raw.md"));
  const errors: string[] = [], warnings: string[] = [];
  if (!/^\*\*VO:\*\*/im.test(script)) errors.push("no **VO:** lines in script_raw.md");
  const words = spokenWords(script), maxS = lengthOf(vid!, entry.id), cap = maxWords(maxS);
  // the chosen length is a target; only past the platforms' 3 min cap is an error. A longer script that still fits
  // (e.g. notes asked for "make it 2 min") moves the short up to the next offered length, so the director, act check and QC agree
  if (words > maxWords(SHORT_CAP_S)) errors.push(`${words} spoken words: over ${maxWords(SHORT_CAP_S)} (the short would run past the platforms' ${lengthLabel(SHORT_CAP_S)} cap)`);
  else if (words > cap) {
    const fit = SHORT_LENGTHS.find((l) => l > maxS && maxWords(l) >= words) ?? SHORT_CAP_S;
    setLength(vid!, entry.id, fit);
    warnings.push(`${words} spoken words: over ${cap} for ${lengthLabel(maxS)}, so the short's length is now ${lengthLabel(fit)}`);
  }
  if (words < MIN_WORDS) warnings.push(`${words} spoken words: under ${MIN_WORDS}, likely under 25 s`);
  const np = numberProblems(spokenText(script), pn);
  if (np.missing.length && (plan || standalone)) errors.push(`numbers not in ${standalone ? "your brief (02-scripting/idea.md) or its ✓ research facts" : "the long video's sourced plan"}: ${[...new Set(np.missing)].join(", ").replace(/,(?=,|$)/g, "")}`);
  if (!plan && !standalone) warnings.push("the long video has no acts.json yet: numbers could not be checked against its sources");
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
    // errors the creator accepted (dashboard → Accept) are shown but no longer fail
    const c = applyAccepted(shortWs(vid!, e.id), "script", e.checks!), state = approvalState(shortWs(vid!, e.id));
    console.log(`${c.errors.length ? "❌" : "✅"} ${e.id} [${e.kind}] ${e.title}  (${e.words} words, ~${Math.round(e.words / 2.5)} s, ${state})`);
    for (const x of c.errors) console.log(`     ✖ ${x}`);
    for (const x of c.warnings) console.log(`     ⚠ ${x}`);
    for (const x of c.accepted ?? []) console.log(`     ✓ accepted by you: ${x}`);
    if (c.errors.length) ok = false;
  }
  return ok;
}

const index = () => readJson<{ shorts: ShortEntry[]; notes?: string; series?: boolean; maxS?: number }>(indexPath(vid!));

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
    if (sj?.checks) sj.checks = applyAccepted(shortWs(vid, sid), "script", sj.checks);
    if (sj?.checks?.errors.length) console.warn(`⚠️  ${sid} has failed checks (approving anyway, the creator decides): ${sj.checks.errors.join("; ")}`);
    // the long video's approval writer: same approved.json (sha256 of script_raw.md) that tts:format checks
    const r = spawnSync("bun", ["run", path.join(REPO, "workflow/02-scripting/write_script.ts"), "--video", shortVideoId(vid, sid), "--approve"], { cwd: REPO, stdio: "inherit" });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
  console.log(`Next: bun run shorts --video ${vid} --short ${ids[0]} (voice → align → plan → act → sound → render)`);
  process.exit(0);
}

if (args.includes("--remove")) {
  const sid = (flag("--remove") ?? "").toUpperCase();
  if (!SHORT_ID.test(sid) || !exists(shortWs(vid, sid))) { console.error(`❌ no short ${sid}`); process.exit(1); }
  const bin = path.join(dir, ".removed"), to = path.join(bin, `${sid}-${Date.now()}`);
  fs.mkdirSync(bin, { recursive: true });
  fs.renameSync(shortWs(vid, sid), to);
  const ix = index();
  if (ix) { ix.shorts = ix.shorts.filter((x) => x.id !== sid); fs.writeFileSync(indexPath(vid), JSON.stringify(ix, null, 2), "utf-8"); }
  console.log(`🗑  removed ${sid} (kept in ${path.relative(REPO, to)}; move it back to restore)`);
  process.exit(0);
}

/** Next free id: one past the highest ever used (removed ones included), so a new short never takes an old one's name. */
function nextId(): string {
  const used = [...listShorts(vid!), ...(exists(path.join(dir, ".removed")) ? fs.readdirSync(path.join(dir, ".removed")).map((n) => n.split("-")[0]) : [])];
  return `S${Math.max(0, ...used.filter((x) => SHORT_ID.test(x)).map((x) => parseInt(x.slice(1), 10))) + 1}`;
}
const adding = args.includes("--add"), idea = flag("--idea")?.trim();
// the length limit for the shorts this run writes: --length, else the set's (index), else 60 s; Revise keeps the short's own
const lengthArg = flag("--length");
const length = lengthArg && lengthArg !== "keep" && lengthArg !== "set" ? Number(lengthArg) : undefined;   // keep / set: no change
if (length !== undefined && !(Number.isInteger(length) && length >= 15 && length <= 180)) { console.error("❌ --length is seconds, 15–180 (e.g. 60, 90, 120, 160, 180)"); process.exit(1); }
const setLengthS = length ?? index()?.maxS ?? 60;

if (adding && args.includes("--blank")) {
  const sid = nextId();
  scaffoldShort(vid, sid);
  setLength(vid, sid, setLengthS);
  const sp = path.join(shortWs(vid, sid), "02-scripting", "script_raw.md");
  if (!exists(sp)) fs.writeFileSync(sp, `### Part 1: ${idea ?? "Untitled short"}\n**VO:** \`[VO: punchy, fast]\` \n**[ON SCREEN]:** \n`, "utf-8");
  const ix = index() ?? { shorts: [] };
  const entry: ShortEntry = { id: sid, kind: "custom", title: idea ?? "", hook: "", payoff: "", loop: "", words: 0, data: [], description: "", hashtags: ["#Shorts"] };
  ix.shorts = [...ix.shorts.filter((x) => x.id !== sid), entry];
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(indexPath(vid), JSON.stringify(ix, null, 2), "utf-8");
  check(entry); linkWorkspaces();
  console.log(`➕ ${sid} added (empty): write its script in ${path.relative(REPO, sp)}, then Check scripts and approve it.`);
  process.exit(0);
}

// ───────────── write / revise (paid) ─────────────
const parentScript = path.join(parent, "02-scripting", "script_raw.md");
if (standalone) {
  if (!briefWritten(vid)) { console.error(`❌ write the brief first: ${path.relative(REPO, briefPath(vid))} (what happened, the angle, every fact with its source)`); process.exit(1); }
} else {
  if (!exists(parentScript)) { console.error(`❌ the long video has no script: ${path.relative(REPO, parentScript)}`); process.exit(1); }
  if (approvalState(parent) !== "approved" && exists(path.join(parent, "02-scripting", "idea.md")))
    console.warn("⚠️  the long video's script is not approved (or changed since): the shorts will be cut from it anyway");
  if (!plan) console.warn("⚠️  no 05-video/acts.json: there are no sourced figures, so the shorts must not state numbers");
}

const one = flag("--short")?.toUpperCase();
const count = Math.min(5, Math.max(1, parseInt(flag("--count") ?? "3", 10)));
const model = roleModel("shortsWriter", flag("--model"));
const existing = listShorts(vid);
if (!one && !adding && existing.length && !args.includes("--force")) {
  console.error(`❌ ${existing.length} short(s) exist (${existing.join(", ")}). Revise one: --short S2 (reads S2/02-scripting/feedback.md), or rewrite all: --force`);
  process.exit(1);
}
if (one && !existing.includes(one)) { console.error(`❌ no short ${one} (have: ${existing.join(", ") || "none"})`); process.exit(1); }

const stamp = Date.now();
const added = adding ? nextId() : null;
const targets = one ? [one] : added ? [added] : Array.from({ length: count }, (_, i) => `S${i + 1}`);
/** This run's length limit: a revision keeps its short's own unless --length is given. */
const runLength = one && length === undefined ? lengthOf(vid, one) : setLengthS;

const allFeedback = path.join(dir, "feedback.md");
let previous = "";
if (one) {
  const fb = path.join(shortWs(vid, one), "02-scripting", "feedback.md");
  if (!exists(fb) || mtime(fb) < mtime(path.join(shortWs(vid, one), "02-scripting", "script_raw.md"))) console.warn(`⚠️  no new ${path.relative(REPO, fb)}: revising without notes`);
  previous = `6. This is a **revision of ${one} only**. Its previous script: \`${path.join(shortWs(vid, one), "02-scripting", `script_raw.${stamp}.bak.md`)}\`; the creator's notes: \`${fb}\` (apply every point). Rewrite only ${one}'s script_raw.md, and Write the index back with ${one}'s entry updated and every other entry unchanged (current index: \`${indexPath(vid)}\`).`;
} else if (added) {
  const others = (index()?.shorts ?? []).filter((x) => existing.includes(x.id));
  const list = others.length ? others.map((x) => `   - ${x.id} [${x.kind}] "${x.title}": hook "${x.hook}"; payoff "${x.payoff}"; script \`${path.join(shortWs(vid, x.id), "02-scripting", "script_raw.md")}\``).join("\n") : "   (none yet)";
  previous = `6. This **adds one new short, ${added}**, next to the ones that exist. Read their scripts first; the new one must not repeat any of them: a different kind if possible, a different hook shape, a different main number or example, a different payoff.\n${list}\n${idea ? `   The creator's idea for ${added} (follow it): ${idea}\n` : ""}   Write only ${added}'s script_raw.md, and Write the index back with every existing entry unchanged plus ${added}'s entry (current index: \`${indexPath(vid)}\`; if it does not exist, write it with ${added} only).${exists(allFeedback) ? ` The creator's notes for all shorts apply too: \`${allFeedback}\`.` : ""}`;
} else if (exists(allFeedback)) {
  previous = `6. The creator's notes for these shorts (apply them): \`${allFeedback}\`.`;
}
const figures = pn.lines.length ? pn.lines.map((l) => `   - ${l}`).join("\n") : "   (none: the long video has no sourced plan yet. State no numbers except ones the long script says, and list them in notes.)";
// a series (--series on a set; Add and Revise keep the set's choice): Parts 1..N of one story, in order
const series = one || adding ? !!index()?.series : args.includes("--series");
const parts = one ? existing.length : added ? existing.length + 1 : count;
const SERIES = !series ? "" : `
## Series
These shorts are **one series, in order: S1 is Part 1 … S${parts} is Part ${parts}** of one story. Each part still works alone (a viewer
may land on a later part first): Parts 2 and later fold a one-line catch-up into the hook, never a recap paragraph. Each part has its own
payoff. Every part but the last ends on the open question the next part answers, instead of the loop line (put that line in
"loop"); the last part loops back to Part 1's hook. Titles end with "(Part n)". Kinds may repeat across parts.${added ? ` ${added} is the new last part: if the part before it ends by looping back to Part 1, say in notes that it should now tease ${added}.` : ""}
`;
// what the shorts are written from: the long video (VID…) or the creator's brief (SH… shorts project)
const BLOCKS: Record<string, string> = standalone ? {
  INTRO: `You write **{{COUNT}} YouTube Shorts** (9:16, at most {{MAX_S}} each) for **The Wealth Gap** from the creator's brief: news, a market
move or an idea that does not need a full video. They are narrated by the channel's cloned voice over cut-paper motion graphics.
The aim: views and new viewers. Each short must work for someone who has never seen the channel; there is no long video behind it.`,
  SOURCES: `1. The creator's brief: \`${briefPath(vid)}\` (what happened, the angle, the facts with their sources: your only raw material).
2. The figures you may use are the ones in the brief, with the source it gives for each; anything else is off limits.
3. Dated news: use the date the brief gives when timing matters; never "today" or "yesterday" (a short is watched for weeks).${researchNote(parent, "shorts") ? `\n   ${researchNote(parent, "shorts")}` : ""}`,
  KINDS: `- **Different kinds** when the shorts are separate (a series may repeat kinds), unless the brief or the notes say otherwise:
  \`news\` (what happened, the one number, why it matters to the viewer), \`market\` (a move in a price, rate or index and the
  mechanism behind it), \`fact\` (one jaw-drop number explained), \`myth\` (a common belief, then the number that breaks it),
  \`math\` (a quick worked example the viewer can redo), \`story\` (one person or event, told tight).`,
  BRIDGE: `- **No bridge**: there is no long video to point at. Never "link in bio", never "subscribe".
- **Original wording.** Use the brief's facts, not its sentences: short sentences (≤ 16 words), direct, spoken.`,
  FIGURE_RULE: `- **Never invent a number, source, quote or event.** Every figure you say must be in the brief (same value; you may say
  410 thousand for 410000), and its \`data\` entry carries the source the brief gives. A number the brief gives without a source
  may be used but goes in the notes as a fact-check.`,
  FROM: "which part of the brief it comes from", DATA_SOURCE: "the source the brief gives for it, copied exactly",
} : {
  INTRO: `You turn one finished **Wealth Gap** long-form video into **{{COUNT}} standalone YouTube Shorts** (9:16, at most {{MAX_S}} each),
narrated by the same cloned voice over cut-paper motion graphics. The aims: Shorts bring **views and new viewers**; the long
video keeps them. Each short must work for someone who has never seen the channel, then make the long video the obvious next watch.`,
  SOURCES: `1. The long video's approved script: \`{{SCRIPT}}\` (what the channel actually says; your raw material).
2. The creator's original idea: \`{{IDEA}}\` (their angle and priorities).
3. The sourced figures you may use (the long video's plan; anything else is off limits):
{{FIGURES}}`,
  KINDS: `- **Different kinds**, one per short unless the creator's notes say otherwise. Pick the strongest {{COUNT}} for this video:
  \`fact\` (one jaw-drop number explained), \`myth\` (a common belief, then the number that breaks it), \`teaser\` (the long video's
  central question, a real partial answer, the rest is in the video), \`math\` (a quick worked example the viewer can redo),
  \`story\` (one person or event from the script, told tight).`,
  BRIDGE: `- **Bridge (optional, max one short clause)**: point at the long video by its topic ("the full breakdown is on the channel"),
  never "link in bio", never "subscribe".
- **Original wording.** Reuse the long script's facts, not its paragraphs: shorter sentences (≤ 16 words), more direct.`,
  FIGURE_RULE: `- **Never invent a number, source, quote or event.** Every figure you say must be in the figures list above (same value; you may
  say 410 thousand for 410000). A figure marked "narration only, unverified" may be used but goes in the notes as a fact-check.`,
  FROM: "which part/chapter of the long script it comes from", DATA_SOURCE: "copied exactly from the figures list",
};
const prompt = loadPrompt("SHORTS_WRITER", { video: parent })
  .replace(/{{(INTRO|SOURCES|KINDS|BRIDGE|FIGURE_RULE|FROM|DATA_SOURCE)}}/g, (_, k) => BLOCKS[k]).replace(/{{SERIES}}/g, SERIES)
  .replace(/{{COUNT}}/g, String(one ? existing.length : added ? 1 : count)).replace(/{{IDS}}/g, targets.join(", ")).replace(/{{SCRIPT}}/g, parentScript)
  .replace(/{{IDEA}}/g, exists(path.join(parent, "02-scripting", "idea.md")) ? path.join(parent, "02-scripting", "idea.md") : "(none)")
  .replace(/{{FIGURES}}/g, figures).replace(/{{PREVIOUS}}/g, previous).replace(/{{SHORTS_DIR}}/g, dir).replace(/{{INDEX}}/g, indexPath(vid))
  .replace(/{{MIN_WORDS}}/g, String(MIN_WORDS)).replace(/{{MAX_WORDS}}/g, String(maxWords(runLength))).replace(/{{MAX_S}}/g, lengthLabel(runLength))
  + (runLength > 60 ? `\n## Length\nThese shorts may run up to ${lengthLabel(runLength)} (YouTube Shorts and Reels allow up to 3 min). That is a ceiling, not a target: use the room only when the idea needs it; a tight 45 s short beats a padded long one. Past a minute, re-hook every ~20 s (a new number, a turn, a question) so viewers don't swipe away, and keep the payoff for the last third.\n` : "");
if (args.includes("--dry-run")) { console.log(prompt); process.exit(0); }   // free: show the brief the writer would get

fs.mkdirSync(dir, { recursive: true });
for (const sid of targets) {
  const s = path.join(shortWs(vid, sid), "02-scripting", "script_raw.md");
  if (exists(s)) fs.copyFileSync(s, s.replace(/\.md$/, `.${stamp}.bak.md`));
  fs.rmSync(path.join(shortWs(vid, sid), "02-scripting", "approved.json"), { force: true });   // a new script needs a new approval
}
if (exists(indexPath(vid))) fs.copyFileSync(indexPath(vid), indexPath(vid).replace(/\.json$/, `.${stamp}.bak.json`));
if (!one) for (const sid of existing.filter((s) => !targets.includes(s))) console.warn(`⚠️  ${sid} is not part of the new set: its folder is left as is (delete it by hand if unwanted)`);
for (const sid of targets) { scaffoldShort(vid, sid); if (!one || length !== undefined) setLength(vid, sid, runLength); }   // the writer writes into S<n>/02-scripting/

console.log(`✂️  ${one ? `Revising ${one}` : added ? `Adding ${added}` : `Writing ${count} shorts`} for ${vid} (${model})...`);
const r = await runAgentAsync({
  prompt, model, maxTurns: 30, cwd: REPO, tools: ["Read", "Write", ...hookscoreTools()],
  logPath: path.join(dir, `write_${stamp}.log`),
});
recordTiming(parent, { step: one ? `shorts write (${one} revision)` : added ? `shorts write (${added} added)` : "shorts write", ms: r.durationMs, model, costUsd: r.costUsd, inputTokens: r.inputTokens, outputTokens: r.outputTokens, cacheReadTokens: r.cacheReadTokens });
console.log(`   ${formatDuration(r.durationMs)}, ${r.numTurns} turns, $${r.costUsd.toFixed(2)}${r.ok ? "" : ` — run failed, see ${r.logPath}`}`);

const ix = index();
if (!ix?.shorts?.length) { console.error(`❌ no usable ${path.relative(REPO, indexPath(vid))} was written`); process.exit(1); }
// the set's series choice and length live in the index, so Add and Revise keep them
if (!!ix.series !== series || (!one && !adding && ix.maxS !== runLength)) {
  if (series) ix.series = true; else delete ix.series;
  if (!one && !adding) ix.maxS = runLength;
  fs.writeFileSync(indexPath(vid), JSON.stringify(ix, null, 2), "utf-8");
}
const fresh = ix.shorts.map((s) => s.id).filter((sid) => SHORT_ID.test(sid)).map((sid) => scaffoldShort(vid, sid)).some(Boolean);
if (fresh || !one) linkWorkspaces();
const ok = report(ix.shorts.map(check));
if (ix.notes) console.log(`\n📝 ${ix.notes}`);
console.log(`\nReview the scripts in ${path.relative(REPO, dir)}/S*/02-scripting/script_raw.md (edit freely, then --check), or write S<n>/02-scripting/feedback.md and run --short S<n>.`);
console.log(`Approve: bun run shorts:write --video ${vid} --approve S1   (or all)`);
process.exit(ok ? 0 : 1);
