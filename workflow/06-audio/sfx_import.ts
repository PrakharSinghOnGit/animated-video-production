/**
 * Import sound effects you found yourself into the shared library (assets/sfx + manifest.json).
 *
 * Usage: bun run sfx:import [--dry]
 *
 * Put files in assets/sfx/_inbox/<type>/ (any depth below that; wav, mp3, flac, aif(f), ogg, m4a), where <type> is a
 * type of workflow/06-audio/sfx_types.json (riser, impact, transition, card_slap, …). Every file needs licence
 * information: a source.json in its folder or any folder above it (up to _inbox):
 *   {"source": "Sonniss GDC 2024 bundle", "url": "https://sonniss.com/gameaudiogdc", "license": "royalty-free",
 *    "creator": "Sonniss", "attributionRequired": false}
 * license: cc0 | pdm | by | royalty-free | own | epidemic. `by` (or "attributionRequired": true) puts the clip's
 * credit ("credit": "…", else title + creator + url) into credits.txt; `epidemic` clips are skipped by the mix unless
 * EPIDEMIC_COMMERCIAL=1 (paid licence). Files without licence information are refused.
 *
 * Each clip becomes assets/sfx/<type>/imp_<hash>.wav: 48 kHz mono, silence trimmed (risers and swells keep their
 * lead-in and lose trailing silence, everything else the reverse), peak -3 dBFS, at most 60 s. Clips with spoken words
 * (local Whisper, sfx_speech.py) are refused. The inbox is left as it is; files already imported (same content) are
 * skipped, so running it twice is safe.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { REPO_ROOT, findPython } from "./py";

const OUT = path.join(REPO_ROOT, "assets/sfx"), INBOX = path.join(OUT, "_inbox"), MANIFEST = path.join(OUT, "manifest.json");
const TYPES: Record<string, { anchor: string; layer: string }> = JSON.parse(fs.readFileSync(path.join(import.meta.dir, "sfx_types.json"), "utf-8")).types;
const LICENSES = new Set(["cc0", "pdm", "by", "royalty-free", "own", "epidemic"]);
const AUDIO = /\.(wav|mp3|flac|aiff?|ogg|m4a)$/i;
const dry = process.argv.includes("--dry");

if (!fs.existsSync(INBOX)) {
  fs.mkdirSync(INBOX, { recursive: true });
  console.log(`[sfx:import] made ${path.relative(REPO_ROOT, INBOX)}/ : put clips in a folder per type (${Object.keys(TYPES).join(", ")}) with a source.json`);
  process.exit(0);
}

function walk(d: string): string[] {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : AUDIO.test(e.name) ? [path.join(d, e.name)] : []);
}
function sourceOf(file: string): any | string {
  for (let d = path.dirname(file); d.startsWith(INBOX); d = path.dirname(d)) {
    const p = path.join(d, "source.json");
    if (!fs.existsSync(p)) continue;
    try {
      const j = JSON.parse(fs.readFileSync(p, "utf-8"));
      if (!LICENSES.has(String(j.license))) return `${path.relative(REPO_ROOT, p)}: license must be one of ${[...LICENSES].join(", ")}`;
      return j;
    } catch (e) { return `${path.relative(REPO_ROOT, p)}: ${(e as Error).message}`; }
  }
  return "no source.json in its folder or above it (licence information is required)";
}
const ff = (a: string[]) => spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-y", ...a], { encoding: "utf-8" });

function prepare(src: string, wav: string, endAnchored: boolean): number | null {
  const tmp = wav + ".tmp.wav";
  const sil = (rev: boolean) => `${rev ? "areverse," : ""}silenceremove=start_periods=1:start_threshold=-55dB:start_silence=0.004${rev ? ",areverse" : ""}`;
  // a riser's quiet lead-in is part of the sound: trim only its tail; for the rest the onset must be at sample 0
  const trim = endAnchored ? sil(true) : `${sil(false)},${sil(true)}`;
  let r = ff(["-i", src, "-ac", "1", "-ar", "48000", "-af", `${trim},atrim=0:60`, "-c:a", "pcm_s24le", tmp]);
  if (r.status !== 0 || !fs.existsSync(tmp)) return null;
  r = ff(["-i", tmp, "-af", "volumedetect", "-f", "null", "-"]);
  const m = /max_volume: (-?[\d.]+) dB/.exec(r.stderr);
  if (!m) { fs.rmSync(tmp, { force: true }); return null; }
  r = ff(["-i", tmp, "-af", `volume=${(-3 - parseFloat(m[1])).toFixed(2)}dB,afade=t=in:d=0.002,areverse,afade=t=in:d=0.01,areverse`, "-c:a", "pcm_s24le", wav]);
  fs.rmSync(tmp, { force: true });
  if (r.status !== 0) return null;
  const p = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", wav], { encoding: "utf-8" });
  return parseFloat(p.stdout) || null;
}

let manifest: any[] = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, "utf-8")) : [];
const have = new Set(manifest.map((e) => e.id));
const added: any[] = [], refused: string[] = [];
for (const file of walk(INBOX)) {
  const rel = path.relative(INBOX, file), type = rel.split(path.sep)[0];
  if (!TYPES[type]) { refused.push(`${rel}: "${type}" is not an SFX type (see workflow/06-audio/sfx_types.json)`); continue; }
  const src = sourceOf(file);
  if (typeof src === "string") { refused.push(`${rel}: ${src}`); continue; }
  const hash = crypto.createHash("sha1").update(fs.readFileSync(file)).digest("hex").slice(0, 12);
  const id = `import:${hash}`;
  if (have.has(id)) continue;
  const out = `${type}/imp_${hash}.wav`;
  if (dry) { added.push({ id, type, file: out, title: path.parse(file).name, license: src.license }); continue; }
  fs.mkdirSync(path.join(OUT, type), { recursive: true });
  const secs = prepare(file, path.join(OUT, out), TYPES[type].anchor === "end");
  if (!secs || secs < 0.03) { refused.push(`${rel}: could not decode it, or it is silent`); fs.rmSync(path.join(OUT, out), { force: true }); continue; }
  const title = path.parse(file).name;
  added.push({
    id, type, file: out, title, creator: src.creator ?? src.source ?? "unknown", license: src.license, licenseUrl: src.licenseUrl ?? src.url ?? "",
    sourceUrl: src.url ?? "", landingUrl: src.url ?? "", attribution: src.credit ?? (src.license === "by" ? `"${title}" by ${src.creator ?? src.source}, ${src.url ?? ""}` : ""),
    ...(src.attributionRequired === true ? { attributionRequired: true } : {}), source: src.source ?? "", provider: "import",
    durationSec: Math.round(secs * 1000) / 1000, retrieved: new Date().toISOString().slice(0, 10), inbox: rel,
  });
  have.add(id);
}
if (!dry && added.length) {
  const r = spawnSync(findPython(), [path.join(import.meta.dir, "sfx_speech.py"), ...added.map((e) => path.join(OUT, e.file))], { encoding: "utf-8", cwd: REPO_ROOT });
  if (r.status !== 0) { console.error(`[sfx:import] speech check failed (exit ${r.status}); nothing was added`); for (const e of added) fs.rmSync(path.join(OUT, e.file), { force: true }); process.exit(1); }
  const speech = new Set(r.stdout.split("\n").filter((l) => l.startsWith("{")).map((l) => JSON.parse(l)).filter((j) => j.speech).map((j) => path.relative(OUT, j.file)));
  for (const e of added.filter((e) => speech.has(e.file))) { refused.push(`${e.inbox}: it contains spoken words`); fs.rmSync(path.join(OUT, e.file), { force: true }); }
  manifest = manifest.concat(added.filter((e) => !speech.has(e.file)));
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
}
const per: Record<string, number> = {};
for (const e of added) per[e.type] = (per[e.type] ?? 0) + 1;
console.log(`[sfx:import] ${dry ? "would add" : "added"} ${added.length} clip(s) ${JSON.stringify(per)}`);
for (const r of refused) console.log(`   ✗ ${r}`);
const count: Record<string, number> = {};
for (const e of manifest) count[e.type] = (count[e.type] ?? 0) + 1;
const thin = Object.keys(TYPES).filter((t) => (count[t] ?? 0) < 4);
if (thin.length) console.log(`   types with fewer than 4 recordings (the mix uses procedural sound or repeats there): ${thin.map((t) => `${t} (${count[t] ?? 0})`).join(", ")}`);
