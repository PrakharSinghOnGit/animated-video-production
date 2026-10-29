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
}
export interface ThumbInfo { concept: string; text: string; numbers: string[]; focal: string; hypothesis: string; clear: string }

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

export function checkTitles(titles: Record<Variant, Package>, pn: PlanNumbers): { errors: string[]; warnings: string[] } {
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
  return { errors, warnings };
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
  const a = checkTitles(m.titles, pn), b = checkTags(m.tags, m.hashtags), c = checkDescription(m.description);
  const src = sourceLines(id);
  return { errors: [...a.errors, ...b.errors, ...c.errors], warnings: [...a.warnings, ...b.warnings, ...c.warnings, ...src.warnings, ...buildChapters(id, m.durationS * 1000).warnings] };
}
