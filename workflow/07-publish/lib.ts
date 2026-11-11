/**
 * Publish step (YouTube packaging): shared paths, limits, and the checks that run in code, not in a model.
 * The rules come from workflow/07-publish/GUIDE.md; the numbers below are the ones the guide gives.
 * Imported by meta.ts, thumbs.ts, review.ts, export.ts and the dashboard server (no side effects at import).
 *
 * workspace/<ID>/07-publish/
 *   metadata.json      the 3 packages (A/B/C: title + paired thumbnail), description, tags, hashtags, checks
 *   description.txt    the full description (derived from metadata.json)
 *   thumbnails.json    per variant: concept, text, numbers, hypothesis (written by the thumbnail author)
 *   thumbnails/A.png   1920x1080 stills (or .jpg when a PNG would pass 2 MB); preview.png + preview_small.png
 *   remotion/          the thumbnail project (index.ts, registry.ts generated; Root/Preview synced from template/)
 *   notes/A.md ..      your notes per variant (and notes/meta.md for titles + description)
 *   reviews/, review.md  the vision critic's findings
 *   approval.json      the human gate; stale when thumbnails or metadata change afterwards
 *   export/            what you upload
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const REPO = path.resolve(import.meta.dir, "../..");
export const VARIANTS = ["A", "B", "C"] as const;
export type Variant = (typeof VARIANTS)[number];

// Limits (GUIDE.md section 1, 3.1, 5)
export const TITLE_MAX = 100;
/** The main promise must be readable within this many characters (GUIDE.md 3.1). */
export const TITLE_TRUNC = 60;
export const TITLE_AIM = "35-55";
export const DESC_MAX = 5000;
/** YouTube states no tag limit; 500 characters is the commonly quoted one (GUIDE.md section 1, unverified). */
export const TAGS_MAX = 500;
export const TAGS_COUNT = 10;
export const HASHTAGS = 3;
export const THUMB_MAX_BYTES = 2 * 1024 * 1024;
export const THUMB_W = 1920, THUMB_H = 1080;
export const THUMB_MAX_WORDS = 3;
export const MIN_CHAPTER_S = 10;
export const DISCLAIMER = "This video is for general education only and is not personal financial, investment, tax or legal advice. Numbers come from the sources listed above and may change. Consult a qualified professional before making decisions.";
/** Get-rich wording (GUIDE.md 6.2): a lint on titles. */
export const BANNED = /\b(guaranteed?|secrets?|overnight|never lose|get rich|they don'?t want you to know)\b/i;

export const wsDir = (id: string) => path.join(REPO, "workspace", id);
export const pubDir = (id: string) => path.join(wsDir(id), "07-publish");
export const pubFile = (id: string, rel: string) => path.join(pubDir(id), rel);
export const GUIDE = "workflow/07-publish/GUIDE.md";

export function readJson<T = any>(p: string): T | null {
  try { return JSON.parse(fs.readFileSync(p, "utf-8")); } catch { return null; }
}
export const readText = (p: string) => { try { return fs.readFileSync(p, "utf-8"); } catch { return ""; } };
export const mtime = (p: string) => { try { return fs.statSync(p).mtimeMs; } catch { return 0; } };

/**
 * Why a stranger clicks (GUIDE.md 4.2). The three packages of a video are three bets, so they use three levers.
 *   stake    what it costs the viewer: their rent, their savings, their trade ("you" is the subject)
 *   villain  who is on the other side or who gains (only one the video names and sources)
 *   myth     something the viewer was told that the video shows is wrong
 *   number   one sourced figure that is hard to believe
 *   question the plain question a searcher types, which the video answers
 */
export const LEVERS = ["stake", "villain", "myth", "number", "question"] as const;
export type Lever = (typeof LEVERS)[number];
/** The four ways two thumbnails can differ (GUIDE.md 4.2). Every pair of variants differs on at least two. */
export const AXES = {
  /** what dominates the image: a character (the Agent, Penny), one object, a data shape (a gap, a line), or big type */
  subject: ["character", "object", "data", "type"],
  /** what it makes the viewer feel: something is being taken, something is hidden, something can be fixed */
  emotion: ["threat", "curiosity", "payoff"],
  /** the words on the image */
  text: ["none", "word", "number"],
  /** one thing close up, a scene with a small actor in a big space, or two sides against each other */
  composition: ["close", "scene", "split"],
} as const;
export type AxisKey = keyof typeof AXES;
export type Axes = { [K in AxisKey]: (typeof AXES)[K][number] };
export const AXIS_KEYS = Object.keys(AXES) as AxisKey[];

/** The package for one test variant: a thumbnail and the title it is shown with. */
export interface Package {
  title: string;
  /** searchable: names the subject plainly; curiosity: a tension or puzzle the video answers; number: led by a sourced figure */
  type: "searchable" | "curiosity" | "number";
  rationale: string;
  /** one-line brief for the thumbnail that pairs with this title (what it shows; never the title's words) */
  thumbnail: string;
  /** what this package tests against the others */
  hypothesis: string;
  /** why a stranger clicks this one (packages written before 2026-11-11 have none) */
  lever?: Lever;
  /** the thumbnail's place on the four axes: the designer must keep it */
  axes?: Axes;
  /** the exact words on the thumbnail ("" = none) */
  thumbText?: string;
  /** a sentence copied from the script that pays off the title, from the first two minutes */
  proof?: string;
}
export interface Metadata {
  video: string;
  at: string;
  model: string;
  durationS: number;
  titles: Record<Variant, Package>;
  /** the full description as it will be pasted (promise, chapters, sources, credits, disclaimer, hashtags) */
  description: string;
  chapters: { ms: number; time: string; title: string }[];
  tags: string[];
  hashtags: string[];
  checks: { errors: string[]; warnings: string[] };
  /** true once edited in the dashboard */
  edited?: boolean;
  /** the one sentence the packages are built on */
  promise?: string;
  /** upload order, strongest first: an inconclusive test keeps the first one uploaded (GUIDE.md 4.1) */
  order?: Variant[];
}
export interface ThumbInfo { concept: string; text: string; numbers: string[]; focal: string; hypothesis: string; clear: string; /** what was drawn, on the four axes */ axes?: Axes }

// ───────────── numbers: only what the plan's data says ─────────────

const SUFFIX: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 };
const UNIT_SCALE: [RegExp, number][] = [[/thousand/i, 1e3], [/million/i, 1e6], [/billion/i, 1e9], [/trillion/i, 1e12]];

/** Every number in a text as a plain value ("$410K" -> 410000, "2,190" -> 2190, "149%" -> 149). */
export function numbersIn(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/(\d[\d,]*(?:\.\d+)?)\s?([kmbt])?(?![a-z0-9])/gi)) {
    const v = parseFloat(m[1].replace(/,/g, ""));
    if (Number.isFinite(v)) out.push(m[2] ? v * SUFFIX[m[2].toLowerCase()] : v);
  }
  return out;
}

export interface PlanNumbers {
  /** every number the plan's data carries (values, scaled values, numbers in labels/units and in "derived" sources) */
  allowed: Set<number>;
  /** the ones that appear only in items whose source is just the narration ("unverified") */
  unverified: Set<number>;
  /** one line per data item, for the prompts */
  lines: string[];
}
/** The sourced numbers of a video, from acts.json (beats[].data). */
export function planNumbers(plan: any): PlanNumbers {
  const verified = new Set<number>(), all = new Set<number>(), lines: string[] = [];
  const seen = new Set<string>();
  for (const a of plan?.acts ?? []) for (const b of a.beats ?? []) for (const d of b.data ?? []) {
    const unit = String(d.unit ?? ""), source = String(d.source ?? "");
    const v = typeof d.value === "number" ? d.value : numbersIn(String(d.value))[0];
    const vals = new Set<number>();
    if (Number.isFinite(v)) { vals.add(Math.abs(v)); for (const [re, k] of UNIT_SCALE) if (re.test(unit)) vals.add(Math.abs(v) * k); }
    for (const n of numbersIn(`${d.label} ${unit}`)) vals.add(n);
    if (/^derived/i.test(source)) for (const n of numbersIn(source)) vals.add(n);
    const unver = /unverified/i.test(source);
    for (const n of vals) { all.add(n); if (!unver) verified.add(n); }
    const key = `${d.label}|${d.value}`;
    if (!seen.has(key)) { seen.add(key); lines.push(`${a.id}: ${d.label} = ${d.value} ${unit}`.trim() + ` [${unver ? "narration only, unverified" : "sourced"}]`); }
  }
  return { allowed: all, unverified: new Set([...all].filter((n) => !verified.has(n))), lines };
}

/** Numbers in `text` that the plan does not carry, and the ones carried only as unverified. */
export function numberProblems(text: string, pn: PlanNumbers): { missing: string[]; unverified: string[] } {
  const missing: string[] = [], unverified: string[] = [];
  for (const m of text.matchAll(/\$?(\d[\d,]*(?:\.\d+)?)\s?([kmbt])?(?![a-z0-9])%?/gi)) {
    const v = parseFloat(m[1].replace(/,/g, "")) * (m[2] ? SUFFIX[m[2].toLowerCase()] : 1);
    if (!Number.isFinite(v)) continue;
    if (!pn.allowed.has(v)) missing.push(m[0].trim());
    else if (pn.unverified.has(v)) unverified.push(m[0].trim());
  }
  return { missing, unverified };
}

// ───────────── titles, tags, description checks ─────────────

export const EMOJI = /\p{Extended_Pictographic}/u;
const normWords = (s: string) => s.toLowerCase().replace(/[^a-z0-9% $]+/g, " ").split(/\s+/).filter((w) => w.length > 2);

export function checkTitle(v: string, p: Package, pn: PlanNumbers): { errors: string[]; warnings: string[] } {
  const errors: string[] = [], warnings: string[] = [], t = p.title ?? "";
  if (!t.trim()) return { errors: [`${v}: empty title`], warnings };
  if (t.length > TITLE_MAX) errors.push(`${v}: title is ${t.length} characters (max ${TITLE_MAX})`);
  else if (t.length > TITLE_TRUNC) warnings.push(`${v}: title is ${t.length} characters; the main promise must fit in the first ${TITLE_TRUNC} (aim ${TITLE_AIM})`);
  else if (t.length < 25) warnings.push(`${v}: title is only ${t.length} characters (aim ${TITLE_AIM})`);
  const caps = t.split(/\s+/).filter((w) => w.length > 2 && /[A-Z]/.test(w) && w === w.toUpperCase() && !/\d/.test(w));
  if (caps.length > 1) warnings.push(`${v}: ${caps.length} ALL-CAPS words (${caps.join(", ")}); at most one`);
  if (EMOJI.test(t)) warnings.push(`${v}: emoji in the title`);
  const bad = t.match(BANNED);
  if (bad) errors.push(`${v}: get-rich wording "${bad[0]}" in the title`);
  const np = numberProblems(t, pn);
  if (np.missing.length) errors.push(`${v}: number ${np.missing.join(", ")} is not in the plan's data`);
  if (np.unverified.length) warnings.push(`${v}: number ${np.unverified.join(", ")} is only sourced from the narration: fact-check it`);
  return { errors, warnings };
}

/** Words that carry a title's meaning (no articles, pronouns or question words), for comparing two titles. */
const STOP = new Set("the and for you your are was were why how what when who that this with from into not but its his her their they them than then has have had can cant will get gets got just ever never about over out off all any one too very more most much does did is it a an of to in on at by be so as or if we i my me us our".split(" "));
export const contentWords = (s: string) => [...new Set(s.toLowerCase().replace(/[^a-z0-9%$ ]+/g, " ").split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w)).map((w) => w.replace(/(ing|ed|es|s)$/, "")))];
/** Share of content words two titles have in common (0..1, against the shorter one). */
export function titleOverlap(a: string, b: string): number {
  const x = contentWords(a), y = new Set(contentWords(b));
  const n = Math.min(x.length, y.size);
  return n ? x.filter((w) => y.has(w)).length / n : 0;
}

/** The narration of a script file as one line of plain words (VO lines only, without the bracketed directions). */
export function spokenText(script: string): string {
  return script.split("\n").filter((l) => /^\*\*VO:\*\*/i.test(l)).join(" ").replace(/`\[[^\]]*\]`/g, "").replace(/\*\*VO:\*\*/gi, "").replace(/\s+/g, " ").trim();
}
const loose = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** Where a quote sits in the narration, as a share of it (0 = the first word), or -1 when the script does not say it. */
export function quotePosition(quote: string, spoken: string): number {
  const q = loose(quote), t = loose(spoken);
  if (q.length < 12 || !t) return -1;
  const i = t.indexOf(q);
  return i < 0 ? -1 : i / t.length;
}

/** How many axes two thumbnails differ on. */
export const axisDistance = (a: Axes, b: Axes) => AXIS_KEYS.filter((k) => a[k] !== b[k]).length;
const validAxes = (a: any): a is Axes => !!a && AXIS_KEYS.every((k) => (AXES[k] as readonly string[]).includes(a[k]));
const textKind = (t: string): Axes["text"] => (!t.trim() ? "none" : /\d/.test(t) ? "number" : "word");

/**
 * Are three thumbnails three different bets? Every pair differs on at least two axes, no two share a subject or the
 * same words, and the declared text axis matches the words. `who` names the thing checked ("package" or "thumbnail").
 * With `requireAxes` false (files made before the axes existed) only the shared words are checked.
 */
export function checkBets(items: Partial<Record<Variant, { axes?: Axes; text?: string }>>, who: string, requireAxes = true): { errors: string[]; warnings: string[] } {
  const errors: string[] = [], warnings: string[] = [];
  const have = VARIANTS.filter((v) => items[v]);
  for (const v of have) {
    const it = items[v]!;
    if (!validAxes(it.axes)) { if (requireAxes) errors.push(`${v}: the ${who} needs axes (${AXIS_KEYS.map((k) => `${k}: ${AXES[k].join("|")}`).join("; ")})`); continue; }
    if (it.text !== undefined && it.axes.text !== textKind(it.text)) errors.push(`${v}: the text axis says "${it.axes.text}" but the words are ${it.text.trim() ? `"${it.text.trim()}"` : "empty"}`);
  }
  for (let i = 0; i < have.length; i++) for (let j = i + 1; j < have.length; j++) {
    const a = items[have[i]]!, b = items[have[j]]!, pair = `${have[i]} and ${have[j]}`;
    if (validAxes(a.axes) && validAxes(b.axes)) {
      const d = axisDistance(a.axes, b.axes);
      if (d < 2) errors.push(`${pair}: the ${who}s differ on ${d} of 4 axes (need 2 or more): they are one idea twice; change the subject, emotion, text or composition of one`);
      else if (a.axes.subject === b.axes.subject) warnings.push(`${pair}: both ${who}s have a ${a.axes.subject} as the subject; three different subjects make a clearer test`);
    }
    const ta = loose(a.text ?? ""), tb = loose(b.text ?? "");
    if (ta && ta === tb) errors.push(`${pair}: the same words on both thumbnails ("${a.text!.trim()}")`);
  }
  return { errors, warnings };
}

export interface TitleContext {
  /** require the bet fields (lever, axes, thumbText, proof): true for new metadata, false when re-checking older files */
  strict?: boolean;
  /** the narration, to find each proof quote in */
  spoken?: string;
  durationS?: number;
}
/** The promise must be paid off this early (GUIDE.md 3.2). */
export const PAYOFF_S = 120;

export function checkTitles(titles: Record<Variant, Package>, pn: PlanNumbers, ctx: TitleContext = {}): { errors: string[]; warnings: string[] } {
  const errors: string[] = [], warnings: string[] = [];
  for (const v of VARIANTS) {
    if (!titles?.[v]) { errors.push(`${v}: no package`); continue; }
    const r = checkTitle(v, titles[v], pn);
    errors.push(...r.errors); warnings.push(...r.warnings);
  }
  const types = VARIANTS.map((v) => titles?.[v]?.type);
  if (!types.includes("searchable")) warnings.push("no searchable title among the three (GUIDE.md 3.2)");
  if (!types.includes("curiosity")) warnings.push("no curiosity title among the three (GUIDE.md 3.2)");
  const ts = VARIANTS.map((v) => titles?.[v]?.title?.trim().toLowerCase());
  if (new Set(ts).size < ts.length) errors.push("two packages have the same title");

  // three bets, not one idea three times
  for (let i = 0; i < VARIANTS.length; i++) for (let j = i + 1; j < VARIANTS.length; j++) {
    const a = titles?.[VARIANTS[i]]?.title ?? "", b = titles?.[VARIANTS[j]]?.title ?? "";
    if (!a || !b || a.trim().toLowerCase() === b.trim().toLowerCase()) continue;
    const o = titleOverlap(a, b);
    if (o >= 0.6) errors.push(`${VARIANTS[i]} and ${VARIANTS[j]}: the titles share ${Math.round(o * 100)}% of their words: one sentence reworded, not two angles`);
    else if (o >= 0.4) warnings.push(`${VARIANTS[i]} and ${VARIANTS[j]}: the titles share ${Math.round(o * 100)}% of their words`);
  }
  const bets = VARIANTS.some((v) => titles?.[v]?.lever || titles?.[v]?.axes);
  if (!ctx.strict && !bets) return { errors, warnings };
  const levers = VARIANTS.map((v) => titles?.[v]?.lever);
  for (const v of VARIANTS) if (!LEVERS.includes(titles?.[v]?.lever as Lever)) errors.push(`${v}: lever must be one of ${LEVERS.join(", ")}`);
  if (levers.every(Boolean) && new Set(levers).size < 3) errors.push(`the three packages use the levers ${levers.join(", ")}: three bets need three different levers`);
  const b = checkBets(Object.fromEntries(VARIANTS.filter((v) => titles?.[v]).map((v) => [v, { axes: titles[v].axes, text: titles[v].thumbText }])), "package");
  errors.push(...b.errors); warnings.push(...b.warnings);
  for (const v of VARIANTS) {
    const p = titles?.[v];
    if (!p) continue;
    const words = (p.thumbText ?? "").trim().split(/\s+/).filter(Boolean);
    if (words.length > THUMB_MAX_WORDS) errors.push(`${v}: ${words.length} words on the thumbnail (max ${THUMB_MAX_WORDS})`);
    const np = numberProblems(p.thumbText ?? "", pn);
    if (np.missing.length) errors.push(`${v}: thumbnail number ${np.missing.join(", ")} is not in the plan's data`);
    const tw = new Set(contentWords(p.title));
    const dup = contentWords(p.thumbText ?? "").filter((w) => tw.has(w));
    if (dup.length && dup.length === contentWords(p.thumbText ?? "").length) errors.push(`${v}: the thumbnail words ("${p.thumbText}") repeat the title; the image gives the half the title leaves out`);
    if (ctx.spoken !== undefined) {
      if (!p.proof?.trim()) errors.push(`${v}: proof is missing (a sentence copied from the script that pays off the title)`);
      else {
        const at = quotePosition(p.proof, ctx.spoken);
        if (at < 0) errors.push(`${v}: the proof is not in the script word for word ("${p.proof.slice(0, 70)}"): copy the sentence that pays off the title, or change the title to one the script delivers`);
        else if (ctx.durationS && at * ctx.durationS > PAYOFF_S) warnings.push(`${v}: the script pays off this title at about ${stamp(at * ctx.durationS * 1000)} (later than ${stamp(PAYOFF_S * 1000)}): viewers who clicked for it may leave first`);
      }
    }
  }
  return { errors, warnings };
}

/**
 * Words used on the thumbnails of the channel's other videos (lower case -> the videos). A word that is on every
 * thumbnail stops meaning anything, and the channel looks like one video uploaded again.
 */
export function usedThumbWords(except: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  let dirs: string[] = [];
  try { dirs = fs.readdirSync(path.join(REPO, "workspace")).filter((d) => d !== except && !d.startsWith("_")); } catch {}
  for (const d of dirs) {
    const info = readJson<Record<string, ThumbInfo>>(pubFile(d, "thumbnails.json"));
    for (const v of VARIANTS) for (const w of contentWords(info?.[v]?.text ?? "")) if (w.length > 2 && !/\d/.test(w)) out.set(w, [...new Set([...(out.get(w) ?? []), d])]);
  }
  return out;
}

/** Tags as YouTube counts them: multi-word tags are quoted, commas between. */
export const tagsLength = (tags: string[]) => tags.reduce((n, t) => n + t.length + (/\s/.test(t) ? 2 : 0), 0) + Math.max(0, tags.length - 1);

export function checkTags(tags: string[], hashtags: string[]): { errors: string[]; warnings: string[] } {
  const errors: string[] = [], warnings: string[] = [];
  if (tagsLength(tags) > TAGS_MAX) errors.push(`tags total ${tagsLength(tags)} characters (max ${TAGS_MAX})`);
  if (tags.length > TAGS_COUNT) warnings.push(`${tags.length} tags; the guide says ${TAGS_COUNT} or fewer`);
  if (hashtags.length !== HASHTAGS) errors.push(`${hashtags.length} hashtags; exactly ${HASHTAGS}`);
  if (hashtags.some((h) => !/^#[\p{L}\p{N}_]+$/u.test(h))) errors.push("hashtags must start with # and have no spaces");
  return { errors, warnings };
}

export function checkDescription(desc: string): { errors: string[]; warnings: string[] } {
  const errors: string[] = [], warnings: string[] = [];
  if (desc.length > DESC_MAX) errors.push(`description is ${desc.length} characters (max ${DESC_MAX})`);
  const head = desc.split("\n").slice(0, 2).join(" ");
  if (/https?:\/\/|#\w/.test(head)) warnings.push("the first 2 lines hold a link or hashtag (GUIDE.md 5.1)");
  if (head.length > 220) warnings.push(`the first 2 lines are ${head.length} characters; the promise should stand in about 150`);
  const ch = desc.match(/^\s*\d{1,2}:\d{2}(?::\d{2})?\s+.+$/gm) ?? [];
  if (ch.length < 3) warnings.push("fewer than 3 chapter timestamps in the description");
  else if (!/^\s*0{1,2}:00\s/m.test(ch[0])) warnings.push("the first chapter is not 0:00");
  const bad = desc.match(BANNED);
  if (bad) warnings.push(`get-rich wording "${bad[0]}" in the description`);
  return { errors, warnings };
}

// ───────────── chapters (deterministic, YouTube rules: 0:00 first, ascending, >= 3, each >= 10 s) ─────────────

/** 0:00 (video under an hour: m:ss; guide shows 00:00 form, YouTube accepts both). */
export function stamp(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${two(m)}:${two(r)}` : `${two(m)}:${two(r)}`;
}

export interface ChapterResult { chapters: { ms: number; time: string; title: string }[]; warnings: string[] }
/**
 * Chapter list from chapters.json (the narration pauses), falling back to the plan's chapter acts.
 * Rules applied here, not by the model: the first chapter is 0:00 (an "Intro" is added when the first chapter starts later,
 * or the first chapter simply starts at 0), starts ascend, any chapter closer than 10 s to the previous one or to the end
 * is merged away, and fewer than 3 chapters means none are written.
 */
export function buildChapters(id: string, durationMs: number): ChapterResult {
  const d = path.join(wsDir(id), "05-video");
  const warnings: string[] = [];
  let raw: { title: string; ms: number }[] = (readJson<any[]>(path.join(d, "chapters.json")) ?? []).map((c) => ({ title: String(c.title), ms: Number(c.pauseStartMs ?? c.startMs) }));
  if (!raw.length) raw = (readJson<any>(path.join(d, "acts.json"))?.acts ?? []).filter((a: any) => a.chapter).map((a: any) => ({ title: String(a.chapter.title), ms: Number(a.startMs) }));
  raw = raw.filter((c) => Number.isFinite(c.ms)).sort((a, b) => a.ms - b.ms);
  if (!raw.length) return { chapters: [], warnings: ["no chapters.json and no chapter acts: no chapters in the description"] };
  const list: { ms: number; title: string }[] = [];
  if (raw[0].ms < MIN_CHAPTER_S * 1000) raw[0] = { ...raw[0], ms: 0 };
  else list.push({ ms: 0, title: "Intro" });
  for (const c of raw) {
    const prev = list.at(-1);
    if (prev && c.ms - prev.ms < MIN_CHAPTER_S * 1000) { warnings.push(`chapter "${c.title}" at ${stamp(c.ms)} is under ${MIN_CHAPTER_S} s after "${prev.title}": merged`); continue; }
    if (prev && c.ms <= prev.ms) continue;
    list.push({ ms: c.ms, title: c.title });
  }
  while (list.length > 1 && durationMs && durationMs - list.at(-1)!.ms < MIN_CHAPTER_S * 1000) { warnings.push(`last chapter "${list.at(-1)!.title}" is under ${MIN_CHAPTER_S} s: merged`); list.pop(); }
  if (list.length < 3) return { chapters: [], warnings: [...warnings, `only ${list.length} chapter(s): YouTube needs at least 3, so none are written`] };
  return { chapters: list.map((c) => ({ ms: c.ms, time: stamp(c.ms), title: c.title })), warnings };
}

// ───────────── sources, credits, description ─────────────

/** Source lines for the description: sources.md rows first, else the plan's data sources. Unverified ones are flagged. */
export function sourceLines(id: string): { lines: string[]; verified: boolean; warnings: string[] } {
  const d = path.join(wsDir(id), "05-video");
  const md = readText(path.join(d, "sources.md"));
  const rows = md.split("\n").filter((l) => /^\|\s*\*\*/.test(l)).map((l) => l.split("|").map((c) => c.trim())[4]).filter(Boolean);
  const plan = readJson<any>(path.join(d, "acts.json"));
  const src = rows.length ? rows : (plan?.acts ?? []).flatMap((a: any) => (a.beats ?? []).flatMap((b: any) => (b.data ?? []).map((x: any) => String(x.source ?? ""))));
  // keep the citation, drop the planner's working notes ("; check …", "(my check …)", "writer's model …") that must never reach the description
  const cite = (s: string) => s.replace(/^narration \(unverified\);?\s*/i, "").replace(/^likely\s+/i, "").replace(/;\s*check\b.*$/i, "").replace(/\s*\(my check[^)]*\)/i, "").trim();
  const seenKey = new Set<string>();
  const clean = src.map(cite).filter((s: string) => {
    const k = s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!s || /^(derived|narration|check|writer)/i.test(s) || /^\w+, latest year$/i.test(s) || seenKey.has(k)) return false;
    seenKey.add(k); return true;
  }) as string[];
  const unver = src.some((s: string) => /unverified/i.test(s));
  const warnings: string[] = [];
  if (!clean.length) warnings.push("no sources in sources.md or the plan: add the Sources section by hand");
  else if (unver) warnings.push("the sources come from a plan whose figures are marked unverified: check each one before publishing");
  return { lines: clean.slice(0, 20), verified: !unver && clean.length > 0, warnings };
}

/** The attribution-required block of 06-audio/credits.txt (what the licences ask to be pasted in the description). */
export function creditLines(id: string): string[] {
  const t = readText(path.join(wsDir(id), "06-audio/credits.txt"));
  const m = t.match(/ATTRIBUTION REQUIRED[^\n]*\n([\s\S]*?)(?:\n\s*\n|NO ATTRIBUTION|$)/);
  return (m?.[1] ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
}

/** Promise first, then chapters, sources, credits, disclaimer, hashtags (GUIDE.md 5.2). */
export function buildDescription(o: { body: string; chapters: { time: string; title: string }[]; sources: string[]; sourcesNote?: string; credits: string[]; hashtags: string[] }): string {
  const parts = [o.body.trim()];
  if (o.chapters.length) parts.push(o.chapters.map((c) => `${c.time} ${c.title}`).join("\n"));
  if (o.sources.length) parts.push(`Sources${o.sourcesNote ? ` (${o.sourcesNote})` : ""}:\n${o.sources.map((s) => `- ${s}`).join("\n")}`);
  if (o.credits.length) parts.push(`Credits:\n${o.credits.join("\n")}`);
  parts.push(DISCLAIMER);
  if (o.hashtags.length) parts.push(o.hashtags.join(" "));
  return parts.join("\n\n") + "\n";
}

/** Tags trimmed so they fit (the model is told the limit; this only cuts from the end). */
export function fitTags(tags: string[]): string[] {
  const out: string[] = [];
  for (const t of tags.map((x) => x.trim()).filter(Boolean)) { if (out.length >= TAGS_COUNT || tagsLength([...out, t]) > TAGS_MAX) break; out.push(t); }
  return out;
}

/** Duration of the finished video in seconds (final, else draft, else the timeline plus the end-card hold). */
export function videoSeconds(id: string): number {
  const d = path.join(wsDir(id), "05-video");
  for (const f of ["final.mp4", "draft.mp4"]) {
    const p = path.join(d, f);
    if (!fs.existsSync(p)) continue;
    const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p], { encoding: "utf-8" });
    const s = parseFloat(r.stdout);
    if (Number.isFinite(s)) return s;
  }
  const t = readJson<any>(path.join(d, "timeline.json"));
  return t ? t.durationFrames / (t.fps || 30) + 5 : 0;
}

/** m:ss like YouTube's duration badge. */
export const badgeTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** The thumbnail file of a variant (PNG, or JPG when a PNG would pass 2 MB). */
export function thumbPath(id: string, v: string): string | null {
  for (const ext of ["png", "jpg"]) { const p = pubFile(id, `thumbnails/${v}.${ext}`); if (fs.existsSync(p)) return p; }
  return null;
}

/** Re-run every check on a metadata object (after a dashboard edit) and return the result. */
export function recheck(id: string, m: Metadata): { errors: string[]; warnings: string[] } {
  const pn = planNumbers(readJson(path.join(wsDir(id), "05-video/acts.json")));
  const proofs = VARIANTS.some((v) => m.titles?.[v]?.proof);
  const a = checkTitles(m.titles, pn, proofs ? { spoken: spokenText(readText(path.join(wsDir(id), "02-scripting/script_raw.md"))), durationS: m.durationS } : {}), b = checkTags(m.tags, m.hashtags), c = checkDescription(m.description);
  const src = sourceLines(id);
  return { errors: [...a.errors, ...b.errors, ...c.errors], warnings: [...a.warnings, ...b.warnings, ...c.warnings, ...src.warnings, ...buildChapters(id, m.durationS * 1000).warnings] };
}

/** Re-export the .srt when captions.json is newer (the voice was re-timed after the last export) or it is missing. */
export function freshSrt(video: string, srt: string, captions: string): void {
  const mt = (f: string) => { try { return fs.statSync(f).mtimeMs; } catch { return 0; } };
  if (!mt(captions) || mt(srt) >= mt(captions)) return;
  console.log(`↻ ${path.basename(srt)} is older than the captions: re-exporting it`);
  Bun.spawnSync(["bun", "run", "srt", "--video", video], { stdout: "ignore", stderr: "inherit" });
}

/**
 * The channel's packages so far, for the prompts: each video's published title with its click rate (from the analytics
 * snapshot, when the workspace is linked to its upload) and the words on its thumbnails. `self` (the video being
 * packaged) is marked: when it is already published, its own result is the best evidence there is.
 */
export function channelPackages(self: string): string[] {
  const snap = readJson<any>(path.join(REPO, "workspace/_analytics/snapshot.json"));
  let dirs: string[] = [];
  try { dirs = fs.readdirSync(path.join(REPO, "workspace")).filter((d) => !d.startsWith("_")).sort(); } catch {}
  const out: string[] = [];
  for (const d of dirs) {
    const yt = readJson<any>(pubFile(d, "youtube.json"))?.videoId;
    const v = yt ? (snap?.videos ?? []).find((x: any) => x.ytId === yt) : null;
    const info = readJson<Record<string, ThumbInfo>>(pubFile(d, "thumbnails.json"));
    // this video's thumbnails.json may already describe the new set being made, not what was published: leave its words out
    const words = d === self ? [] : VARIANTS.map((k) => info?.[k]?.text?.trim()).filter(Boolean);
    if (!v && !words.length) continue;
    const stats = v ? `"${v.title}": ${v.impressions ?? "?"} impressions${typeof v.ctr === "number" && v.impressions >= 100 ? `, ${(v.ctr * 100).toFixed(1)}% clicked` : ", too few impressions for a click rate"}, ${v.views} views` : "not published or not linked";
    out.push(`- ${d}${d === self ? " (THIS video, as it is published now)" : ""}: ${stats}${words.length ? `; thumbnail words tried: ${words.join(" / ")}` : ""}`);
  }
  return out;
}
