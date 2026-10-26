/**
 * Procedural music bed. Usage: bun run audio:music --video <ID>
 * Reads workspace/<ID>/06-audio/music_plan.json (see music.py), writes music.wav + beats.json beside it.
 */
import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT, runPython, videoArg } from "./py";

const video = videoArg("audio:music");
const dir = path.join(REPO_ROOT, "workspace", video, "06-audio");
const plan = path.join(dir, "music_plan.json");
if (!fs.existsSync(plan)) {
  console.error(`[audio:music] ERROR: ${plan} not found`);
  process.exit(1);
}
runPython("audio:music", "music.py", ["--plan", plan, "--out", path.join(dir, "music.wav"), "--beats", path.join(dir, "beats.json")]);
