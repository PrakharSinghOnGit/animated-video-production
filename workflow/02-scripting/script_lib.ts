/**
 * Reading a script (02-scripting/script_raw.md) without a model: its spoken words with estimated times, free
 * retention statistics, and the claims check (every figure the narrator says must be in the writer's claims list, and
 * a claim only counts as sourced when its URL is one the page check or the creator vouches for).
 * Used by write_script.ts (after writing, and at --approve), retention.ts and research.ts --claims.
 */
import fs from "node:fs";
import path from "node:path";

export const WPM = 150;
/** silent title card a chapter header adds (s); approximate, the real pause is set in Align */
const CHAPTER_PAUSE_S = 2.5;

export interface ScriptBeat { part: number; tone: string; text: string; onScreen: string; words: number; t0: number; t1: number }
export interface ScriptPart { title: string; chapter: boolean; t0: number; t1: number; beats: ScriptBeat[] }
export interface Script { parts: ScriptPart[]; beats: ScriptBeat[]; words: number; seconds: number; spoken: string }

/** The words the voice says: no `[VO: tone]` note, no <inline tags>, no markdown. */
export const spokenOf = (vo: string) => vo.replace(/`?\[VO:[^\]]*\]`?/gi, " ").replace(/<[a-z ]+>/gi, " ").replace(/[*_`]/g, "").replace(/\s+/g, " ").trim();
const countWords = (s: string) => s.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function parseScript(md: string): Script {
  const parts: ScriptPart[] = [];
  let t = 0;
  for (const line of md.split("\n")) {
    const h = line.match(/^###\s+(.*)$/);
    if (h) {
      const chapter = /^chapter\b/i.test(h[1]);
      if (chapter && parts.length) t += CHAPTER_PAUSE_S;
      parts.push({ title: h[1].trim(), chapter, t0: t, t1: t, beats: [] });
      continue;
    }
    const vo = line.match(/^\*\*VO:\*\*\s*(.*)$/i);
    if (vo) {
      if (!parts.length) parts.push({ title: "", chapter: false, t0: 0, t1: 0, beats: [] });
      const text = spokenOf(vo[1]), words = countWords(text), dur = (words / WPM) * 60;
      const part = parts[parts.length - 1];
      part.beats.push({ part: parts.length, tone: vo[1].match(/\[VO:\s*([^\]]*)\]/i)?.[1]?.trim() ?? "", text, onScreen: "", words, t0: t, t1: t + dur });
      t += dur; part.t1 = t;
      continue;
    }
    const os = line.match(/^\*\*\[ON SCREEN\]:\*\*\s*(.*)$/i);
    const last = parts[parts.length - 1]?.beats.at(-1);
    if (os && last) last.onScreen = os[1].trim();
  }
  const beats = parts.flatMap((p) => p.beats);
  return { parts, beats, words: beats.reduce((n, b) => n + b.words, 0), seconds: t, spoken: beats.map((b) => b.text).join(" ") };
}

/** The script with a time in front of every beat: what a reviewer model is given (models guess timestamps badly). */
export function timedScript(s: Script): string {
  return s.parts.map((p) => `### ${p.title}\n${p.beats.map((b) => `[${mmss(b.t0)}] ${b.text}`).join("\n")}`).join("\n\n");
}

/** The spoken words of the first `seconds` (whole sentences). */
export function opening(s: Script, seconds = 60): string {
  const out: string[] = [];
  let words = 0;
  for (const sentence of s.spoken.match(/[^.!?…]+[.!?…]+["')\]]*|\S[^.!?…]*$/g) ?? []) {
    const w = countWords(sentence);
    if (out.length && ((words + w) / WPM) * 60 > seconds) break;
    out.push(sentence.trim()); words += w;
  }
  return out.join(" ");
}

// ───────────── free retention statistics ─────────────

const SENT = /[^.!?…]+[.!?…]+["')\]]*|\S[^.!?…]*$/g;
const YOU = /\b(you|your|you're|you've|you'll|you'd|yours|yourself)\b/i;
const NUMBER = /\d/;
/** a line that talks about the video instead of the subject */
const META = /\b(in (this|today's) video|this channel|by the end of (this|the) video|let'?s (dive|get) (in|into)|before we (start|begin|get started)|in this episode|stick around|stay tuned|as (i|we) (said|mentioned)|we'?ll (cover|look at|talk about|explore)|i'?(m going to|ll) (show|explain|walk)|let me explain|here'?s what we'?ll)\b/i;
const TICS: [string, RegExp][] = [
  ["here's the thing / here's the catch", /\bhere'?s the (thing|catch|problem|twist|part|kicker)\b/gi],
  ["not X. It's Y.", /\b(?:not|n't)\b[^.!?]{0,60}[.!?]\s+(?:it'?s|that'?s|they'?re|you'?re|it was)\b/gi],
  ["let that sink in / think about that", /\b(let that sink in|think about that|read that again|sit with that)\b/gi],
  ["and that's (when|where|why)", /\band that'?s (when|where|why|how)\b/gi],
  ["but here's / but wait", /\bbut (here'?s|wait|it gets worse|that'?s not)\b/gi],
  ["one-word question (Why? / The result?)", /(?:^|[.!?]\s+)(?:[A-Z][a-z']+\s){0,2}[A-Za-z']+\?\s/g],
];

export interface Stretch { t0: number; t1: number; s: number }
export interface ScriptStats {
  words: number; minutes: number;
  /** seconds until the first "you", the first figure and the first question */
  firstYou: number | null; firstNumber: number | null; firstQuestion: number | null;
  /** sentences over 25 words */
  longSentences: number; medianSentence: number;
  /** longest runs of narration without a "you", without a question, and without either a figure or a "you" */
  noYou: Stretch; noQuestion: Stretch; abstract: Stretch;
  meta: { at: number; text: string }[];
  banned: { word: string; n: number }[];
  tics: { name: string; n: number }[];
  /** per 30 s window: you / figures / questions, to see where the script goes flat */
  windows: { t0: number; you: number; numbers: number; questions: number; words: number }[];
  /** beats over 60 spoken words (the voice engine and the viewer both want shorter) */
  longBeats: number;
  notes: string[];
}

interface Sentence { text: string; t0: number; t1: number; words: number }
function sentencesOf(s: Script): Sentence[] {
  const out: Sentence[] = [];
  for (const b of s.beats) {
    let t = b.t0;
    for (const m of b.text.match(SENT) ?? []) {
      const words = countWords(m), dur = (words / WPM) * 60;
      if (words) out.push({ text: m.trim(), t0: t, t1: t + dur, words });
      t += dur;
    }
  }
  return out;
}
function longestWithout(sents: Sentence[], has: (x: Sentence) => boolean, end: number): Stretch {
  let best: Stretch = { t0: 0, t1: 0, s: 0 }, from = 0;
  const close = (to: number) => { if (to - from > best.s) best = { t0: from, t1: to, s: Math.round(to - from) }; };
  for (const x of sents) if (has(x)) { close(x.t0); from = x.t1; }
  close(end);
  return best;
}

/** Words the channel never uses, from voice.md's "Words I never use" section (quoted phrases). */
export function bannedWords(voiceMd: string): string[] {
  const sec = voiceMd.split(/^## /m).find((x) => /^Words I never use/i.test(x)) ?? "";
  return [...sec.matchAll(/"([^"]+)"/g)].map((m) => m[1].toLowerCase());
}

export function scriptStats(s: Script, banned: string[] = []): ScriptStats {
  const sents = sentencesOf(s), end = s.seconds;
  const first = (re: RegExp) => sents.find((x) => re.test(x.text))?.t0 ?? null;
  const lens = sents.map((x) => x.words).sort((a, b) => a - b);
  const windows: ScriptStats["windows"] = [];
  for (let t0 = 0; t0 < end; t0 += 30) {
    const w = sents.filter((x) => x.t0 >= t0 && x.t0 < t0 + 30);
    windows.push({ t0, you: w.filter((x) => YOU.test(x.text)).length, numbers: w.filter((x) => NUMBER.test(x.text)).length, questions: w.filter((x) => x.text.includes("?")).length, words: w.reduce((n, x) => n + x.words, 0) });
  }
  const low = s.spoken.toLowerCase();
  const stats: ScriptStats = {
    words: s.words, minutes: Math.round((s.seconds / 60) * 10) / 10,
    firstYou: first(YOU), firstNumber: first(NUMBER), firstQuestion: first(/\?/),
    longSentences: sents.filter((x) => x.words > 25).length, medianSentence: lens[lens.length >> 1] ?? 0,
    noYou: longestWithout(sents, (x) => YOU.test(x.text), end),
    noQuestion: longestWithout(sents, (x) => x.text.includes("?"), end),
    abstract: longestWithout(sents, (x) => YOU.test(x.text) || NUMBER.test(x.text), end),
    meta: sents.filter((x) => META.test(x.text)).map((x) => ({ at: x.t0, text: x.text })),
    banned: banned.map((word) => ({ word, n: low.split(word).length - 1 })).filter((b) => b.n > 0),
    tics: TICS.map(([name, re]) => ({ name, n: (s.spoken.match(re) ?? []).length })).filter((x) => x.n >= 4),
    windows, longBeats: s.beats.filter((b) => b.words > 60).length, notes: [],
  };
  const n = stats.notes;
  if (stats.firstYou === null || stats.firstYou > 10) n.push(`the viewer ("you") is not addressed in the first 10 s${stats.firstYou === null ? "" : ` (first at ${mmss(stats.firstYou)})`}`);
  if (stats.firstNumber === null || stats.firstNumber > 30) n.push("no concrete figure in the first 30 s");
  const early = stats.meta.filter((m) => m.at < 90);
  for (const m of early) n.push(`talks about the video instead of the subject at ${mmss(m.at)}: "${m.text.slice(0, 90)}"`);
  if (stats.noYou.s >= 60) n.push(`${stats.noYou.s} s without "you" (${mmss(stats.noYou.t0)}–${mmss(stats.noYou.t1)}): the viewer's own stake disappears`);
  if (stats.abstract.s >= 40) n.push(`${stats.abstract.s} s with no figure and no "you" (${mmss(stats.abstract.t0)}–${mmss(stats.abstract.t1)}): likely an abstract stretch`);
  if (stats.noQuestion.s >= 90) n.push(`${stats.noQuestion.s} s without a question (${mmss(stats.noQuestion.t0)}–${mmss(stats.noQuestion.t1)})`);
  if (stats.longSentences) n.push(`${stats.longSentences} sentence(s) over 25 words`);
  if (stats.longBeats) n.push(`${stats.longBeats} beat(s) over 60 words`);
  for (const b of stats.banned) n.push(`uses "${b.word}" (${b.n}×), which voice.md bans`);
  for (const t of stats.tics) n.push(`the pattern "${t.name}" appears ${t.n}×`);
  return stats;
}

// ───────────── claims: every fact said aloud, and its source ─────────────

export type ClaimStatus = "sourced" | "check" | "illustrative";
export interface Claim {
  id: string;
  /** the fact, in one sentence */
  claim: string;
  /** the exact words of the narration that state it */
  said: string;
  kind?: "number" | "event" | "quote" | "attribution" | "other";
  /** where it comes from: a page and what that page says */
  source?: { url?: string; says?: string; name?: string } | null;
  status: ClaimStatus;
  /** why it is not sourced, or what the creator should check */
  note?: string;
}
export interface CheckedClaim extends Claim { status: ClaimStatus; problems: string[] }
export interface ClaimsReport {
  claims: CheckedClaim[];
  /** figures the narrator says that no claim covers: the writer kept them without declaring them */
  unlisted: { figure: string; at: number; sentence: string }[];
  sourced: number; check: number; illustrative: number;
}

const normText = (x: string) => x.toLowerCase().replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[—–]/g, "-").replace(/<[a-z ]+>/g, " ").replace(/[^a-z0-9%$.' -]+/g, " ").replace(/\s+/g, " ").trim();
const WORD_NUM = "(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|trillion|half|quarter|double|triple)";
/** Figures as said: "$410 thousand", "149%", "2,200 dollars", "three quarters", "103 years". Years alone (2000) count too. */
const FIGURE = new RegExp(`\\$?\\d+(?:,\\d{3})*(?:\\.\\d+)?(?:\\s?(?:%|percent|x\\b|thousand|million|billion|trillion|k\\b|bn\\b))?|\\b${WORD_NUM}(?:[- ]${WORD_NUM})*\\s+(?:percent|dollars|times|thousand|million|billion|trillion|quarters?|years?|months?|days?|people|traders|shares)\\b`, "gi");
export const figuresOf = (text: string) => [...text.matchAll(FIGURE)].map((m) => m[0].trim()).filter((f) => /\d/.test(f) || / /.test(f));

const urlKey = (u: string) => u.trim().replace(/^https?:\/\/(www\.)?/i, "").replace(/[#?].*$/, "").replace(/\/+$/, "").toLowerCase();
export const urlsIn = (text: string) => [...text.matchAll(/https?:\/\/[^\s)>\]"'`]+/g)].map((m) => urlKey(m[0].replace(/[.,;:]+$/, "")));

/**
 * Check the writer's claims list against the script and the sources that can be trusted.
 * `trustedUrls`: pages the page check confirmed (✓ facts of research.md) and pages the creator gave in the idea.
 * A claim stays "sourced" only with a trusted URL and a sentence saying what the page says; anything else the writer
 * called sourced becomes "check" with the reason. Figures in the narration that no claim covers are listed.
 */
export function checkClaims(script: Script, claims: Claim[], trustedUrls: string[]): ClaimsReport {
  const spoken = normText(script.spoken), trusted = new Set(trustedUrls.map(urlKey));
  const out: CheckedClaim[] = claims.map((c, i) => {
    const problems: string[] = [];
    let status: ClaimStatus = c.status === "sourced" || c.status === "illustrative" ? c.status : "check";
    const said = normText(c.said ?? "");
    if (!said || !spoken.includes(said)) problems.push("its quoted words are not in the script");
    if (status === "sourced") {
      const url = c.source?.url ?? "";
      if (!/^https?:\/\//.test(url)) { status = "check"; problems.push("no source URL"); }
      else if (!trusted.has(urlKey(url))) { status = "check"; problems.push("the URL is not a page-checked research fact or a page from your draft (it may come from the writer's memory)"); }
      else if (!c.source?.says?.trim()) { status = "check"; problems.push("no sentence saying what the source says"); }
    }
    return { ...c, id: c.id || `C${String(i + 1).padStart(2, "0")}`, status, problems };
  });
  const covered = normText(out.map((c) => c.said ?? "").join(" | "));
  const unlisted: ClaimsReport["unlisted"] = [], seen = new Set<string>();
  for (const sent of sentencesOf(script)) for (const f of figuresOf(sent.text)) {
    const k = normText(f);
    if (!k || seen.has(k) || covered.includes(k)) continue;
    seen.add(k);
    unlisted.push({ figure: f, at: sent.t0, sentence: sent.text });
  }
  const n = (st: ClaimStatus) => out.filter((c) => c.status === st).length;
  return { claims: out, unlisted, sourced: n("sourced"), check: n("check"), illustrative: n("illustrative") };
}

/** The fact-check sheet the creator reads at G1a (02-scripting/factcheck.md). */
export function renderFactcheck(videoId: string, r: ClaimsReport, script: Script): string {
  const at = (said: string) => { const b = script.beats.find((x) => normText(x.text).includes(normText(said))); return b ? mmss(b.t0) : "?"; };
  const row = (c: CheckedClaim) => [
    `- **${c.id}** (${at(c.said)}) ${c.claim}`,
    `  - Said: "${c.said}"`,
    ...(c.source?.url ? [`  - Source: ${c.source.name ? c.source.name + ": " : ""}${c.source.url}`] : []),
    ...(c.source?.says ? [`  - It says: ${c.source.says}`] : []),
    ...(c.note ? [`  - Note: ${c.note}`] : []),
    ...c.problems.map((p) => `  - ⚠️ ${p}`),
  ];
  const of = (st: ClaimStatus) => r.claims.filter((c) => c.status === st);
  return [
    `# Fact check: ${videoId}`,
    "",
    `${r.claims.length} claims in the script: **${r.check} need your check**, ${r.sourced} sourced (a page the page check or your draft confirms), ${r.illustrative} illustrative (a made-up example or plain arithmetic, said as such). ${r.unlisted.length} figure(s) are said but not declared by the writer.`,
    "",
    "## Needs your fact-check",
    "",
    ...(of("check").length ? of("check").flatMap(row) : ["- (none)"]),
    "",
    "## Figures said but not in the claims list",
    "",
    ...(r.unlisted.length ? r.unlisted.map((u) => `- (${mmss(u.at)}) **${u.figure}**: "${u.sentence}"`) : ["- (none)"]),
    "",
    "## Sourced",
    "",
    ...(of("sourced").length ? of("sourced").flatMap(row) : ["- (none)"]),
    "",
    "## Illustrative",
    "",
    ...(of("illustrative").length ? of("illustrative").flatMap(row) : ["- (none)"]),
    "",
    "Run `bun run research --video " + videoId + " --claims` to search the web for the claims that need a check; a claim becomes sourced when the program finds its quoted sentence on the page.",
    "",
  ].join("\n");
}

export const claimsPath = (dir: string) => path.join(dir, "claims.json");
export const factcheckPath = (dir: string) => path.join(dir, "factcheck.md");
export function readClaims(dir: string): Claim[] | null {
  try {
    const j = JSON.parse(fs.readFileSync(claimsPath(dir), "utf-8"));
    const list = Array.isArray(j) ? j : j?.claims;
    return Array.isArray(list) ? list.filter((c) => c && typeof c === "object" && typeof c.claim === "string") : null;
  } catch { return null; }
}

// ───────────── the fact check of a workspace ─────────────

import { verifiedResearchText } from "./research_lib";

/**
 * Build 02-scripting/factcheck.md from the script, the writer's claims.json and the sources that can be trusted:
 * ✓ facts of research.md and pages named in idea.md. A claim that `research --claims` found a page for (same quoted
 * words) is filled in from that fact; one the research contradicts keeps "check" and says so. Free, no model.
 */
export function runFactcheck(wsDir: string, videoId: string): ClaimsReport | null {
  const dir = path.join(wsDir, "02-scripting");
  let md = "";
  try { md = fs.readFileSync(path.join(dir, "script_raw.md"), "utf-8"); } catch { return null; }
  const script = parseScript(md);
  let idea = "";
  try { idea = fs.readFileSync(path.join(dir, "idea.md"), "utf-8"); } catch {}
  let research: any = null;
  try { research = JSON.parse(fs.readFileSync(path.join(dir, "research.json"), "utf-8")); } catch {}
  const claims = (readClaims(dir) ?? []).map((c) => ({ ...c }));
  const notes = new Map<string, string>();
  for (const c of claims) {
    const mine = (x: any) => x?.claimSaid && normText(x.claimSaid) === normText(c.said ?? "");
    const fact = (research?.facts ?? []).find((f: any) => mine(f) && f.check === "verified");
    if (fact && c.status !== "illustrative") { c.status = "sourced"; c.source = { url: fact.url, says: fact.quote, name: [fact.source, fact.date].filter(Boolean).join(", ") }; }
    const bad = (research?.checks ?? []).find((k: any) => mine(k) && (k.verdict === "contradicted" || k.verdict === "outdated"));
    if (bad) notes.set(c.said, `the web research says this is ${bad.verdict}: ${bad.note}`);
  }
  const report = checkClaims(script, claims, [...urlsIn(verifiedResearchText(wsDir)), ...urlsIn(idea)]);
  for (const c of report.claims) {
    const n = notes.get(c.said);
    if (n) { c.problems.push(n); if (c.status === "sourced") { c.status = "check"; } }
  }
  const count = (st: ClaimStatus) => report.claims.filter((c) => c.status === st).length;
  report.sourced = count("sourced"); report.check = count("check"); report.illustrative = count("illustrative");
  fs.writeFileSync(factcheckPath(dir), renderFactcheck(videoId, report, script), "utf-8");
  return report;
}

/** The lines every step prints about the fact check. */
export function factcheckLines(r: ClaimsReport, max = 12): string[] {
  const out = [`🧾 fact check: ${r.claims.length} claims, ${r.sourced} sourced, ${r.illustrative} illustrative, ${r.check} need your check; ${r.unlisted.length} figure(s) said but not declared`];
  for (const c of r.claims.filter((x) => x.status === "check").slice(0, max)) out.push(`   ⚠️  ${c.id} "${c.said.slice(0, 80)}"${c.problems.length ? ` (${c.problems[0]})` : ""}`);
  for (const u of r.unlisted.slice(0, max)) out.push(`   ⚠️  not declared: ${u.figure} at ${mmss(u.at)} ("${u.sentence.slice(0, 70)}")`);
  return out;
}
