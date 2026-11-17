/**
 * Measure a video's mix: loudness (integrated, true peak, LRA, short-term spread), SFX density, sample repetition and,
 * when stems exist, how often SFX and music crowd the voice in the speech band. Nothing is rendered or paid for.
 * Usage: bun run audio:report --video <ID> [--mix <wav>]
 * Stems: `bun run audio:mix --video <ID> --stems workspace/<ID>/06-audio/stems` first for the masking numbers.
 * Writes 06-audio/mix_report.json.
 */
import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT, runPython, videoArg } from "./py";

const video = videoArg("audio:report");
const ws = path.join(REPO_ROOT, "workspace", video);
const a = process.argv.slice(2), i = a.indexOf("--mix");
const mix = i >= 0 ? path.resolve(a[i + 1]) : path.join(ws, "06-audio/mix.wav");
if (!fs.existsSync(mix)) { console.error(`[audio:report] ERROR: no mix at ${path.relative(REPO_ROOT, mix)} (run audio:mix)`); process.exit(1); }
const opt = (flag: string, p: string) => (fs.existsSync(p) ? [flag, p] : []);
runPython("audio:report", "report.py", ["--mix", mix, ...opt("--stems", path.join(ws, "06-audio/stems")), ...opt("--events", path.join(ws, "05-video/events.json")),
  ...opt("--picks", path.join(path.dirname(mix), "mix_picks.json")), "--json", path.join(ws, "06-audio/mix_report.json")]);
