/**
 * What the dashboard's Voice → Listen & Review pages show for each section, written beside the audio:
 *   audio/sections.json  every section in script order: id, part, file, text, tone note and the exact Gemini direction
 *   audio/pauses.json    silences inside each section longer than PAUSE_S (the TTS sometimes stops mid-sentence),
 *                        cached by file mtime so a re-scan only reads changed files
 * The silence at the start and end of a file (the trimmed tail and the gap Speed & gaps appends) is not counted.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { VOSection } from "./types";

export const PAUSE_S = 0.9;
const EDGE_S = 0.08;

export interface Pause { at: number; dur: number }

/** Silences longer than PAUSE_S that start and end inside the speech. */
export function findPauses(wav: string): Pause[] {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", wav, "-af", `silencedetect=noise=-42dB:d=${PAUSE_S}`, "-f", "null", "-"], { encoding: "utf-8" });
  const log = r.stderr ?? "";
  const total = parseFloat(log.match(/Duration: (\d+):(\d+):([\d.]+)/)?.slice(1).reduce((s, v, i) => s + parseFloat(v) * [3600, 60, 1][i], 0).toString() ?? "0");
  const out: Pause[] = [];
  let start: number | null = null;
  for (const line of log.split("\n")) {
    const s = line.match(/silence_start: (-?[\d.]+)/), e = line.match(/silence_end: ([\d.]+) \| silence_duration: ([\d.]+)/);
    if (s) start = Math.max(0, parseFloat(s[1]));
    if (e && start !== null) {
      const end = parseFloat(e[1]);
      if (start > EDGE_S && (!total || end < total - EDGE_S)) out.push({ at: +start.toFixed(2), dur: +parseFloat(e[2]).toFixed(2) });
      start = null;
    }
  }
  return out;   // a silence still open at the end of the file is the tail: not counted
}

/** The Gemini direction a section is read with: base style + its tone note (same rule as generate.ts). */
export function sectionStyle(base: string, instruction?: string): string {
  const tone = (instruction ?? "").replace(/^[\s`\[]*VO\s*:\s*/i, "").replace(/[\]`]+\s*$/, "").trim();
  return tone ? `${base}. This passage: ${tone}.` : base;
}

/** Writes audio/sections.json and audio/pauses.json for the sections that have a file. */
export function scanVoice(audioDir: string, sections: VOSection[], baseStyle: string): { flagged: number } {
  const rows = sections.map((s, i) => {
    const file = `part-${s.part}/${String(i + 1).padStart(2, "0")}_${s.id}.wav`;
    return { id: s.id, part: s.part, partTitle: s.partTitle, chapterTitle: s.chapterTitle ?? null, file, text: s.text, instruction: s.rawInstruction ?? "", direction: sectionStyle(baseStyle, s.rawInstruction) };
  });
  fs.writeFileSync(path.join(audioDir, "sections.json"), JSON.stringify({ at: new Date().toISOString(), baseStyle, sections: rows }, null, 2));
  const cacheFile = path.join(audioDir, "pauses.json");
  let cache: Record<string, { mtime: number; pauses: Pause[] }> = {};
  try { cache = JSON.parse(fs.readFileSync(cacheFile, "utf-8")).files ?? {}; } catch {}
  const files: typeof cache = {};
  let flagged = 0;
  for (const r of rows) {
    const abs = path.join(audioDir, r.file);
    if (!fs.existsSync(abs)) continue;
    const mtime = fs.statSync(abs).mtimeMs;
    files[r.file] = cache[r.file]?.mtime === mtime ? cache[r.file] : { mtime, pauses: findPauses(abs) };
    if (files[r.file].pauses.length) flagged++;
  }
  fs.writeFileSync(cacheFile, JSON.stringify({ at: new Date().toISOString(), minPause: PAUSE_S, files }, null, 2));
  return { flagged };
}
