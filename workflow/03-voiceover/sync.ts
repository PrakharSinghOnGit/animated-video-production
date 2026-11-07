#!/usr/bin/env bun
/**
 * Voice only what the script change touched.
 *
 *   bun run voice:sync --video <ID> [--dry] [--generate [voice flags...]]
 *
 * Run after the script was changed, approved again and split (tts:format). Each section of the new split is matched to
 * an existing take by its words (what the take was made from: its report in 03-voiceover/reports, else
 * audio/sections.json). A take with the same words is kept, and renamed when lines were added or removed before it
 * (files are named by position: NN_partP_KK_beat.wav), together with everything filed under that name: the untouched
 * copy (audio/raw), the report, its transcript (04-transcription/words), the review entry, the Speed & gaps and pause
 * scan records, and pauses for the picture placed on it. Takes whose words are no longer in the script go to
 * audio/stale/. What is left has no take: --generate voices exactly those sections (the other flags go to the voice
 * step: --engine, --voice, --takes...). Then run Align (it moves the plan to the new voice and lists the changed acts).
 *
 * A changed tone note alone keeps the take (listed, so you can redo it in Voice → Review if it matters).
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { resolveWorkspace, loadSections } from "./src/workspace";
import { normalizeForSpeech } from "./src/normalize";
import { readHolds, writeHolds } from "./src/holdlib";

const argv = process.argv.slice(2);
const flag = (n: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const video = flag("--video");
if (!video) { console.error("Usage: bun run voice:sync --video <ID> [--dry] [--generate [voice flags]]"); process.exit(1); }
const dry = argv.includes("--dry"), generate = argv.includes("--generate");
const ws = resolveWorkspace(video), root = ws.rootDir, audio = ws.audioDir;
const reportsDir = path.join(root, "03-voiceover", "reports"), wordsDir = path.join(root, "04-transcription", "words");
const readJson = <T,>(f: string, d: T): T => { try { return JSON.parse(fs.readFileSync(f, "utf-8")); } catch { return d; } };

const sections = await loadSections(ws);
const key = (t: string) => t.replace(/<[^>]*>/g, " ").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// existing takes, in order: part-N/NN_<id>.wav
type Take = { part: number; stem: string; id: string; idx: number; words: string; tone: string };
const partDirs = fs.existsSync(audio) ? fs.readdirSync(audio).filter((d) => /^part-\d+$/.test(d)) : [];
const oldRows: any[] = readJson(path.join(audio, "sections.json"), { sections: [] }).sections ?? [];
const takes: Take[] = partDirs.flatMap((d) => fs.readdirSync(path.join(audio, d)).filter((f) => /^\d+_.+\.wav$/.test(f)).map((f) => {
  const stem = f.replace(/\.wav$/, ""), id = stem.replace(/^\d+_/, ""), part = parseInt(d.slice(5), 10);
  const rep = readJson<any>(path.join(reportsDir, `${stem}.json`), null);
  let words = "", tone = "";
  if (rep?.chunks?.length) {
    words = key(rep.chunks.map((c: any) => c.text).join(" "));
    tone = /This passage: (.*?)\.?$/.exec(rep.style ?? "")?.[1] ?? "";
  } else {
    const row = oldRows.find((r) => r.file === `${d}/${f}`);
    if (row) { words = key(normalizeForSpeech(row.text, { keepDashes: true, keepTags: true })); tone = row.rawInstruction ?? row.tone ?? ""; }
  }
  return { part, stem, id, idx: parseInt(stem, 10), words, tone };
})).sort((a, b) => a.idx - b.idx);

// match each new section to an unused take with the same words (same name first, then the nearest in order)
const used = new Set<string>();
type Row = { i: number; sec: (typeof sections)[number]; stem: string; part: number; from?: Take; toneChanged?: boolean };
const rows: Row[] = sections.map((sec, i) => {
  const stem = `${String(i + 1).padStart(2, "0")}_${sec.id}`;
  // the words as each engine would have read them (Gemini keeps dashes and tags, Qwen not): either may match
  const want = new Set([key(normalizeForSpeech(sec.text, { keepDashes: true, keepTags: true })), key(normalizeForSpeech(sec.text))]);
  const cands = takes.filter((t) => !used.has(t.stem) && t.words && want.has(t.words));
  const from = cands.find((t) => t.stem === stem) ?? cands.sort((a, b) => Math.abs(a.idx - (i + 1)) - Math.abs(b.idx - (i + 1)))[0];
  if (from) used.add(from.stem);
  return { i, sec, stem, part: sec.part, from, toneChanged: !!from && !!from.tone && !!sec.rawInstruction && from.tone.trim() !== sec.rawInstruction.trim() };
});
const keep = rows.filter((r) => r.from && r.from.stem === r.stem && r.from.part === r.part);
const rename = rows.filter((r) => r.from && (r.from.stem !== r.stem || r.from.part !== r.part));
const voice = rows.filter((r) => !r.from);
const drop = takes.filter((t) => !used.has(t.stem));

console.log(`🎙  ${sections.length} sections: ${keep.length} keep their take, ${rename.length} keep it under a new name, ${voice.length} need voicing; ${drop.length} old take(s) no longer in the script`);
for (const r of rename) console.log(`   ↪ ${r.from!.stem} → ${r.stem}`);
for (const r of voice) console.log(`   🆕 ${r.sec.id}: ${r.sec.text.replace(/\s+/g, " ").slice(0, 90)}${r.sec.text.length > 90 ? "…" : ""}`);
for (const t of drop) console.log(`   🗑  ${t.stem} (moved to audio/stale/)`);
const toneOnly = rows.filter((r) => r.toneChanged);
if (toneOnly.length) console.log(`   ℹ️  tone note changed but same words (take kept; redo in Voice → Review if it matters): ${toneOnly.map((r) => r.sec.id).join(", ")}`);
if (dry) { console.log("(dry run: nothing moved)"); process.exit(0); }

// every file filed under a take's name
const filesOf = (part: number, stem: string) => [
  path.join(audio, `part-${part}`, `${stem}.wav`), path.join(audio, "raw", `part-${part}`, `${stem}.wav`),
  path.join(audio, "prev", `part-${part}`, `${stem}.wav`), path.join(reportsDir, `${stem}.json`), path.join(wordsDir, `${stem}.json`),
];
const tmp = path.join(audio, ".sync_tmp");
fs.rmSync(tmp, { recursive: true, force: true });
// 1. move every take that changes name, and every dropped one, out of the way (a new name can be an old take's name)
const moving = [...rename.map((r) => r.from!), ...drop];
for (const t of moving) filesOf(t.part, t.stem).forEach((f, k) => {
  if (!fs.existsSync(f)) return;
  const to = path.join(tmp, t.stem, String(k)); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.renameSync(f, to);
});
// 2. renamed takes to their new names (rename keeps the mtime, so Speed & gaps still knows them)
for (const r of rename) filesOf(r.part, r.stem).forEach((f, k) => {
  const from = path.join(tmp, r.from!.stem, String(k));
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(path.dirname(f), { recursive: true }); fs.renameSync(from, f);
});
// 3. dropped takes to audio/stale/<time>/ (kept, not deleted)
const staleDir = path.join(audio, "stale", new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19));
for (const t of drop) {
  const w = path.join(tmp, t.stem, "0");
  if (fs.existsSync(w)) { fs.mkdirSync(path.join(staleDir, `part-${t.part}`), { recursive: true }); fs.renameSync(w, path.join(staleDir, `part-${t.part}`, `${t.stem}.wav`)); }
}
fs.rmSync(tmp, { recursive: true, force: true });

// 4. records keyed by the take's name
const relOld = (t: Take) => `part-${t.part}/${t.stem}.wav`, relNew = (r: Row) => `part-${r.part}/${r.stem}.wav`;
const rekey = (file: string, field: string | null) => {
  const j = readJson<any>(file, null);
  if (!j) return;
  const obj = field ? j[field] : j;
  if (!obj) return;
  const moved: Record<string, unknown> = {};
  for (const r of rename) if (relOld(r.from!) in obj) moved[relNew(r)] = obj[relOld(r.from!)];
  for (const t of moving) delete obj[relOld(t)];
  Object.assign(obj, moved);
  fs.writeFileSync(file, JSON.stringify(j, null, 2));
};
rekey(path.join(audio, "post.json"), "files");
rekey(path.join(audio, "pauses.json"), "files");
// voice review notes are by section id; a renamed take keeps its note, a dropped one loses it
const reviewPath = path.join(root, "03-voiceover", "review.json");
const review = readJson<Record<string, any>>(reviewPath, {});
if (Object.keys(review).length) {
  const out: Record<string, any> = {};
  for (const r of [...keep, ...rename]) if (review[r.from!.id]) out[r.sec.id] = review[r.from!.id];
  fs.writeFileSync(reviewPath, JSON.stringify(out, null, 2));
}
// pauses for the picture sit on a take's words: they follow a renamed take, and go with a dropped one
const holds = readHolds(root);
const stemMap = new Map(rename.map((r) => [r.from!.stem, r.stem]));
const dropped = new Set(drop.map((t) => t.stem));
const lost = holds.holds.filter((h) => dropped.has(h.section));
holds.holds = holds.holds.filter((h) => !dropped.has(h.section)).map((h) => (stemMap.has(h.section) ? { ...h, section: stemMap.get(h.section)! } : h));
if (lost.length || stemMap.size) writeHolds(root, holds);
if (lost.length) console.log(`   ⚠️  ${lost.length} pause(s) for the picture were on rewritten lines and are gone: ask for them again after Align (Collect pause requests)`);

console.log(`✅ takes in place: ${keep.length + rename.length} reused${voice.length ? `, ${voice.length} to voice` : ""}`);
if (!voice.length) { console.log("   nothing to voice: run Align"); process.exit(0); }
if (!generate) { console.log(`   voice them: bun run tts --video ${video} --section ${voice.map((r) => r.sec.id).join(",")}`); process.exit(0); }

const pass = argv.filter((a, i) => !["--video", "--generate", "--dry"].includes(a) && argv[i - 1] !== "--video");
console.log(`\n🎙  voicing ${voice.length} section(s)...`);
const r = spawnSync("bun", ["run", path.join(import.meta.dir, "run.ts"), "--video", video, "--section", voice.map((x) => x.sec.id).join(","), ...pass], { stdio: "inherit", cwd: path.resolve(import.meta.dir, "../..") });
process.exit(r.status ?? 1);
