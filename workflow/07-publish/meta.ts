/**
 * Publish: titles, description and tags (paid). The model writes 3 packages (title + the brief of the thumbnail that pairs with it),
 * the opening of the description and the tags; this script computes everything that has rules (chapters, sources, credits,
 * disclaimer, limits, numbers) and writes 07-publish/metadata.json + description.txt.
 *
 * Usage: bun run meta --video <ID> [--model sonnet|opus|haiku] [--notes] [--force]
 *   --notes  revise the current metadata with your notes (07-publish/notes/meta.md) instead of writing from scratch
 *   --force  overwrite metadata you edited in the dashboard (otherwise it is kept)
 * The brief is workflow/prompts/META.md; the rules are workflow/07-publish/GUIDE.md.
 */
import fs from "node:fs";
import path from "node:path";
import { runAgentAsync, extractJson } from "../05-video/src/lib/agent";
import { recordTiming, formatDuration } from "../05-video/src/lib/timings";
import { REPO, VARIANTS, GUIDE, wsDir, pubDir, pubFile, readJson, readText, videoSeconds, buildChapters, sourceLines, creditLines, buildDescription, fitTags, planNumbers, checkTitles, checkTags, checkDescription, type Metadata, type Package, type Variant } from "./lib";

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const videoId = flag("--video") ?? flag("-v");
const model = flag("--model") ?? "sonnet";
if (!videoId || !["sonnet", "opus", "haiku"].includes(model)) {
  console.error("Usage: bun run meta --video <ID> [--model sonnet|opus|haiku] [--notes]");
  process.exit(1);
}
const ws = wsDir(videoId);
if (!fs.existsSync(path.join(ws, "05-video/acts.json")) || !fs.existsSync(path.join(ws, "02-scripting/script_raw.md"))) {
  console.error(`❌ ${videoId} needs a script and a plan (02-scripting/script_raw.md, 05-video/acts.json)`);
  process.exit(1);
}
fs.mkdirSync(pubFile(videoId, "notes"), { recursive: true });
const metaFile = pubFile(videoId, "metadata.json");
const old = readJson<Metadata>(metaFile);
const notes = args.includes("--notes") ? readText(pubFile(videoId, "notes/meta.md")).trim() : "";
if (args.includes("--notes") && (!notes || !old)) {
  console.error("❌ --notes needs existing metadata and a non-empty 07-publish/notes/meta.md");
  process.exit(1);
}

if (old?.edited && !notes && !args.includes("--force")) {
  console.log("⏩ the metadata was edited in the dashboard: kept (--force overwrites it, --notes revises it)");
  process.exit(0);
}

const plan = readJson<any>(path.join(ws, "05-video/acts.json"));
const pn =planNumbers(plan);
const durationS = videoSeconds(videoId);

/** The model's opening paragraph of an existing description: everything before the first chapter line. */
function bodyOf(m: Metadata): string {
  const i = m.description.search(/^\s*\d{1,2}:\d{2}\s/m);
  return (i > 0 ? m.description.slice(0, i) : m.description).trim();
}

const brief = fs.readFileSync(path.join(REPO, "workflow/prompts/META.md"), "utf-8");
const task = `${brief}

# This video
Video: ${videoId}. Working title in the plan: ${plan?.video?.title ?? "(none)"}. Length: ${Math.floor(durationS / 60)}:${String(Math.round(durationS % 60)).padStart(2, "0")}.
Read first: ${GUIDE}
Script (what the narration says): ${path.join(ws, "02-scripting/script_raw.md")}
Script notes (numbers to verify): ${path.join(ws, "02-scripting/script_notes.md")}
Plan (treatment, acts, sourced data): ${path.join(ws, "05-video/acts.json")}
Sources: ${path.join(ws, "05-video/sources.md")} (may be empty: the plan's data carries the sources)

## Figures you may use in a title (from the plan's data)
${pn.lines.join("\n") || "(none)"}
${old && notes ? `\n# Revision\nThe current metadata is below; apply the creator's notes and keep everything they did not mention.\n\nCurrent:\n${JSON.stringify({ packages: old.titles, descriptionBody: bodyOf(old), tags: old.tags, hashtags: old.hashtags }, null, 1)}\n\nCreator's notes:\n${notes}\n` : ""}`;

function validate(j: any): { errors: string[]; warnings: string[] } {
  if (!j?.packages || !VARIANTS.every((v) => typeof j.packages[v]?.title === "string")) return { errors: ["the reply needs packages A, B and C, each with a title"], warnings: [] };
  const errors: string[] = [];
  const t = checkTitles(j.packages, pn);
  const tags = checkTags(fitTags(j.tags ?? []), j.hashtags ?? []);
  if (typeof j.descriptionBody !== "string" || j.descriptionBody.trim().length < 80) errors.push("descriptionBody is missing or too short");
  return { errors: [...errors, ...t.errors, ...tags.errors], warnings: t.warnings };
}

console.log(`✍️  Writing titles + description (${model}${notes ? ", revising with your notes" : ""})...`);
const logPath = pubFile(videoId, "logs/meta.log");
let r = await runAgentAsync({ prompt: task, model, tools: ["Read"], maxTurns: 20, logPath, cwd: REPO });
let cost = r.costUsd, ms = r.durationMs, toks = { i: r.inputTokens, o: r.outputTokens, c: r.cacheReadTokens };
let json: any = null;
try { json = extractJson(r.text); } catch {}
let v = json ? validate(json) : { errors: ["the reply had no JSON"], warnings: [] as string[] };
if (v.errors.length && r.sessionId) {
  // one fix round in the same session: the errors are mechanical (a number, a length, a hashtag count)
  console.log(`   ${v.errors.length} problem(s), one fix round:\n${v.errors.map((e) => `   - ${e}`).join("\n")}`);
  r = await runAgentAsync({ prompt: `Fix these problems and reply again with the complete JSON object only:\n${v.errors.map((e) => `- ${e}`).join("\n")}`, model, tools: ["Read"], maxTurns: 10, resume: r.sessionId, logPath: logPath.replace(/\.log$/, ".fix.log"), cwd: REPO });
  cost += r.costUsd; ms += r.durationMs; toks = { i: toks.i + r.inputTokens, o: toks.o + r.outputTokens, c: toks.c + r.cacheReadTokens };
  try { json = extractJson(r.text); } catch { json = null; }
  v = json ? validate(json) : { errors: ["the fix reply had no JSON"], warnings: [] };
}
recordTiming(ws, { step: `meta (${model})${notes ? " notes" : ""}`, ms, model, costUsd: cost, inputTokens: toks.i, outputTokens: toks.o, cacheReadTokens: toks.c });
if (!json || v.errors.length) {
  console.error(`❌ the metadata is not usable (log: ${path.relative(process.cwd(), logPath)})\n${v.errors.map((e) => `   - ${e}`).join("\n")}`);
  process.exit(1);
}

// Everything with rules is computed here
const ch = buildChapters(videoId, durationS * 1000);
const src = sourceLines(videoId);
const tags = fitTags(json.tags ?? []);
const hashtags: string[] = (json.hashtags ?? []).slice(0, 3);
const description = buildDescription({ body: json.descriptionBody, chapters: ch.chapters, sources: src.lines, sourcesNote: src.verified ? undefined : "check each before publishing", credits: creditLines(videoId), hashtags });
const dcheck = checkDescription(description), tcheck = checkTags(tags, hashtags);
const titles = Object.fromEntries(VARIANTS.map((k) => {
  const p = json.packages[k];
  const type = ["searchable", "curiosity", "number"].includes(p.type) ? p.type : "curiosity";
  return [k, { title: String(p.title).trim(), type, rationale: String(p.rationale ?? ""), thumbnail: String(p.thumbnail ?? ""), hypothesis: String(p.hypothesis ?? "") } satisfies Package];
})) as Record<Variant, Package>;
const checks = { errors: [...dcheck.errors, ...tcheck.errors], warnings: [...v.warnings, ...dcheck.warnings, ...tcheck.warnings, ...ch.warnings, ...src.warnings] };
const meta: Metadata = { video: videoId, at: new Date().toISOString(), model, durationS, titles, description, chapters: ch.chapters, tags, hashtags, checks };
fs.mkdirSync(pubDir(videoId), { recursive: true });
fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2), "utf-8");
fs.writeFileSync(pubFile(videoId, "description.txt"), description, "utf-8");
console.log(`✅ metadata in ${formatDuration(ms)}, $${cost.toFixed(2)}`);
for (const k of VARIANTS) console.log(`   ${k} [${titles[k].type}] (${titles[k].title.length}) ${titles[k].title}\n      thumbnail: ${titles[k].thumbnail}`);
console.log(`   ${ch.chapters.length} chapters, ${tags.length} tags, description ${description.length} characters`);
for (const w of checks.warnings) console.log(`   ⚠ ${w}`);
for (const e of checks.errors) console.log(`   ✗ ${e}`);
