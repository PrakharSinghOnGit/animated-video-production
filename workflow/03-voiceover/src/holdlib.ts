/**
 * Holds ("breathing room"): extra pauses in the voice where the picture needs time. Stored in 03-voiceover/holds.json,
 * applied by tts:post (Align → Merge) at true pause points only, and the plan's times are shifted to match afterwards.
 *
 * Where a hold may go: after a sentence/phrase end or around a joining word (and, but, so, ...), and only where the take
 * is actually silent (holds.py checks the waveform: no breath, no tail). A hold at "end" lengthens the gap after a section.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export interface Hold {
  id: string;
  /** voice section file id, e.g. "05_part2_02_beat" */
  section: string;
  /** index of the word the pause follows (in that section's transcript), or "end" = after the section */
  after: number | "end";
  /** the word it follows and the next one (for display) */
  word: string;
  next?: string;
  ms: number;
  on: boolean;
  /** "you" | "director" | "author A03" */
  by: string;
  why?: string;
  act?: string;
  /** set by import when a request was moved to the nearest clean pause point */
  note?: string;
  /** request key (by + act + word + occurrence) so a re-import updates instead of duplicating */
  key?: string;
}
export interface HoldsFile { holds: Hold[] }

/** One hold as tts:post applied it. baseAt = position in the voiceover without any holds (s); mergedAt = with them. */
export interface Applied { id: string; section: string; after: number | "end"; ms: number; local: number | null; baseAt: number | null; mergedAt: number | null; ok: boolean; why?: string }

export interface Point { after: number; word: string; next: string; t0: number; t1: number; at: number | null; quietDb: number | null; clean: boolean; why: string }
export interface PointsFile { at: string; sections: Record<string, { points: Point[]; dur: number; words: number; error?: string }> }

export const MAX_HOLD_MS = 4000;
export const holdsPath = (ws: string) => path.join(ws, "03-voiceover", "holds.json");
export const pointsPath = (ws: string) => path.join(ws, "03-voiceover", "audio", "hold_points.json");
export const retimePath = (ws: string) => path.join(ws, "03-voiceover", "audio", "retime.json");
export const wordsPath = (ws: string, section: string) => path.join(ws, "04-transcription", "words", `${section}.json`);

export function readJson<T>(p: string, fallback: T): T { try { return JSON.parse(fs.readFileSync(p, "utf-8")); } catch { return fallback; } }
export const readHolds = (ws: string): HoldsFile => readJson(holdsPath(ws), { holds: [] });
export function writeHolds(ws: string, h: HoldsFile) {
  h.holds.sort((a, b) => a.section.localeCompare(b.section, undefined, { numeric: true }) || (a.after === "end" ? 1e9 : a.after) - (b.after === "end" ? 1e9 : b.after));
  fs.writeFileSync(holdsPath(ws), JSON.stringify(h, null, 2) + "\n");
}

export function python(): string {
  const repo = path.resolve(import.meta.dir, "..", "..", "..");
  if (process.env.WG_PYTHON) return process.env.WG_PYTHON;
  const v = path.join(repo, ".venv/bin/python");
  return fs.existsSync(v) ? v : "python3";
}
export function holdsPy(args: string[]): any {
  const r = spawnSync(python(), [path.join(import.meta.dir, "holds.py"), ...args], { encoding: "utf-8", maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`holds.py ${args[0]} failed: ${(r.stderr || r.stdout).slice(-500)}`);
  return JSON.parse(r.stdout);
}

/** A time in the voiceover WITH the listed holds -> the same moment without them (inside a held pause: its cut point). */
export function toBase(t: number, list: { baseAt: number | null; ms: number }[]): number {
  let cum = 0;
  for (const h of [...list].filter((x) => x.baseAt != null).sort((a, b) => a.baseAt! - b.baseAt!)) {
    const at = h.baseAt! + cum, len = h.ms / 1000;
    if (t >= at + len) cum += len;
    else if (t > at) return h.baseAt!;
    else break;
  }
  return t - cum;
}
/** A time in the voiceover without holds -> with these holds. A moment exactly at a cut moves after it, so the pause
 *  belongs to whatever ends there (the act or beat before it gets the extra time). */
export function fromBase(b: number, list: { baseAt: number | null; ms: number }[]): number {
  return b + list.filter((h) => h.baseAt != null && h.baseAt <= b + 1e-6).reduce((s, h) => s + h.ms / 1000, 0);
}
