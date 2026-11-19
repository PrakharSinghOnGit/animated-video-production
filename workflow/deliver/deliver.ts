/**
 * Downloads for a finished video or short: picture and audio variants, stems, every SFX clip and a Final Cut Pro project.
 *
 * Usage: bun run deliver --video <ID | ID/shorts/S1> [--only key1,key2] [--open]
 *        bun run fcp     --video <ID> [--open]          (= deliver --only fcp)
 *
 * Writes <ws>/08-deliver/ and deliver.json { builtAt, video, items: [{ key, group, label, file, bytes, note? }] }
 * (file relative to the workspace). Keys:
 *   video  video_final (05-video/final.mp4 as rendered), video_full, video_voice_sfx, video_voice_music, video_voice, video_silent
 *   audio  audio_full, audio_voice_sfx, audio_voice_music, audio_voice   (fresh mix.py mixes, -14 LUFS)
 *   stems  stem_voice, stem_sfx, stem_music   (what audio_full sums, before the bus compressor/limiter)
 *   sfx    sfx_zip (one WAV per SFX event + manifest.json; the event's gain is NOT baked in, it is listed and set in FCP)
 *   project fcp (08-deliver/fcp/<name>.fcpxml: picture, voice, every SFX on its own clip, music, act markers)
 * Picture comes from final.mp4 (draft.mp4 if there is no final). Music variants need 06-audio/music.wav (audio:music).
 * Shorts use the shorts music level (--music-db 1 --duck-db -9). The FCP project references files in 08-deliver/
 * (video_silent.mp4, sfx/) and 06-audio/, so keep them while you edit in Final Cut Pro.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { REPO_ROOT, findPython, videoArg } from "../06-audio/py";
import { buildFcpxml, type FcpClip } from "./fcpxml";
import { tryRefreshLibrary } from "../../scripts/library";

const TAG = "deliver";
const video = videoArg(TAG);
const argv = process.argv.slice(2);
const val = (n: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const ws = path.join(REPO_ROOT, "workspace", video);
const out = path.join(ws, "08-deliver");
const rel = (p: string) => path.relative(ws, p);
const exists = (p: string) => fs.existsSync(p);
const readJson = (p: string) => (exists(p) ? JSON.parse(fs.readFileSync(p, "utf-8")) : undefined);
function die(m: string): never { console.error(`[${TAG}] ERROR: ${m}`); process.exit(1); }
function run(cmd: string, args: string[], what: string) {
  const r = spawnSync(cmd, args, { cwd: REPO_ROOT, encoding: "utf-8" });
  if (r.status !== 0) die(`${what} failed (exit ${r.status}):\n${(r.stderr || r.stdout).trim().split("\n").slice(-8).join("\n")}`);
  return r.stdout;
}
const probeDur = (f: string) => parseFloat(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], "ffprobe").trim());
const probeWH = (f: string) => run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", f], "ffprobe").trim().split(",").map(Number);

if (!exists(ws)) die(`no workspace ${video}`);
const isShort = readJson(path.join(ws, "config.json"))?.format === "short";
const finalMp4 = path.join(ws, "05-video/final.mp4"), draftMp4 = path.join(ws, "05-video/draft.mp4");
const picture = exists(finalMp4) ? finalMp4 : exists(draftMp4) ? draftMp4 : die("no final.mp4 or draft.mp4 yet (render first)");
const voice = [path.join(ws, "06-audio/voiceover_master.wav"), path.join(ws, "05-video/public/voiceover.wav")].find(exists) ?? die("no voiceover_master.wav (run audio:master)");
const music = path.join(ws, "06-audio/music.wav");
const hasMusic = exists(music);
const events = path.join(ws, "05-video/events.json");
const hasEvents = exists(events);
const timeline = readJson(path.join(ws, "05-video/timeline.json"));
const MUSIC_FLAGS = isShort ? ["--music-db", "1", "--duck-db", "-9"] : [];

// ---------------------------------------------------------------- what to build
type Mix = { sfx: boolean; music: boolean };
const MIXES: Record<string, Mix & { label: string }> = {
  full: { sfx: true, music: true, label: "Voice + SFX + music" },
  voice_sfx: { sfx: true, music: false, label: "Voice + SFX (no music)" },
  voice_music: { sfx: false, music: true, label: "Voice + music (no SFX)" },
  voice: { sfx: false, music: false, label: "Voice only" },
};
const ALL = ["video_final", "video_silent", ...Object.keys(MIXES).flatMap((m) => [`video_${m}`, `audio_${m}`]), "stem_voice", "stem_sfx", "stem_music", "sfx_zip", "fcp"];
const only = (val("--only") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
for (const k of only) if (!ALL.includes(k)) die(`unknown key "${k}" (${ALL.join(", ")})`);
const want = new Set(only.length ? only : ALL);
fs.mkdirSync(out, { recursive: true });

const prev: any[] = readJson(path.join(out, "deliver.json"))?.items ?? [];
const items = new Map<string, any>(prev.filter((i) => exists(path.join(ws, i.file))).map((i) => [i.key, i]));
const put = (key: string, group: string, label: string, file: string, note?: string) =>
  items.set(key, { key, group, label, file: rel(file), bytes: fs.statSync(file).size, ...(note ? { note } : {}) });
for (const k of want) items.delete(k);

// ---------------------------------------------------------------- picture
if (want.has("video_final")) put("video_final", "video", picture === finalMp4 ? "Final (as rendered)" : "Draft (no final yet)", picture);
const silent = path.join(out, "video_silent.mp4");
const needSilent = want.has("video_silent") || want.has("fcp") || [...want].some((k) => k.startsWith("video_") && k !== "video_final");
if (needSilent) {
  console.log(`[${TAG}] picture without audio ← ${rel(picture)}`);
  run("ffmpeg", ["-v", "error", "-y", "-i", picture, "-map", "0:v", "-c:v", "copy", "-an", silent], "silent video");
  if (want.has("video_silent")) put("video_silent", "video", "Picture only (no audio)", silent);
}

// ---------------------------------------------------------------- mixes, stems, muxes
const py = findPython();
for (const [name, m] of Object.entries(MIXES)) {
  const needAudio = want.has(`audio_${name}`) || want.has(`video_${name}`) || (name === "full" && ["stem_voice", "stem_sfx", "stem_music", "fcp"].some((k) => want.has(k)));
  if (!needAudio) continue;
  if ((m.music && !hasMusic) || (m.sfx && !hasEvents)) {
    console.log(`[${TAG}] skip ${name}: ${m.music && !hasMusic ? "no 06-audio/music.wav (bun run audio:music)" : "no events.json (bun run cues)"}`);
    continue;
  }
  const keep = want.has(`audio_${name}`);   // otherwise a temp file: never clobber an earlier delivered audio_*.wav
  const wav = path.join(out, keep ? `audio_${name}.wav` : `.tmp_audio_${name}.wav`);
  const stems = name === "full" ? path.join(out, "stems") : undefined;
  console.log(`[${TAG}] mix ${name}: ${m.label}`);
  run(py, [path.join(REPO_ROOT, "workflow/06-audio/mix.py"), "--voice", voice, "--music", m.music ? music : "none", "--events", m.sfx ? events : "none",
    "--out", wav, "--credits", path.join(out, name === "full" ? "credits.txt" : `.credits_${name}.txt`), ...(m.music ? MUSIC_FLAGS : []), ...(stems ? ["--stems", stems] : [])], `mix ${name}`);
  fs.rmSync(path.join(out, `.credits_${name}.txt`), { force: true });
  if (keep) put(`audio_${name}`, "audio", m.label, wav);
  if (stems) {
    for (const [k, f, label] of [["stem_voice", "voice", "Voice stem"], ["stem_sfx", "foley", "SFX stem"], ["stem_music", "music", "Music stem (ducked)"]] as const)
      if (want.has(k) && exists(path.join(stems, `${f}.wav`))) put(k, "stems", label, path.join(stems, `${f}.wav`));
  }
  if (want.has(`video_${name}`)) {
    const mp4 = path.join(out, `video_${name}.mp4`);
    run("ffmpeg", ["-v", "error", "-y", "-i", silent, "-i", wav, "-map", "0:v", "-map", "1:a", "-af", "apad", "-shortest", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", mp4], `mux ${name}`);
    put(`video_${name}`, "video", m.label, mp4);
  }
  if (!keep) fs.rmSync(wav, { force: true });
}

// ---------------------------------------------------------------- SFX clips
const sfxDir = path.join(out, "sfx");
let clips: any[] = [];
if ((want.has("sfx_zip") || want.has("fcp")) && hasEvents) {
  run(py, [path.join(REPO_ROOT, "workflow/06-audio/sfx_daw.py"), "--events", events, "--out-dir", sfxDir], "sfx clips");
  clips = readJson(path.join(sfxDir, "manifest.json")) ?? [];
  if (want.has("sfx_zip")) {
    const zip = path.join(out, "sfx_clips.zip");
    fs.rmSync(zip, { force: true });
    run("zip", ["-q", "-j", zip, ...fs.readdirSync(sfxDir).map((f) => path.join(sfxDir, f))], "zip sfx");
    put("sfx_zip", "sfx", `Every SFX clip (${clips.length} events, ${new Set(clips.map((c) => c.file)).size} files)`, zip, "manifest.json lists each event's time, type and gain");
  }
}
if (want.has("sfx_zip") && hasMusic) put("music_file", "sfx", "Music bed (unducked)", music);

// ---------------------------------------------------------------- Final Cut Pro
if (want.has("fcp")) {
  const fps = timeline?.fps ?? 30;
  const [width, height] = probeWH(silent);
  const title: string = (isShort ? readJson(path.join(ws, "02-scripting/short.json"))?.title : readJson(path.join(ws, "05-video/acts.json"))?.video?.title) ?? video;
  const name = `${title} (${video.replace(/\/shorts\//, " ")})`.slice(0, 120);
  const fclips: FcpClip[] = [{ file: voice, t: 0, dur: probeDur(voice), name: "Voice", role: "dialogue" }];
  for (const c of clips) {
    const g = c.gain && c.gain !== 1 ? 20 * Math.log10(c.gain) : 0;
    fclips.push({ file: path.join(sfxDir, c.file), t: c.t, dur: c.dur, name: `${c.act ?? ""} ${c.type}`.trim(), role: `effects.${c.type}`, gainDb: g, channels: c.pan ? 2 : 1 });
  }
  // the ducked stem from the full mix, so the project sounds like the auto mix (voice, SFX and music all at 0 dB pre-bus)
  const ducked = path.join(out, "stems", "music.wav");
  if (hasMusic) fclips.push(exists(ducked) ? { file: ducked, t: 0, dur: probeDur(ducked), name: "Music (ducked)", role: "music", channels: 2 }
    : { file: music, t: 0, dur: probeDur(music), name: "Music bed", role: "music", gainDb: -14, channels: 2 });
  const markers = (timeline?.scenes ?? []).map((s: any) => ({ t: s.windowStartFrame / fps, name: `${s.id} ${s.slug ?? ""}`.trim() }));
  const xml = buildFcpxml({ name, fps, width, height, video: { file: silent, dur: probeDur(silent) }, clips: fclips, markers });
  const dir = path.join(out, "fcp");
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (f.endsWith(".fcpxml")) fs.rmSync(path.join(dir, f));
  const file = path.join(dir, `${video.replace(/\//g, "_")}.fcpxml`);
  fs.writeFileSync(file, xml, "utf-8");
  put("fcp", "project", "Final Cut Pro project (.fcpxml)", file, `voice, ${clips.length} SFX clips, ${hasMusic ? "music" : "no music"}; File → Import → XML`);
  console.log(`[${TAG}] Final Cut Pro project → ${rel(file)}`);
  if (argv.includes("--open")) run("open", [file], "open in Final Cut Pro");
}

const list = ALL.concat("music_file").map((k) => items.get(k)).filter(Boolean);
fs.writeFileSync(path.join(out, "deliver.json"), JSON.stringify({ builtAt: Date.now(), video, items: list }, null, 1));
const mb = (b: number) => (b / 1e6).toFixed(1) + " MB";
for (const i of list) console.log(`  ${i.group.padEnd(7)} ${i.key.padEnd(18)} ${mb(i.bytes).padStart(9)}  ${i.file}`);
console.log(`[${TAG}] ✅ ${list.length} items → ${rel(path.join(out, "deliver.json"))}`);
tryRefreshLibrary();
