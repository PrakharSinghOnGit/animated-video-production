#!/usr/bin/env bun
/**
 * Compact a finished video's workspace: delete the heavy generated files, keep everything that is authored or decided
 * (scripts, plans, act code, notes, reviews' text, metadata, approvals, timings) and the final render.
 * Dry run by default: it lists what it would delete and how much space that frees. Its shorts are compacted too.
 *
 * Usage: bun run compact --video <VID> [--yes] [--deep] [--daw] [--final] [--no-shorts] [--force]
 *   (default)   caches and previews, all regenerable for free; the final can still be re-rendered as is:
 *               05-video/node_modules (Remotion's webpack cache + headless Chrome), review frames/sheets/previews,
 *               draft.mp4, public/voiceover.wav (render re-copies it), chunks/, TTS takes (part-*; combined/ is kept),
 *               06-audio/audition, the openDAW raw export (when mix_daw.wav exists)
 *   --deep      also the audio a re-render needs (re-run voice/align/sound to rebuild): combined voice, voiceover_master.wav,
 *               mix.wav, music.wav + music/, 06-audio/sfx, daw/sfx (mix_daw.wav, your openDAW export, is always kept)
 *   --daw       also 06-audio/daw/project.odb (your openDAW session) and the Final Cut Pro project media in 08-deliver/
 *   --final     also 05-video/final.mp4 (only once it is uploaded / backed up)
 *   --force     compact even if there is no final.mp4 (an unfinished video)
 *   --yes       actually delete (otherwise: dry run)
 * Writes compact.json in each workspace (what was deleted, when, bytes freed). To work on it again: bun install.
 */
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const vid = flag("--video") ?? flag("-v") ?? args.find((a) => !a.startsWith("-"));
const REPO = path.resolve(import.meta.dir, "..");
const root = vid ? path.join(REPO, "workspace", vid) : "";
if (!vid || !/^[\w-]+$/.test(vid) || !fs.existsSync(root)) {
  console.error("Usage: bun run compact --video <VID> [--yes] [--deep] [--daw] [--final] [--no-shorts] [--force]");
  process.exit(1);
}
const yes = args.includes("--yes"), deep = args.includes("--deep"), daw = args.includes("--daw"), final = args.includes("--final");

const MEDIA = /\.(jpe?g|png|webp|mp4|mov|wav)$/i;
function size(p: string): number {
  try {
    const st = fs.lstatSync(p);
    if (st.isSymbolicLink()) return 0;
    if (!st.isDirectory()) return st.size;
    return fs.readdirSync(p).reduce((s, f) => s + size(path.join(p, f)), 0);
  } catch { return 0; }
}
const mb = (b: number) => b >= 1e9 ? `${(b / 1e9).toFixed(2)} GB` : `${(b / 1e6).toFixed(1)} MB`;
const listDir = (d: string) => { try { return fs.readdirSync(d); } catch { return []; } };

/** What to delete in one workspace (a video or one of its shorts), each with a reason. */
function targets(ws: string): { p: string; why: string }[] {
  const out: { p: string; why: string }[] = [];
  const add = (rel: string, why: string) => { const p = path.join(ws, rel); if (fs.existsSync(p)) out.push({ p, why }); };
  add("05-video/node_modules", "Remotion cache + headless Chrome (bun install restores the link)");
  // review: frames, sheets and preview renders; the notes, reviews, critic json, approvals and logs stay
  const walk = (d: string) => {
    for (const f of listDir(d)) {
      const p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (MEDIA.test(f)) out.push({ p, why: "review frame / sheet / preview" });
    }
  };
  walk(path.join(ws, "05-video", "review"));
  add("05-video/draft.mp4", "draft render");
  for (const f of listDir(path.join(ws, "05-video"))) if (/\.mux\.mp4$/.test(f)) add(`05-video/${f}`, "leftover mux temp");
  add("05-video/public/voiceover.wav", "copy of the master voice (render re-copies it)");
  for (const f of listDir(path.join(ws, "05-video", "chunks"))) if (f !== ".gitkeep") add(`05-video/chunks/${f}`, "render chunk");
  for (const f of listDir(path.join(ws, "03-voiceover", "audio"))) if (/^part-/.test(f)) add(`03-voiceover/audio/${f}`, "TTS takes (combined voice kept)");
  add("06-audio/audition", "music/sfx audition clips");
  if (fs.existsSync(path.join(ws, "06-audio", "mix_daw.wav"))) add("06-audio/daw/export_raw.wav", "openDAW raw export (mix_daw.wav kept)");
  add("06-audio/sfx_clips", "SFX review previews (bun run sfx:clips)");
  // downloads (bun run deliver rebuilds them); what the Final Cut Pro project uses stays unless --daw
  for (const f of listDir(path.join(ws, "08-deliver"))) if (/^(video_(full|voice\w*)\.mp4|audio_\w+\.wav|sfx_clips\.zip)$/.test(f)) add(`08-deliver/${f}`, "download (bun run deliver)");
  add("08-deliver/stems/voice.wav", "voice stem download"); add("08-deliver/stems/foley.wav", "SFX stem download");
  if (deep) {
    add("03-voiceover/audio/combined", "combined voice (re-run voice to rebuild)");
    add("06-audio/voiceover_master.wav", "mastered voice (audio:master)");
    add("06-audio/mix.wav", "auto mix (audio:mix)");
    add("06-audio/music.wav", "procedural music stem (audio:music)");
    add("06-audio/music", "music cache");
    add("06-audio/sfx", "foley cache");
    add("06-audio/daw/sfx", "openDAW sfx copies");
  }
  if (daw) add("06-audio/daw/project.odb", "openDAW session (your manual edits; mix_daw.wav kept)");
  if (daw) for (const r of ["08-deliver/video_silent.mp4", "08-deliver/sfx", "08-deliver/stems/music.wav"]) add(r, "media of the Final Cut Pro project (bun run fcp rebuilds)");
  if (final) add("05-video/final.mp4", "final render (--final)");
  return out;
}

const shortsDir = path.join(root, "shorts");
const workspaces = [root, ...(args.includes("--no-shorts") ? [] : listDir(shortsDir).filter((s) => /^S\d+$/.test(s)).map((s) => path.join(shortsDir, s)))];
let total = 0;
for (const ws of workspaces) {
  const rel = path.relative(path.join(REPO, "workspace"), ws);
  if (!fs.existsSync(path.join(ws, "05-video", "final.mp4")) && !args.includes("--force")) {
    console.log(`⏩ ${rel}: no final.mp4 (not finished); --force to compact it anyway`);
    continue;
  }
  const t = targets(ws).map((x) => ({ ...x, bytes: size(x.p) })).filter((x) => x.bytes > 0);
  const sum = t.reduce((s, x) => s + x.bytes, 0);
  total += sum;
  console.log(`\n${yes ? "🧹" : "🔎"} ${rel}: ${mb(sum)} in ${t.length} item(s)`);
  // group per reason so the list stays readable (review frames are hundreds of files)
  const groups = new Map<string, { n: number; bytes: number; first: string }>();
  for (const x of t) { const g = groups.get(x.why) ?? { n: 0, bytes: 0, first: path.relative(ws, x.p) }; g.n++; g.bytes += x.bytes; groups.set(x.why, g); }
  for (const [why, g] of [...groups].sort((a, b) => b[1].bytes - a[1].bytes)) console.log(`   ${mb(g.bytes).padStart(10)}  ${g.n > 1 ? `${g.n} files, e.g. ${g.first}` : g.first}  (${why})`);
  if (yes && t.length) {
    for (const x of t) fs.rmSync(x.p, { recursive: true, force: true });
    const logFile = path.join(ws, "compact.json");
    let log: any[] = [];
    try { log = JSON.parse(fs.readFileSync(logFile, "utf-8")); } catch {}
    log.push({ at: new Date().toISOString(), bytes: sum, deep, daw, final, items: [...groups].map(([why, g]) => ({ why, n: g.n, bytes: g.bytes })) });
    fs.writeFileSync(logFile, JSON.stringify(log, null, 2), "utf-8");
  }
}
console.log(`\n${yes ? `✅ freed ${mb(total)}` : `Dry run: ${mb(total)} would be freed. Add --yes to delete.`}${!deep ? " (--deep also drops the regenerable audio)" : ""}`);
if (yes) console.log("   Kept: scripts, plans, act code, notes, reviews, metadata, thumbnails, exports, mix_daw.wav" + (final ? "" : ", final.mp4") + ". Run `bun install` before working on it again.");
