/**
 * Per-chapter music bed.
 * Usage: bun run audio:music --video <ID> [--reset] [--refresh-timing] [--synth] [--audition]
 * New music.json files take one track per chapter from the library (assets/music/index.json, `bun run music:lib`);
 * --synth ignores the library.
 *
 * workspace/<ID>/06-audio/music.json is created from music_plan.json (and 05-video/chapters.json) only if missing;
 * edit it to choose each section's source (synth palette | licensed file | epidemic). Output: music.wav, beats.json,
 * music_sources.json (what was used, for credits). --audition renders 20 s per section to 06-audio/audition/<label>.wav.
 * {"type":"epidemic"} sections are downloaded only when EPIDEMIC_COMMERCIAL=1 (paid, safelisted); otherwise synth.
 */
import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT, runPython, videoArg } from "./py";

const video = videoArg("audio:music");
const flag = (f: string) => process.argv.includes(f);
const ws = path.join(REPO_ROOT, "workspace", video);
const dir = path.join(ws, "06-audio");
const plan = path.join(dir, "music_plan.json");
const mj = path.join(dir, "music.json");
const chapters = path.join(ws, "05-video/chapters.json");
if (!fs.existsSync(mj) && !fs.existsSync(plan)) {
  console.error(`[audio:music] ERROR: neither ${mj} nor ${plan} found (run cues first)`);
  process.exit(1);
}
const initArgs = ["--init", "--plan", plan, "--music-json", mj, "--chapters", chapters];
if (flag("--reset")) initArgs.push("--reset");
if (flag("--refresh-timing")) initArgs.push("--refresh-timing");
if (flag("--synth")) initArgs.push("--synth");
if (fs.existsSync(plan)) runPython("audio:music", "music.py", initArgs);

// --- Epidemic sections: download only with a paid, safelisted subscription ---
const cfg = JSON.parse(fs.readFileSync(mj, "utf-8"));
const epi = cfg.sections.filter((s: any) => s.source?.type === "epidemic");
let renderCfg = mj;
if (epi.length) {
  const cacheDir = path.join(REPO_ROOT, "assets/music/epidemic");
  const manPath = path.join(cacheDir, "manifest.json");
  const commercial = process.env.EPIDEMIC_COMMERCIAL === "1" && !!process.env.EPIDEMIC_API;
  const manifest: any[] = fs.existsSync(manPath) ? JSON.parse(fs.readFileSync(manPath, "utf-8")) : [];
  for (const s of epi) {
    if (!commercial) continue; // music.py warns and renders synth
    const id = String(s.source.trackId);
    const rel = `assets/music/epidemic/${id}.mp3`;
    const abs = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(abs)) {
      fs.mkdirSync(cacheDir, { recursive: true });
      const r = await fetch(`https://api.epidemicsound.com/v0/tracks/${encodeURIComponent(id)}/download?format=mp3&quality=high`, {
        headers: { Authorization: `Bearer ${process.env.EPIDEMIC_API}` },
      });
      if (!r.ok) {
        console.error(`[audio:music] Epidemic download HTTP ${r.status} for track ${id} (401/403: key or subscription lacks access; 429: rate limited). Stopping.`);
        process.exit(1);
      }
      const { url } = (await r.json()) as { url: string };
      const f = await fetch(url);
      if (!f.ok) { console.error(`[audio:music] Epidemic file fetch HTTP ${f.status}`); process.exit(1); }
      fs.writeFileSync(abs, Buffer.from(await f.arrayBuffer()));
      manifest.push({ trackId: id, file: rel, retrieved: new Date().toISOString().slice(0, 10), label: s.label, video });
      fs.writeFileSync(manPath, JSON.stringify(manifest, null, 2));
      await new Promise((r) => setTimeout(r, 1500));
    }
    s.source = { type: "file", path: rel, gainDb: s.source.gainDb ?? 0, start: s.source.start ?? 0, bpm: s.source.bpm, attribution: false, credit: `Epidemic Sound track ${id} (paid licence, channel safelisted; no description credit required)` };
  }
  renderCfg = path.join(dir, ".music_resolved.json");
  fs.writeFileSync(renderCfg, JSON.stringify(cfg, null, 2));
}

const base = ["--music-json", renderCfg, "--plan", plan, "--root", REPO_ROOT];
if (flag("--audition")) runPython("audio:music", "music.py", [...base, "--audition", path.join(dir, "audition")]);
else runPython("audio:music", "music.py", [...base, "--out", path.join(dir, "music.wav"), "--beats", path.join(dir, "beats.json"), "--sources", path.join(dir, "music_sources.json")]);
