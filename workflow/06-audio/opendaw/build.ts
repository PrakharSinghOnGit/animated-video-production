/**
 * Build the openDAW project for a video: the voiceover, every foley event on its own clip, the music stem.
 * Usage: bun run daw --video <ID> [--bpm 120] [--no-lib] [--no-music]
 *
 * Output (workspace/<ID>/06-audio/daw/): project.odb (open it in openDAW, or from the dashboard's openDAW button),
 * sfx/NNN_type.wav + sfx/manifest.json (one WAV per event), spec.json, build.json (what the dashboard shows).
 * Needs `bun run daw:setup` once (the bundle is written by openDAW's own scripting code, so it is always valid).
 * Rebuilding overwrites project.odb: edits made in openDAW are lost unless you saved/exported them (docs/OPENDAW.md).
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { REPO_ROOT, findPython, videoArg } from "../py";
import { OPENDAW_DIR, isSetUp } from "./setup";

const TAG = "daw";
const video = videoArg(TAG);
const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(n);
const val = (n: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
function die(m: string): never {
  console.error(`[${TAG}] ERROR: ${m}`);
  process.exit(1);
}

const ws = path.join(REPO_ROOT, "workspace", video);
if (!fs.existsSync(ws)) die(`no workspace ${ws}`);
const audio = path.join(ws, "06-audio");
const daw = path.join(audio, "daw");
const voice = [path.join(audio, "voiceover_master.wav"), path.join(ws, "05-video/public/voiceover.wav")].find((p) => fs.existsSync(p));
if (!voice) die("no voiceover found (run audio:master first)");
const eventsFile = path.join(ws, "05-video/events.json");
if (!fs.existsSync(eventsFile)) die("no 05-video/events.json (run `bun run cues` first)");
if (!isSetUp()) die("openDAW is not set up on this machine: run `bun run daw:setup` once");
const bpm = Number(val("--bpm") ?? 120);
if (!(bpm >= 20 && bpm <= 300)) die("--bpm must be 20..300");

// 1. one WAV per foley event (same sounds as audio:mix, event gain left for the region)
fs.mkdirSync(daw, { recursive: true });
const sfxDir = path.join(daw, "sfx");
const py = spawnSync(findPython(), [path.join(REPO_ROOT, "workflow/06-audio/sfx_daw.py"), "--events", eventsFile, "--out-dir", sfxDir, ...(flag("--no-lib") ? ["--no-lib"] : [])], { cwd: REPO_ROOT, stdio: "inherit" });
if (py.status !== 0) die("sfx_daw.py failed");
interface Ev { i: number; file: string; type: string; act: string | null; t: number; gain: number; dur: number }
const events: Ev[] = JSON.parse(fs.readFileSync(path.join(sfxDir, "manifest.json"), "utf8"));

// 2. spec: Voice, one unit per SFX type (lanes so clips on a track never overlap), Music, empty loops unit
type Region = { file: string; name: string; t: number; gainDb: number };
type Unit = { label: string; hue?: number; lanes: Region[][] };
const toDb = (g: number) => (g > 0 ? Math.round(20 * Math.log10(g) * 100) / 100 : -60);
const lanesFor = (rs: (Region & { dur: number })[]): Region[][] => {
  const lanes: { end: number; items: Region[] }[] = [];
  for (const r of [...rs].sort((a, b) => a.t - b.t)) {
    let lane = lanes.find((l) => l.end <= r.t - 0.01);
    if (!lane) lanes.push((lane = { end: 0, items: [] }));
    lane.items.push({ file: r.file, name: r.name, t: r.t, gainDb: r.gainDb });
    lane.end = r.t + r.dur;
  }
  return lanes.map((l) => l.items);
};
const units: Unit[] = [{ label: "Voice", hue: 210, lanes: [[{ file: voice, name: "voiceover", t: 0, gainDb: 0 }]] }];
const byType = new Map<string, Ev[]>();
for (const e of events) byType.set(e.type, [...(byType.get(e.type) ?? []), e]);
let hue = 20;
for (const [type, evs] of [...byType].sort((a, b) => b[1].length - a[1].length)) {
  units.push({
    label: `SFX ${type}`,
    hue: (hue += 47) % 360,
    lanes: lanesFor(evs.map((e) => ({ file: path.join(sfxDir, e.file), name: `${e.act ?? "--"} ${e.type}`, t: e.t, gainDb: toDb(e.gain), dur: e.dur }))),
  });
}
const music = path.join(audio, "music.wav");
const hasMusic = !flag("--no-music") && fs.existsSync(music);
units.push(hasMusic ? { label: "Music", hue: 140, lanes: [[{ file: music, name: "music stem", t: 0, gainDb: 0 }]] } : { label: "Music", hue: 140, lanes: [[]] });
units.push({ label: "Music loops (drop here)", hue: 100, lanes: [[]] });

const title = JSON.parse(fs.readFileSync(path.join(ws, "05-video/acts.json"), "utf8").toString() || "{}")?.video?.title as string | undefined;
const out = path.join(daw, "project.odb");
const spec = { name: title ?? video, bpm, out, units };
const specFile = path.join(daw, "spec.json");
fs.writeFileSync(specFile, JSON.stringify(spec, null, 1));

// 3. run openDAW's scripting fixture (vitest) to write the bundle
const testSrc = path.join(import.meta.dir, "WealthgapBundle.test.ts");
const testDst = path.join(OPENDAW_DIR, "packages/studio/scripting/src/test/WealthgapBundle.test.ts");
fs.copyFileSync(testSrc, testDst); // keep the clone's copy in step with the repo's
fs.rmSync(out, { force: true });
console.log(`[${TAG}] building ${path.relative(REPO_ROOT, out)}: ${units.length} tracks, ${events.length} SFX clips...`);
const r = spawnSync("npx", ["vitest", "run", "src/test/WealthgapBundle.test.ts"], {
  cwd: path.join(OPENDAW_DIR, "packages/studio/scripting"),
  env: { ...process.env, WG_SPEC: specFile, NODE_OPTIONS: "--max-old-space-size=8192" },
  encoding: "utf8",
  maxBuffer: 1 << 28,
});
const all = `${r.stdout}\n${r.stderr}`;
const m = all.match(/WG_RESULT (\{.*\})/);
if (r.status !== 0 || !m || !fs.existsSync(out)) {
  console.error(all.slice(-3000));
  die("bundle build failed (see above)");
}
const res = JSON.parse(m[1]) as { regions: number; samples: number; bytes: number };
const want = events.length + 1 + (hasMusic ? 1 : 0);
if (res.regions !== want) die(`decoded ${res.regions} regions, expected ${want}`);
// 4. read it back the way openDAW does (region count, every sample decodes)
fs.copyFileSync(path.join(import.meta.dir, "WealthgapVerify.test.ts"), path.join(OPENDAW_DIR, "packages/studio/scripting/src/test/WealthgapVerify.test.ts"));
const v = spawnSync("npx", ["vitest", "run", "src/test/WealthgapVerify.test.ts"], {
  cwd: path.join(OPENDAW_DIR, "packages/studio/scripting"),
  env: { ...process.env, WG_ODB: out, WG_EXPECT_REGIONS: String(want), NODE_OPTIONS: "--max-old-space-size=8192" },
  encoding: "utf8",
  maxBuffer: 1 << 28,
});
const vm = `${v.stdout}\n${v.stderr}`.match(/WG_VERIFY (\{.*\})/);
if (v.status !== 0 || !vm) {
  console.error(`${v.stdout}\n${v.stderr}`.slice(-3000));
  die("the built bundle failed verification (see above)");
}
console.log(`[${TAG}] verified: ${vm[1]}`);
fs.writeFileSync(
  path.join(daw, "build.json"),
  JSON.stringify({ builtAt: Date.now(), name: spec.name, bpm, regions: res.regions, samples: res.samples, bytes: res.bytes, events: events.length, music: hasMusic, tracks: units.map((u) => u.label) }, null, 1),
);
console.log(`[${TAG}] ${path.relative(REPO_ROOT, out)}: ${res.regions} clips (${events.length} SFX + voice${hasMusic ? " + music" : ""}), ${res.samples} samples, ${(res.bytes / 1e6).toFixed(0)} MB`);
