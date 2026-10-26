/**
 * Shared foley library from Openverse (anonymous API, commercial-safe licences only: cc0, pdm, by).
 * Usage: bun run sfx:fetch [--types pop,whoosh] [--per-type 5] [--force]
 * Writes assets/sfx/<type>/<n>.wav (48 kHz mono, leading silence trimmed, peak -3 dBFS) and assets/sfx/manifest.json.
 * Openverse anonymous limits: 20 requests/min, 200/day -> one request every ~3.2 s. Candidates are Freesound preview MP3s.
 * NC / ND / SA licences are never requested. CC0/PDM are ranked before CC BY.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { REPO_ROOT } from "./py";

const API = "https://api.openverse.org/v1/audio/";
const OUT = path.join(REPO_ROOT, "assets/sfx");
const MANIFEST = path.join(OUT, "manifest.json");
// type -> [queries, max source duration in s, crop to first N s (single hit out of a longer recording)]
const TYPES: Record<string, [string[], number, number]> = {
  pencil_tap: [["pencil tap", "pencil tapping desk"], 20, 0.35],
  pencil_scratch: [["pencil writing paper", "pencil scribble"], 8, 8],
  ruler_hiss: [["pencil ruler line", "drawing line paper"], 6, 8],
  paper_slide: [["paper slide", "paper sliding table", "paper rustle"], 6, 8],
  stamp_thud: [["rubber stamp", "stamp thud"], 20, 1.0],
  page_turn: [["page turn", "book page flip"], 4, 8],
  adding_clack: [["adding machine", "calculator machine keys", "adding machine key"], 20, 2.0],
  pop: [["bubble pop", "pop"], 2, 8],
  whoosh: [["whoosh", "air swoosh"], 3, 8],
  coin_drop: [["coin drop", "coin dropping table"], 4, 8],
  cash_register: [["cash register", "cash register ka-ching"], 20, 3.5],
  typewriter: [["typewriter key", "typewriter typing"], 6, 8],
};
// a candidate must mention one of these in its title or tags (Openverse text search alone returns machine guns for "adding machine")
const KW: Record<string, RegExp> = {
  pencil_tap: /pencil|pen\b|tap|desk/i, pencil_scratch: /pencil|pen\b|writ|scribbl|scratch|marker|sign/i, ruler_hiss: /ruler|line|marker|pencil|draw|stroke|pen\b|underlin/i,
  paper_slide: /paper|slid|envelope|sheet|rustle/i, stamp_thud: /stamp/i, page_turn: /page|book|paper|turn|flip/i,
  adding_clack: /adding|calculator|ticker|register|typewriter|key|button|till/i, pop: /pop|bubble/i, whoosh: /whoosh|swoosh|swosh|swish|air|whip|swing/i,
  coin_drop: /coin|money|change/i, cash_register: /cash|register|till|ching/i, typewriter: /typewriter|typing|keyboard|type\b/i,
};
const args = process.argv.slice(2);
const opt = (n: string, d = "") => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const perType = Number(opt("--per-type", "5"));
const force = args.includes("--force");
const only = opt("--types").split(",").filter(Boolean);
const UA = { "User-Agent": "WealthGap-sfx-fetch/1.0 (educational video project)" };

let last = 0;
async function throttle() { const w = 3300 - (Date.now() - last); if (w > 0) await new Promise((r) => setTimeout(r, w)); last = Date.now(); }
let requests = 0;
async function search(q: string, category: boolean): Promise<any[]> {
  const u = new URL(API);
  u.search = new URLSearchParams({ q, license: "cc0,pdm,by", page_size: "20", ...(category ? { category: "sound_effect" } : {}) }).toString();
  for (let attempt = 0; attempt < 2; attempt++) {
    await throttle(); requests++;
    const r = await fetch(u, { headers: UA });
    if (r.status === 429) { console.warn("  429 from Openverse, waiting 65 s"); await new Promise((r) => setTimeout(r, 65000)); continue; }
    if (!r.ok) { console.error(`  Openverse HTTP ${r.status} for "${q}"`); return []; }
    return ((await r.json()) as any).results ?? [];
  }
  console.error("Openverse rate limit persists; stopping (progress saved)."); process.exit(1);
}
const ff = (a: string[]) => spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-y", ...a], { encoding: "utf-8" });

function prepare(mp3: string, wav: string, crop: number): number | null {
  const tmp = wav + ".tmp.wav";
  const sil = (rev: boolean) => `${rev ? "areverse," : ""}silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.004${rev ? ",areverse" : ""}`;
  let r = ff(["-i", mp3, "-ac", "1", "-ar", "48000", "-af", `${sil(false)},${sil(true)},atrim=0:${crop}`, "-c:a", "pcm_s16le", tmp]);
  if (r.status !== 0 || !fs.existsSync(tmp)) return null;
  r = ff(["-i", tmp, "-af", "volumedetect", "-f", "null", "-"]);
  const m = /max_volume: (-?[\d.]+) dB/.exec(r.stderr);
  if (!m) { fs.rmSync(tmp, { force: true }); return null; }
  const gain = -3 - parseFloat(m[1]);
  r = ff(["-i", tmp, "-af", `volume=${gain.toFixed(2)}dB,afade=t=in:d=0.003,areverse,afade=t=in:d=${Math.min(0.03, crop / 4)},areverse`, "-c:a", "pcm_s16le", wav]);
  fs.rmSync(tmp, { force: true });
  if (r.status !== 0) return null;
  const d = ff(["-i", wav, "-f", "null", "-"]); const t = /time=(\d+):(\d+):([\d.]+)/g; let x, secs = 0;
  while ((x = t.exec(d.stderr))) secs = +x[1] * 3600 + +x[2] * 60 + +x[3];
  return secs;
}

let manifest: any[] = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, "utf-8")) : [];
for (const e of manifest.filter((e) => !KW[e.type]?.test(e.title + " " + (e.tags ?? [])))) { fs.rmSync(path.join(OUT, e.file), { force: true }); console.log(`  dropping off-topic ${e.type}: ${e.title}`); }
manifest = manifest.filter((e) => KW[e.type]?.test(e.title + " " + (e.tags ?? [])));
const t0 = Date.now();
fs.mkdirSync(OUT, { recursive: true });
for (const [type, [queries, maxDur, crop]] of Object.entries(TYPES)) {
  if (only.length && !only.includes(type)) continue;
  const have = manifest.filter((e) => e.type === type);
  if (!force && have.length >= Math.min(3, perType)) { console.log(`${type}: ${have.length} already in library, skipping`); continue; }
  const rank = (l: string) => (l === "cc0" || l === "pdm" ? 0 : 1);
  let cands: any[] = [];
  for (const q of queries) {
    const res = (await search(q, false)).filter((r) => r.url && r.duration >= 50 && r.duration <= maxDur * 1000 && !cands.some((c) => c.id === r.id) && KW[type].test(r.title + " " + (r.tags ?? []).map((t: any) => t.name).join(" ")) && ["cc0", "pdm", "by"].includes(r.license));
    cands = cands.concat(res);
    if (cands.length >= perType + 2) break;
  }
  cands.sort((a, b) => rank(a.license) - rank(b.license));
  const dir = path.join(OUT, type); fs.mkdirSync(dir, { recursive: true });
  let n = manifest.filter((e) => e.type === type).length;
  for (const c of cands) {
    if (n >= perType) break;
    if (manifest.some((e) => e.id === c.id)) continue;
    const file = `${type}/${c.id.slice(0, 8)}.wav`;
    const mp3 = path.join(dir, `.dl_${n}.mp3`);
    try {
      const r = await fetch(c.url, { headers: UA });
      if (!r.ok) { console.warn(`  skip ${c.id}: HTTP ${r.status}`); continue; }
      fs.writeFileSync(mp3, Buffer.from(await r.arrayBuffer()));
    } catch (e) { console.warn(`  skip ${c.id}: ${e}`); continue; }
    const secs = prepare(mp3, path.join(OUT, file), crop); fs.rmSync(mp3, { force: true });
    if (secs === null || secs < 0.04) { console.warn(`  skip ${c.id}: could not decode/too short`); fs.rmSync(path.join(OUT, file), { force: true }); continue; }
    manifest.push({
      id: c.id, type, file, title: c.title, creator: c.creator, license: c.license, licenseVersion: c.license_version, licenseUrl: c.license_url,
      sourceUrl: c.url, landingUrl: c.foreign_landing_url, attribution: c.attribution, tags: (c.tags ?? []).map((t: any) => t.name).slice(0, 8), provider: c.source ?? c.provider,
      durationSec: Math.round(secs * 1000) / 1000, retrieved: new Date().toISOString().slice(0, 10),
    });
    n++;
  }
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  console.log(`${type}: ${n} samples (${manifest.filter((e) => e.type === type).map((e) => e.license).join(",")})`);
}
const mix: Record<string, number> = {};
for (const e of manifest) mix[e.license] = (mix[e.license] ?? 0) + 1;
console.log(`[sfx:fetch] ${manifest.length} samples, licences ${JSON.stringify(mix)}, ${requests} API requests, ${((Date.now() - t0) / 1000).toFixed(0)} s -> ${path.relative(REPO_ROOT, MANIFEST)}`);
