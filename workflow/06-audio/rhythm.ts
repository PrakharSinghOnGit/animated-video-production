/**
 * Music + beat for a short (or any video): pick a track, find its beats, and cut the picture to them.
 *
 *   bun run music:beat --video <ID> --track assets/music/<mood>/x.mp3 [--start 12.5 | --auto] [--gain -2]
 *   bun run music:beat --video <ID>            re-analyse with the track already chosen (after the voice changed)
 *   bun run music:beat --video <ID> --clear    no track: the short uses the generated bed and acts don't sync
 *
 * --start  where in the track the short begins (s); --auto = the first downbeat after any silent intro.
 * Writes 06-audio/rhythm.json (bpm, beats, downbeats, accents, energy per beat; seconds on the short's clock) and
 * 06-audio/music.json (one section: this track from --start, so Sound mixes exactly what the picture was cut to).
 * Assemble copies the beats into timeline.json; act code reads them as ctx.music (see the shorts ACT.md, kit beatPulse).
 * Run it after Align (the voice length is known) and before Plan/Act. Dashboard: Shorts → a short → Music & beat.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { REPO_ROOT, findPython, videoArg } from "./py";

const video = videoArg("music:beat");
const argv = process.argv.slice(2);
const flag = (n: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const ws = path.join(REPO_ROOT, "workspace", video);
const dir = path.join(ws, "06-audio");
const rhythmPath = path.join(dir, "rhythm.json"), musicPath = path.join(dir, "music.json");
fs.mkdirSync(dir, { recursive: true });

if (argv.includes("--clear")) {
  for (const p of [rhythmPath]) fs.rmSync(p, { force: true });
  // a music.json written by this step goes too, so Sound builds the generated bed again
  try { if (JSON.parse(fs.readFileSync(musicPath, "utf-8")).fromBeat) fs.rmSync(musicPath); } catch { /* none */ }
  console.log("🎵 no track: Sound will build the generated bed; acts won't sync to beats (re-run Plan/Act if they did)");
  process.exit(0);
}

const old = fs.existsSync(rhythmPath) ? JSON.parse(fs.readFileSync(rhythmPath, "utf-8")) : null;
const track = flag("--track") ?? old?.track;
if (!track) { console.error("❌ no track: pass --track assets/music/<mood>/<file> (or --clear)"); process.exit(1); }
const abs = path.isAbsolute(track) ? track : path.join(REPO_ROOT, track);
if (!fs.existsSync(abs)) { console.error(`❌ ${track} not found`); process.exit(1); }
const auto = argv.includes("--auto") || (!flag("--start") && old?.auto && flag("--track") === undefined);
const start = flag("--start") !== undefined ? Number(flag("--start")) : auto ? 0 : old && !flag("--track") ? old.requestedStart ?? old.start : 0;
const gainDb = flag("--gain") !== undefined ? Number(flag("--gain")) : old?.gainDb ?? 0;
if (!Number.isFinite(start) || start < 0) { console.error("❌ --start must be seconds ≥ 0"); process.exit(1); }

// the short's length: the mastered voice (+ the end hold)
const voice = [path.join(dir, "voiceover_master.wav"), path.join(ws, "03-voiceover/audio/combined/full_voiceover.wav")].find((p) => fs.existsSync(p));
if (!voice) { console.error("❌ no voice yet: run Voice and Align first"); process.exit(1); }
const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", voice], { encoding: "utf-8" });
const dur = parseFloat(probe.stdout) + 1.5;

const r = spawnSync(findPython(), [path.join(import.meta.dir, "rhythm.py"), abs, "--start", String(start), "--dur", dur.toFixed(2), ...(auto ? ["--auto"] : [])], { encoding: "utf-8", cwd: REPO_ROOT, maxBuffer: 1 << 24 });
if (r.status !== 0) { console.error(`❌ rhythm.py failed: ${(r.stderr || r.stdout).slice(-400)}`); process.exit(1); }
const res = JSON.parse(r.stdout);
if (res.error) { console.error(`❌ ${res.error}`); process.exit(1); }
if (res.trackDur - res.start < dur) console.warn(`⚠️  the track runs out ${(dur - (res.trackDur - res.start)).toFixed(1)} s before the short ends (it loops there); pick an earlier start`);

const rel = path.relative(REPO_ROOT, abs);
const lib = (() => { try { return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "assets/music/index.json"), "utf-8")).tracks.find((t: any) => t.file === rel); } catch { return null; } })();
const out = { track: rel, title: lib?.title ?? path.basename(rel), license: lib?.license, credit: lib?.credit, auto, requestedStart: start, gainDb, at: new Date().toISOString(), ...res };
fs.writeFileSync(rhythmPath, JSON.stringify(out, null, 2));
fs.writeFileSync(musicPath, JSON.stringify({
  version: 1, sr: 48000, duration: dur, crossfadeSec: 0, fromBeat: true,
  sections: [{ t0: 0, t1: dur, label: "track", source: { type: "file", path: rel, start: res.start, gainDb, bpm: res.bpm, ...(lib?.credit ? { credit: lib.credit } : {}) } }],
  hits: [],
}, null, 2));
const strong = res.accents.filter((a: any) => a.s >= 0.6).length;
console.log(`🎵 ${out.title}: ${res.bpm} BPM (confidence ${res.confidence}), from ${res.start.toFixed(2)} s · ${res.beats.length} beats, ${res.downbeats.length} bars, ${strong} big accents over ${dur.toFixed(1)} s`);
if (res.confidence < 0.5) console.warn("⚠️  the beat is irregular here (rubato, ambient or a tempo change): syncing will feel loose; pick a steadier track or section");
console.log("   → Plan and Act now cut to this beat (ctx.music); Sound mixes this track. Re-run Assemble if the acts already exist.");
