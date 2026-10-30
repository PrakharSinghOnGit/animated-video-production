/**
 * Sound cues from the acts: foley events (each act file exports `events`) and the
 * music plan (tempo / intensity per act, silences, downbeats on act changes).
 *
 * Usage: bun run cues --video <ID>
 * Writes: <ws>/05-video/events.json and <ws>/06-audio/music_plan.json
 *
 * SFX edits (dashboard SFX review): <ws>/05-video/sfx_edits.json = { "off": [key], "gainDb": { key: dB } }, where
 * key = `${act}@${t.toFixed(2)}:${type}`. events_all.json lists every event with its key and edits (off / gainDb);
 * events.json (what the mix renders) keeps only the events that are on, gain scaled. Each event carries `seed` = its
 * index in events_all, so removing one SFX never changes which library sample the others get.
 *
 * Act contract: `export const events = (word) => [{ t, type, d?, gain?, pan? }]`
 * where `word(text, occurrence?)` returns that word's start in act-relative seconds
 * and every `t` is act-relative seconds.
 */
import fs from "node:fs";
import path from "node:path";
import { resolveJobPaths } from "../src/lib/workspaceBridge";
import { normWord, type ActsPlan } from "../src/lib/acts";

const args = process.argv.slice(2);
const vi = args.findIndex((a) => a === "--video" || a === "-v");
const videoId = vi >= 0 ? args[vi + 1] : args.find((a) => !a.startsWith("-"));
if (!videoId) {
  console.error("Usage: bun run cues --video <ID>");
  process.exit(1);
}

const paths = resolveJobPaths(videoId);
const wsDir = path.dirname(paths.outputDir);
const plan: ActsPlan = JSON.parse(fs.readFileSync(path.join(paths.outputDir, "acts.json"), "utf-8"));
const timeline = JSON.parse(fs.readFileSync(path.join(paths.outputDir, "timeline.json"), "utf-8"));
const fps: number = timeline.fps;
const scenesDir = path.join(paths.outputDir, "src", "scenes");

const events: { t: number; type: string; d?: number; gain?: number; pan?: number; act: string }[] = [];
const sections: any[] = [];
const hits: any[] = [];
const missing: string[] = [];

for (const act of plan.acts) {
  const scene = timeline.scenes.find((s: any) => s.id === act.id);
  if (!scene) continue;
  const winStart = scene.windowStartFrame / fps;
  const winEnd = scene.windowEndFrame / fps;
  // word(text, n) → act-relative seconds of the nth spoken occurrence inside this act
  const word = (text: string, occurrence = 1): number => {
    const matches = (scene.words as any[]).filter((w) => normWord(w.text) === normWord(text));
    const w = matches[Math.min(matches.length, Math.max(1, occurrence)) - 1];
    return w ? w.startFrame / fps : scene.voiceStartFrame / fps;
  };

  const file = fs.readdirSync(scenesDir).find((f) => new RegExp(`^${act.id}.*\\.tsx$`, "i").test(f));
  if (file) {
    const mod = await import(path.join(scenesDir, file));
    if (typeof mod.events === "function") {
      for (const e of mod.events(word) ?? []) {
        if (typeof e?.t !== "number" || !e.type) continue;
        events.push({ ...e, t: Math.round((winStart + e.t) * 1000) / 1000, act: act.id });
      }
    } else {
      missing.push(`${act.id}: no events export`);
    }
  } else {
    missing.push(`${act.id}: no act file yet`);
  }

  sections.push({
    label: act.id,
    title: act.title,
    ...(act.chapter ? { intro: "swell" } : {}),
    t0: Math.round(winStart * 1000) / 1000,
    t1: Math.round(winEnd * 1000) / 1000,
    bpm: act.bpm,
    key: (act as any).key ?? "D",
    mode: (act as any).mode ?? (act.intensity < 0.3 ? "dorian" : "major"),
    intensity: act.intensity,
  });
  hits.push({ t: Math.round(winStart * 1000) / 1000, kind: "downbeat" });
  for (const s of act.silence ?? []) {
    const t = winStart + word(s.word, s.occurrence ?? 1);
    hits.push({ t: Math.round((t - s.durMs / 1000) * 1000) / 1000, kind: "silence", dur: s.durMs / 1000 });
    hits.push({ t: Math.round(t * 1000) / 1000, kind: "stab" }); // the first sound after a silence is the act's accent
  }
}

events.sort((a, b) => a.t - b.t);
const editsPath = path.join(paths.outputDir, "sfx_edits.json");
const edits: { off?: string[]; gainDb?: Record<string, number> } = fs.existsSync(editsPath) ? JSON.parse(fs.readFileSync(editsPath, "utf-8")) : {};
const off = new Set(edits.off ?? []);
const seen = new Map<string, number>();
const all = events.map((e, i) => {
  let key = `${e.act}@${e.t.toFixed(2)}:${e.type}`;
  const n = (seen.get(key) ?? 0) + 1; seen.set(key, n);
  if (n > 1) key += `#${n}`;
  const db = edits.gainDb?.[key];
  return { key, ...e, seed: i, ...(off.has(key) ? { off: true } : {}), ...(db ? { gainDb: db } : {}) };
});
const on = all.filter((e) => !e.off).map(({ key, off: _o, gainDb, ...e }) =>
  gainDb ? { ...e, gain: Math.round((e.gain ?? 1) * 10 ** (gainDb / 20) * 1000) / 1000 } : e);
const stale = [...off, ...Object.keys(edits.gainDb ?? {})].filter((k) => !all.some((e) => e.key === k));
fs.writeFileSync(path.join(paths.outputDir, "events_all.json"), JSON.stringify(all, null, 1), "utf-8");
fs.writeFileSync(path.join(paths.outputDir, "events.json"), JSON.stringify(on, null, 1), "utf-8");
const audioDir = path.join(wsDir, "06-audio");
fs.mkdirSync(audioDir, { recursive: true });
const duration = timeline.durationFrames / fps;
fs.writeFileSync(path.join(audioDir, "music_plan.json"), JSON.stringify({ sr: 48000, duration, style: plan.style, sections, hits }, null, 2), "utf-8");

console.log(`✅ ${on.length} foley events → 05-video/events.json${on.length < all.length ? ` (${all.length - on.length} removed in sfx_edits.json)` : ""}`);
if (stale.length) console.log(`   ⚠️  ${stale.length} SFX edit(s) no longer match an event (the act's timing changed): ${stale.join(", ")}`);
console.log(`✅ ${sections.length} music sections, ${hits.length} hits → 06-audio/music_plan.json`);
for (const m of missing) console.log(`   ⚠️  ${m}`);
