/**
 * One WAV per SFX event for previewing in the dashboard's SFX review, including the events switched off in
 * sfx_edits.json (so they can be heard before restoring them). Same sound as the mix (sfx_daw.py, per-event seed).
 * Usage: bun run sfx:clips --video <ID | ID/shorts/S1>
 * Output: <ws>/06-audio/sfx_clips/NNN_type.wav + manifest.json [{ key, file, type, act, t, dur, off, gain }]
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { REPO_ROOT, runPython, videoArg } from "./py";

const video = videoArg("sfx:clips");
const ws = path.join(REPO_ROOT, "workspace", video);
const all = path.join(ws, "05-video/events_all.json");
if (!fs.existsSync(all)) {
  console.log("[sfx:clips] no events_all.json yet: running cues");
  const r = spawnSync("bun", ["run", "cues", "--video", video], { cwd: REPO_ROOT, stdio: "inherit" });
  if (r.status !== 0 || !fs.existsSync(all)) { console.error("[sfx:clips] ERROR: cues failed"); process.exit(1); }
}
runPython("sfx:clips", "sfx_daw.py", ["--events", all, "--out-dir", path.join(ws, "06-audio/sfx_clips")]);
