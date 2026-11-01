/**
 * The learning layer: lessons learned from channel analytics, kept apart from the hand-written prompts.
 *
 * - `workflow/learning/lessons.json` (in git) holds every lesson the analytics reviewer proposed, with its status:
 *   proposed → active (approved) → retired (rolled back), or proposed → rejected. Nothing becomes active without a click.
 * - `loadPrompt(name)` returns `workflow/prompts/<name>.md` plus the active lessons for that prompt, so every pipeline
 *   step that loads a prompt picks them up. With `{ video }` it also records which lessons that video was made with
 *   (`workspace/<VID>/lessons_used.json`) so a lesson's effect can be checked against later videos.
 * - Every change bumps `version` and appends to `log`, so any state can be traced; git gives a full rollback on top.
 */
import fs from "node:fs";
import path from "node:path";

export const REPO = path.resolve(import.meta.dir, "../..");
export const LESSONS_FILE = process.env.WG_LESSONS_FILE ?? path.join(REPO, "workflow/learning/lessons.json");

/** Prompts a lesson may target (files in workflow/prompts/). */
export const TARGETS = ["WRITER", "META", "THUMBS", "DIRECTOR", "ACT", "SHORTS_WRITER", "SHORT_DIRECTOR", "SHORT_ACT"] as const;
export type Target = (typeof TARGETS)[number];
export const TARGET_INFO: Record<Target, string> = {
  WRITER: "script: hook, structure, pacing, promise payoff, call to action",
  META: "titles, description, tags",
  THUMBS: "thumbnail concepts and design",
  DIRECTOR: "act plan: act lengths, visual rhythm, chapters",
  ACT: "how each act is drawn and animated",
  SHORTS_WRITER: "shorts scripts",
  SHORT_DIRECTOR: "shorts act plan",
  SHORT_ACT: "shorts act drawing",
};
/** Active lessons per prompt are capped so prompts do not bloat; approving past the cap needs a retirement first. */
export const ACTIVE_CAP = 10;

export type Status = "proposed" | "active" | "rejected" | "retired";
export interface Evidence { video: string; metric: string; value: string; baseline?: string; note?: string }
export interface Lesson {
  id: string;
  target: Target;
  rule: string;
  why: string;
  evidence: Evidence[];
  confidence: "low" | "medium" | "high";
  /** how many videos the lesson rests on */
  basis: number;
  status: Status;
  createdAt: string;
  decidedAt?: string;
  /** the review run that proposed it */
  source?: { review: string; agent: string };
  /** an active lesson this one would replace */
  replaces?: string;
  /** what to watch in the next videos to confirm or retire it */
  verify?: string;
  /** set by the user when they reject or retire */
  reason?: string;
}
export interface LogEntry { at: string; action: "propose" | "approve" | "reject" | "retire" | "restore" | "edit"; id: string; note?: string; version: number }
export interface Store { version: number; lessons: Lesson[]; log: LogEntry[] }

export function readStore(): Store {
  try {
    const s = JSON.parse(fs.readFileSync(LESSONS_FILE, "utf-8"));
    return { version: Number(s.version) || 0, lessons: Array.isArray(s.lessons) ? s.lessons : [], log: Array.isArray(s.log) ? s.log : [] };
  } catch {
    return { version: 0, lessons: [], log: [] };
  }
}

function writeStore(s: Store) {
  fs.mkdirSync(path.dirname(LESSONS_FILE), { recursive: true });
  const tmp = `${LESSONS_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2) + "\n", "utf-8");
  fs.renameSync(tmp, LESSONS_FILE);
}

const nextId = (s: Store) => `L${String(s.lessons.reduce((m, l) => Math.max(m, parseInt(l.id.slice(1), 10) || 0), 0) + 1).padStart(3, "0")}`;
const isTarget = (t: unknown): t is Target => TARGETS.includes(t as Target);

/** Add proposals from a review run. Returns the ids created (invalid or duplicate proposals are skipped). */
export function propose(items: Partial<Lesson>[], source: Lesson["source"]): string[] {
  const s = readStore();
  const ids: string[] = [];
  const norm = (t: string) => t.toLowerCase().replace(/\W+/g, " ").trim();
  for (const it of items) {
    if (!isTarget(it.target) || typeof it.rule !== "string" || !it.rule.trim()) continue;
    if (s.lessons.some((l) => l.target === it.target && norm(l.rule) === norm(it.rule!) && l.status !== "retired")) continue;
    const l: Lesson = {
      id: nextId(s), target: it.target, rule: it.rule.trim(), why: String(it.why ?? "").trim(),
      evidence: Array.isArray(it.evidence) ? it.evidence.slice(0, 8).map((e: any) => ({ video: String(e.video ?? ""), metric: String(e.metric ?? ""), value: String(e.value ?? ""), baseline: e.baseline ? String(e.baseline) : undefined, note: e.note ? String(e.note) : undefined })) : [],
      confidence: it.confidence === "high" || it.confidence === "medium" ? it.confidence : "low",
      basis: Math.max(1, Number(it.basis) || 1), status: "proposed", createdAt: new Date().toISOString(), source,
      replaces: typeof it.replaces === "string" && /^L\d+$/.test(it.replaces) ? it.replaces : undefined,
      verify: it.verify ? String(it.verify) : undefined,
    };
    s.lessons.push(l);
    s.version++;
    s.log.push({ at: l.createdAt, action: "propose", id: l.id, version: s.version });
    ids.push(l.id);
  }
  if (ids.length) writeStore(s);
  return ids;
}

/** approve | reject | retire (roll back an active lesson) | restore (re-activate a retired or rejected one) | edit (proposed only). */
export function decide(id: string, action: "approve" | "reject" | "retire" | "restore" | "edit", opts: { reason?: string; rule?: string } = {}): Store {
  const s = readStore();
  const l = s.lessons.find((x) => x.id === id);
  if (!l) throw new Error(`no lesson ${id}`);
  const activeFor = (t: Target) => s.lessons.filter((x) => x.target === t && x.status === "active").length;
  const now = new Date().toISOString();
  if (action === "edit") {
    if (l.status !== "proposed") throw new Error("only a proposed lesson can be edited");
    if (!opts.rule?.trim()) throw new Error("rule is empty");
    l.rule = opts.rule.trim();
  } else if (action === "approve" || action === "restore") {
    if (action === "approve" && l.status !== "proposed") throw new Error(`${id} is ${l.status}, not proposed`);
    if (action === "restore" && l.status !== "retired" && l.status !== "rejected") throw new Error(`${id} is ${l.status}`);
    if (opts.rule?.trim()) l.rule = opts.rule.trim();
    // a lesson that replaces another retires it in the same step
    const rep = l.replaces ? s.lessons.find((x) => x.id === l.replaces && x.status === "active") : undefined;
    if (activeFor(l.target) - (rep ? 1 : 0) >= ACTIVE_CAP) throw new Error(`${l.target} already has ${ACTIVE_CAP} active lessons: retire one first`);
    if (rep) { rep.status = "retired"; rep.decidedAt = now; rep.reason = `replaced by ${l.id}`; s.version++; s.log.push({ at: now, action: "retire", id: rep.id, note: `replaced by ${l.id}`, version: s.version }); }
    l.status = "active";
  } else if (action === "reject") {
    if (l.status !== "proposed") throw new Error(`${id} is ${l.status}, not proposed`);
    l.status = "rejected";
  } else if (action === "retire") {
    if (l.status !== "active") throw new Error(`${id} is ${l.status}, not active`);
    l.status = "retired";
  }
  if (action !== "edit") { l.decidedAt = now; if (opts.reason) l.reason = opts.reason; }
  s.version++;
  s.log.push({ at: now, action, id, note: opts.reason, version: s.version });
  writeStore(s);
  return s;
}

export const activeLessons = (target: string, s = readStore()) => s.lessons.filter((l) => l.target === target && l.status === "active");

/** The block appended to a prompt (empty when it has no active lessons). */
export function lessonsBlock(target: string, s = readStore()): string {
  const act = activeLessons(target, s);
  if (!act.length) return "";
  return `\n\n## Channel lessons (learned from this channel's YouTube analytics, approved by the creator)
Apply these on top of the rules above. If one conflicts with a hard rule above (facts, sourcing, format), the rule above wins.
${act.map((l) => `- ${l.rule}${l.why ? ` (Why: ${l.why})` : ""}`).join("\n")}\n`;
}

/**
 * Read workflow/prompts/<name>.md with its active lessons appended. Pass `video` (a workspace id or path under workspace/)
 * to record which lessons the video was made with.
 */
export function loadPrompt(name: string, opts: { video?: string } = {}): string {
  const base = fs.readFileSync(path.join(REPO, "workflow/prompts", `${name}.md`), "utf-8");
  const s = readStore();
  const block = lessonsBlock(name, s);
  if (opts.video) {
    try {
      const dir = path.isAbsolute(opts.video) ? opts.video : path.join(REPO, "workspace", opts.video);
      if (fs.existsSync(dir)) {
        const f = path.join(dir, "lessons_used.json");
        let used: Record<string, any> = {};
        try { used = JSON.parse(fs.readFileSync(f, "utf-8")); } catch {}
        used[name] = { version: s.version, ids: activeLessons(name, s).map((l) => l.id), at: new Date().toISOString() };
        fs.writeFileSync(f, JSON.stringify(used, null, 2) + "\n", "utf-8");
      }
    } catch {}
  }
  return base + block;
}
