#!/usr/bin/env bun
/**
 * Compact a finished video's workspace: delete the heavy generated files, keep everything that is authored or decided
 * (scripts, plans, act code, notes, reviews' text, metadata, approvals, timings) and the final render.
 * Dry run by default: it lists what it would delete and how much space that frees. Its shorts are compacted too.
 *
 * Usage: bun run compact --video <VID> [--yes] [--deep] [--fcp] [--final] [--no-shorts] [--force]
 *   (default)   caches and previews, all regenerable for free; the final can still be re-rendered as is:
 *               05-video/node_modules (Remotion's webpack cache + headless Chrome), review frames/sheets/previews,
 *               draft.mp4, public/voiceover.wav (render re-copies it), chunks/, TTS takes (part-*; combined/ is kept),
 *               06-audio/audition, leftovers of the removed openDAW integration (06-audio/daw/, mix_daw.wav), takes of
 *               lines an older script had (03-voiceover/audio/stale), stem downloads (08-deliver/stems/*.wav but music.wav)
 *   --deep      also the audio a re-render needs (re-run voice/align/sound to rebuild): combined voice, raw takes, voiceover_master.wav,
 *               mix.wav, music.wav + music/, 06-audio/sfx
 *   --fcp       also the Final Cut Pro project media in 08-deliver/ (bun run fcp rebuilds it; --daw is the old name)
 *   --final     also 05-video/final.mp4 (only once it is uploaded / backed up)
 *   --archive   a published video, kept only as a record: --deep + --fcp, and also every log, the finished shorts
 *               (each short's final.mp4 and shorts/export/*.mp4: they are on YouTube), the transition probe frames, and the
 *               generated thumbnails (A/B/C, preview sheets, renders) once the real one is saved from YouTube
 *               (07-publish/thumbnails/youtube.jpg, from youtube.json's videoId; without it they stay). The long
 *               video's final.mp4 stays unless --final. Act code, script, idea, plan, timings and costs, lessons,
 *               reviews, notes and metadata always stay.
 *   --force     compact even if there is no final.mp4 and it was never compacted (an unfinished video)
 *   --yes       actually delete (otherwise: dry run)
 * Writes compact.json in each workspace (what was deleted, when, bytes freed). To work on it again: bun install.
 */
import fs from "node:fs";
import path from "node:path";
import { shortLinkMap } from "../workflow/09-analytics/lib";

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const vid = flag("--video") ?? flag("-v") ?? args.find((a) => !a.startsWith("-"));
const REPO = path.resolve(import.meta.dir, "..");
const root = vid ? path.join(REPO, "workspace", vid) : "";
if (!vid || !/^[\w-]+$/.test(vid) || !fs.existsSync(root)) {
  console.error("Usage: bun run compact --video <VID> [--yes] [--deep] [--fcp] [--archive] [--final] [--no-shorts] [--force]");
  process.exit(1);
}
const yes = args.includes("--yes"), archive = args.includes("--archive");
const deep = archive || args.includes("--deep"), fcp = archive || args.includes("--fcp") || args.includes("--daw"), final = args.includes("--final");
const isShortWs = (ws: string) => /\/shorts\/S\d+$/.test(ws);
const ytId = (ws: string): string | null => { try { const id = JSON.parse(fs.readFileSync(path.join(ws, "07-publish", "youtube.json"), "utf-8")).videoId; return /^[\w-]{11}$/.test(id) ? id : null; } catch { return null; } };
const ytThumbFile = (ws: string) => path.join(ws, "07-publish", "thumbnails", "youtube.jpg");
/** Save the video's live thumbnail from YouTube (the one viewers see, whichever package won). true when it is on disk. */
async function saveYtThumb(ws: string): Promise<boolean> {
  const id = ytId(ws), out = ytThumbFile(ws);
  if (!id) return false;
  if (fs.existsSync(out)) return true;
  for (const q of ["maxresdefault", "sddefault", "hqdefault"]) {
    try {
      const r = await fetch(`https://i.ytimg.com/vi/${id}/${q}.jpg`);
      const b = r.ok ? Buffer.from(await r.arrayBuffer()) : null;
      if (b && b.length > 5000) { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, b); console.log(`   saved the YouTube thumbnail (${q}) → ${path.relative(REPO, out)}`); return true; }
    } catch {}
  }
  console.log(`   ⚠️  could not fetch the YouTube thumbnail of ${id}: the generated thumbnails stay`);
  return false;
}

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
  // act pieces; a Final Cut Pro project built from them (one clip per act) keeps its pieces unless --fcp
  const fcpXml = listDir(path.join(ws, "08-deliver", "fcp")).filter((f) => f.endsWith(".fcpxml")).map((f) => fs.readFileSync(path.join(ws, "08-deliver", "fcp", f), "utf-8")).join("");
  for (const f of listDir(path.join(ws, "05-video", "chunks"))) {
    if (f === ".gitkeep") continue;
    if (!fcp && fcpXml.includes(`/05-video/chunks/${f}/`)) { console.log(`   (keeping 05-video/chunks/${f} in ${path.basename(ws)}: the Final Cut Pro project uses it; --fcp removes it)`); continue; }
    add(`05-video/chunks/${f}`, "act pieces (render acts rebuilds them)");
  }
  for (const f of listDir(path.join(ws, "03-voiceover", "audio"))) if (/^part-/.test(f)) add(`03-voiceover/audio/${f}`, "TTS takes (combined voice kept)");
  add("06-audio/audition", "music/sfx audition clips");
  add("06-audio/daw", "openDAW project (integration removed)");
  add("06-audio/sfx_clips", "SFX review previews (bun run sfx:clips)");
  // downloads (bun run deliver rebuilds them); what the Final Cut Pro project uses stays unless --fcp
  for (const f of listDir(path.join(ws, "08-deliver"))) if (/^(video_(full|voice\w*)\.mp4|audio_\w+\.wav|sfx_clips\.zip)$/.test(f)) add(`08-deliver/${f}`, "download (bun run deliver)");
  // every stem download (voice, foley, sfx_foley, sfx_design, duck, ...) except the music stem the FCP project plays
  for (const f of listDir(path.join(ws, "08-deliver", "stems"))) if (/\.wav$/.test(f) && f !== "music.wav") add(`08-deliver/stems/${f}`, "stem download (bun run deliver)");
  add("03-voiceover/audio/stale", "takes of lines an older script had (voice:sync moved them aside)");
  for (const f of listDir(path.join(ws, "08-deliver"))) if (/^tmp\w+\.(wav|mp4)$/.test(f)) add(`08-deliver/${f}`, "temp file of an interrupted deliver run");
  add("06-audio/mix_daw.wav", "mix of the removed openDAW integration");
  if (deep) {
    add("03-voiceover/audio/combined", "combined voice (re-run voice to rebuild)");
    add("03-voiceover/audio/raw", "untouched TTS takes Speed & gaps starts from (re-run voice to rebuild)");
    add("06-audio/voiceover_master.wav", "mastered voice (audio:master)");
    add("06-audio/mix.wav", "auto mix (audio:mix)");
    add("06-audio/music.wav", "procedural music stem (audio:music)");
    add("06-audio/music", "music cache");
    add("06-audio/sfx", "foley cache");
  }
  if (fcp) for (const r of ["08-deliver/video_silent.mp4", "08-deliver/sfx", "08-deliver/stems/music.wav"]) add(r, "media of the Final Cut Pro project (bun run fcp rebuilds)");
  if (final) add("05-video/final.mp4", "final render (--final)");
  if (archive) {
    const logs = (d: string) => { for (const f of listDir(d)) { const p = path.join(d, f); if (f === "node_modules" || (p === path.join(ws, "shorts"))) continue; if (fs.lstatSync(p).isDirectory()) logs(p); else if (/\.log$/.test(f)) out.push({ p, why: "log (the timings, costs, reviews and notes stay)" }); } };
    logs(ws);
    add("05-video/public/seams", "transition probe frames (bun run seams re-probes them)");
    // a finished short goes only once it is linked to its upload (Analytics → link): an unposted one stays
    const linked = (vid: string, s: string) => { try { return !!shortLinkMap(vid)[s]; } catch { return false; } };
    if (isShortWs(ws)) { if (linked(path.basename(path.dirname(path.dirname(ws))), path.basename(ws))) add("05-video/final.mp4", "finished short (it is on YouTube)"); }
    else {
      for (const f of listDir(path.join(ws, "shorts", "export"))) {
        const s = f.replace(/\.mp4$/, "");
        if (!/\.mp4$/.test(f)) continue;
        if (linked(path.basename(ws), s)) add(`shorts/export/${f}`, "finished short (it is on YouTube)");
        else console.log(`   (keeping shorts/export/${f}: ${s} is not linked to a YouTube upload)`);
      }
      const pngs = (d: string): void => { for (const f of listDir(d)) { const p = path.join(d, f); if (fs.lstatSync(p).isDirectory()) pngs(p); else if (/\.(png|jpe?g)$/.test(f)) out.push({ p, why: "generated thumbnail render" }); } };
      // the generated thumbnails go once the real one is saved (or will be, in a dry run)
      if (fs.existsSync(ytThumbFile(ws)) || (!yes && ytId(ws))) {
        for (const v of ["A", "B", "C"]) for (const ext of ["png", "jpg"]) add(`07-publish/thumbnails/${v}.${ext}`, "generated thumbnail (the YouTube one is kept)");
        add("07-publish/preview.png", "generated preview sheet"); add("07-publish/preview_small.png", "generated preview sheet");
        add("07-publish/thumbnails/phone", "generated phone-size checks");
        // older copies of the packaging folder: their text stays, their images go
        for (const b of listDir(path.join(ws)).filter((f) => /^07-publish\.bak/.test(f))) pngs(path.join(ws, b));
        for (const f of listDir(path.join(ws, "07-publish", "export"))) if (/^thumb_.*\.(png|jpe?g)$/.test(f)) add(`07-publish/export/${f}`, "generated thumbnail export");
        pngs(path.join(ws, "07-publish", "remotion"));
      }
    }
  }
  return out;
}

const shortsDir = path.join(root, "shorts");
const workspaces = [root, ...(args.includes("--no-shorts") ? [] : listDir(shortsDir).filter((s) => /^S\d+$/.test(s)).map((s) => path.join(shortsDir, s)))];
let total = 0;
for (const ws of workspaces) {
  const rel = path.relative(path.join(REPO, "workspace"), ws);
  // finished = a final render, or compacted before (an earlier --final may have taken the final)
  // a shorts project (SH…) has no long video: it is finished once a short is exported
  const shortsProjectDone = /^SH\d+_/.test(path.basename(ws)) && listDir(path.join(ws, "shorts", "export")).some((f) => f.endsWith(".mp4"));
  if (!fs.existsSync(path.join(ws, "05-video", "final.mp4")) && !fs.existsSync(path.join(ws, "compact.json")) && !shortsProjectDone && !args.includes("--force")) {
    console.log(`⏩ ${rel}: no final.mp4 (not finished); --force to compact it anyway`);
    continue;
  }
  if (archive && yes && !isShortWs(ws) && ytId(ws)) await saveYtThumb(ws);
  else if (archive && !isShortWs(ws) && !ytId(ws)) console.log(`   (${rel}: not linked to a YouTube upload, so its generated thumbnails stay)`);
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
    log.push({ at: new Date().toISOString(), bytes: sum, deep, fcp, final, archive, items: [...groups].map(([why, g]) => ({ why, n: g.n, bytes: g.bytes })) });
    fs.writeFileSync(logFile, JSON.stringify(log, null, 2), "utf-8");
  }
}
console.log(`\n${yes ? `✅ freed ${mb(total)}` : `Dry run: ${mb(total)} would be freed. Add --yes to delete.`}${!deep ? " (--deep also drops the regenerable audio)" : ""}`);
if (yes) console.log("   Kept: scripts, plans, act code, notes, reviews, metadata, thumbnails, exports" + (final ? "" : ", final.mp4") + ". Run `bun install` before working on it again.");
