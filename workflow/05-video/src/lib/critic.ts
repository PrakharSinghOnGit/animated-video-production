/**
 * What the vision critic and the reviewer get from `bun run frames`: the motion grids, the contact sheet and the
 * deterministic findings (review/<act>/checks.json, written by scripts/act_checks.py), plus the rubric's caps applied in code.
 */
import fs from "node:fs";
import path from "node:path";

export type Severity = "high" | "medium" | "low";
export interface Finding {
  id: number; kind: string; severity: Severity; t: number; t1?: number; msg: string;
  /** fractions of the frame: x0, y0, x1, y1 */
  box?: [number, number, number, number];
}
export interface Checks { act?: string; dur?: number; findings: Finding[]; grids?: { file: string; from: number; to: number }[]; counts?: Record<string, number> }

/** Finding kinds precise enough on the existing acts to send straight back to the author (no critic call needed for them). */
export const GATE_KINDS = new Set(["blank", "text-clipped"]);

export function readChecks(reviewDir: string): Checks | null {
  try { return JSON.parse(fs.readFileSync(path.join(reviewDir, "checks.json"), "utf-8")); } catch { return null; }
}

/** The motion grids in time order (absolute paths). */
export function gridFiles(reviewDir: string): string[] {
  if (!fs.existsSync(reviewDir)) return [];
  return fs.readdirSync(reviewDir).filter((f) => /^grid_\d+\.jpg$/.test(f)).sort().map((f) => path.join(reviewDir, f));
}

/** One line per finding, low ones summarised, for a prompt. */
export function checksText(c: Checks | null, maxLow = 10): string {
  if (!c) return "(no checks.json: the frames were rendered without the dense pass)";
  if (!c.findings.length) return "None: no pop-ins, blanks, freezes, cuts, clipped/overlapping/low-contrast text, late hits or unsettled ending measured.";
  const main = c.findings.filter((f) => f.severity !== "low");
  const low = c.findings.filter((f) => f.severity === "low");
  const lines = main.map((f) => `#${f.id} [${f.severity}] ${f.kind} ${f.t}s${f.t1 ? `–${f.t1}s` : ""}: ${f.msg}`);
  if (low.length) lines.push(`low (glance at them; usually fine): ${low.slice(0, maxLow).map((f) => `#${f.id} ${f.kind} ${f.t}s`).join(", ")}${low.length > maxLow ? ` and ${low.length - maxLow} more` : ""}`);
  return lines.join("\n");
}

/** Findings for the author's free gate: high severity, of a kind measured to be precise. */
export function gateFindings(c: Checks | null): Finding[] {
  return (c?.findings ?? []).filter((f) => f.severity === "high" && GATE_KINDS.has(f.kind));
}

export interface Verdict {
  scores?: Record<string, number>; score?: number; pass?: boolean;
  findings?: { id: number; verdict: "real" | "false"; why?: string }[];
  issues?: { time?: string; dimension?: string; severity?: Severity; finding?: number; problem?: string; fix?: string }[];
}

/**
 * The rubric's caps, applied in code (a model's arithmetic is not trusted): a confirmed high finding, a high issue or any
 * dimension at 1 caps the score at 5; any dimension at 2 caps it at 6. pass = score >= 7 and no high issue.
 */
export function applyCaps(v: Verdict, c: Checks | null): Verdict & { score: number; pass: boolean; capped?: string } {
  const dims = Object.values(v.scores ?? {}).filter((n) => typeof n === "number");
  const real = new Set((v.findings ?? []).filter((f) => f.verdict === "real").map((f) => f.id));
  const highReal = (c?.findings ?? []).some((f) => f.severity === "high" && real.has(f.id));
  const highIssue = (v.issues ?? []).some((i) => i.severity === "high");
  let score = Math.max(1, Math.min(10, Math.round(Number(v.score) || 0) || 1)), capped: string | undefined;
  const cap = (n: number, why: string) => { if (score > n) { score = n; capped = why; } };
  if (dims.some((n) => n <= 1)) cap(5, "a dimension scored 1");
  if (highReal) cap(5, "a high finding confirmed");
  if (highIssue) cap(5, "a high issue");
  if (dims.some((n) => n === 2)) cap(6, "a dimension scored 2");
  return { ...v, score, pass: score >= 7 && !highIssue && !!(v.pass ?? true), ...(capped ? { capped } : {}) };
}

/** The critic's issues as note lines for the author (confirmed findings included, false ones left out). */
export function verdictNotes(v: Verdict, c: Checks | null): string {
  const byId = new Map((c?.findings ?? []).map((f) => [f.id, f]));
  const falseIds = new Set((v.findings ?? []).filter((f) => f.verdict === "false").map((f) => f.id));
  const lines = (v.issues ?? []).map((i) => {
    const f = i.finding ? byId.get(i.finding) : undefined;
    return `- ${i.time ?? (f ? `${f.t}s` : "")}${i.dimension ? ` [${i.dimension}]` : ""}: ${i.problem ?? f?.msg ?? ""} → ${i.fix ?? ""}`;
  });
  // confirmed medium/high findings the critic did not turn into an issue still go to the author
  const cited = new Set((v.issues ?? []).map((i) => i.finding).filter(Boolean));
  for (const f of c?.findings ?? []) {
    if (f.severity === "low" || cited.has(f.id) || falseIds.has(f.id)) continue;
    if ((v.findings ?? []).some((x) => x.id === f.id && x.verdict === "real")) lines.push(`- ${f.t}s [measured ${f.kind}]: ${f.msg}`);
  }
  return lines.join("\n");
}
