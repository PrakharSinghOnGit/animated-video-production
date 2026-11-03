/**
 * Music library: assets/music/index.json lists every track the per-chapter bed may use.
 *
 *   bun run music:lib            add new audio files under assets/music/ (measured: length, BPM, energy), drop missing ones
 *   bun run music:lib --remeasure   measure every track again (keeps your edits to mood/licence/credit)
 *
 * Put tracks in a mood folder and they are tagged with it: assets/music/<mood>/<file>.mp3, mood one of
 * calm | hopeful | curious | tense | dark | driving | triumphant (anything else is kept as is). Files at the top level are
 * "untagged" until you edit index.json. Licence: "own" for tracks you made, else what the source says (the credit line goes
 * in the description when the licence needs one). `music:gen` adds its tracks here itself.
 * audio:music picks from this index for each section (mood from the section's mode, energy from its intensity) and falls back
 * to the synth palettes when the library is empty.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { REPO_ROOT, findPython } from "./py";

export const MUSIC_DIR = path.join(REPO_ROOT, "assets/music");
export const INDEX = path.join(MUSIC_DIR, "index.json");
export const MOODS = ["calm", "hopeful", "curious", "tense", "dark", "driving", "triumphant"] as const;
const AUDIO = /\.(mp3|wav|m4a|aac|flac|ogg)$/i;

export interface Track {
  /** path from the repo root */
  file: string;
  title: string;
  mood: string[];
  bpm: number | null;
  /** 0 sparse bed .. 1 driving */
  energy: number | null;
  duration: number;
  source: string;
  license: string;
  credit?: string;
  prompt?: string;
  seed?: number;
  added: string;
}
export interface Library { version: 1; tracks: Track[] }

export const readLibrary = (): Library => (fs.existsSync(INDEX) ? JSON.parse(fs.readFileSync(INDEX, "utf-8")) : { version: 1, tracks: [] });
export const writeLibrary = (lib: Library) => { fs.mkdirSync(MUSIC_DIR, { recursive: true }); fs.writeFileSync(INDEX, JSON.stringify(lib, null, 2) + "\n"); };

/** Duration, BPM and energy for these files (paths from the repo root). */
export function measure(files: string[]): Record<string, { duration: number; bpm: number; energy: number } | { error: string }> {
  if (!files.length) return {};
  const r = spawnSync(findPython(), [path.join(import.meta.dir, "music_lib.py"), ...files.map((f) => path.join(REPO_ROOT, f))], { encoding: "utf-8", cwd: REPO_ROOT, maxBuffer: 1 << 24 });
  if (r.status !== 0) throw new Error(`music_lib.py failed: ${r.stderr.slice(-400)}`);
  return Object.fromEntries((JSON.parse(r.stdout) as any[]).map((m) => [path.relative(REPO_ROOT, m.file), m]));
}

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? (e.name === "epidemic" ? [] : walk(p)) : AUDIO.test(e.name) ? [path.relative(REPO_ROOT, p)] : [];
  });
}

if (import.meta.main) {
  const remeasure = process.argv.includes("--remeasure");
  const lib = readLibrary();
  const onDisk = new Set(walk(MUSIC_DIR));
  const gone = lib.tracks.filter((t) => !onDisk.has(t.file));
  lib.tracks = lib.tracks.filter((t) => onDisk.has(t.file));
  const known = new Set(lib.tracks.map((t) => t.file));
  const fresh = [...onDisk].filter((f) => !known.has(f)).sort();
  const todo = remeasure ? [...onDisk] : fresh;
  const m = measure(todo);
  for (const f of fresh) {
    const folder = path.relative("assets/music", path.dirname(f)).split(path.sep)[0];
    lib.tracks.push({
      file: f, title: path.basename(f).replace(AUDIO, "").replace(/[_-]+/g, " "),
      mood: folder && folder !== "." && folder !== "generated" ? [folder] : ["untagged"],
      bpm: null, energy: null, duration: 0, source: "own", license: "own", added: new Date().toISOString().slice(0, 10),
    });
  }
  for (const t of lib.tracks) {
    const r = m[t.file];
    if (!r) continue;
    if ("error" in r) { console.warn(`[music:lib] ${t.file}: ${r.error}`); continue; }
    t.duration = r.duration; t.bpm = r.bpm; t.energy = r.energy;
  }
  lib.tracks.sort((a, b) => a.file.localeCompare(b.file));
  writeLibrary(lib);
  for (const f of fresh) { const t = lib.tracks.find((x) => x.file === f)!; console.log(`[music:lib] + ${f}  ${t.duration.toFixed(0)} s · ${t.bpm ?? "?"} BPM · energy ${t.energy ?? "?"} · ${t.mood.join(",")}`); }
  for (const t of gone) console.log(`[music:lib] - ${t.file} (file gone)`);
  const untagged = lib.tracks.filter((t) => t.mood.includes("untagged"));
  console.log(`[music:lib] ${lib.tracks.length} tracks in ${path.relative(REPO_ROOT, INDEX)}${untagged.length ? ` · ${untagged.length} untagged: move them into a mood folder (${MOODS.join(", ")}) and run again, or edit "mood"` : ""}`);
}
