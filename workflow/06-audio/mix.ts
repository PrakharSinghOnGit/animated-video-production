/**
 * Final audio mix: voice + ducked music + foley, mastered to -14 LUFS / -1 dBTP.
 * Usage: bun run audio:mix --video <ID> [extra mix.py flags, e.g. --duck-db -12 --music-db -4]
 */
import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT, runPython, videoArg } from "./py";

const video = videoArg("audio:mix");
const ws = path.join(REPO_ROOT, "workspace", video);
const first = (...c: string[]) => c.find((p) => fs.existsSync(p));

const voice = first(path.join(ws, "06-audio/voiceover_master.wav"), path.join(ws, "05-video/public/voiceover.wav"));
if (!voice) {
  console.error(`[audio:mix] ERROR: no voiceover found for ${video} (run audio:master first)`);
  process.exit(1);
}
const music = first(path.join(ws, "06-audio/music.wav")) ?? "none";
const events = first(path.join(ws, "05-video/events.json")) ?? "none";
const out = path.join(ws, "06-audio/mix.wav");
// pass through any flags other than --video <ID>
const raw = process.argv.slice(2);
const extra: string[] = [];
for (let i = 0; i < raw.length; i++) {
  if (raw[i] === "--video" || raw[i] === "-v") i++;
  else extra.push(raw[i]);
}
console.log(`[audio:mix] voice=${path.relative(REPO_ROOT, voice)} music=${music === "none" ? "none" : "yes"} events=${events === "none" ? "none" : "yes"}`);
runPython("audio:mix", "mix.py", ["--voice", voice, "--music", music, "--events", events, "--out", out, ...extra]);
