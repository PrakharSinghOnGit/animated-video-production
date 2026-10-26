/**
 * Lengthen sentence and section pauses in existing narration, then rebuild everything
 * downstream (combined track, alignment, master, captions). Re-runnable with other values.
 *
 * Usage: bun run tts:gaps --video <ID> [--sentence-gap 0.6] [--section-gap 0.9]
 */
import path from "node:path";
import { execFileSync, execSync } from "node:child_process";
import { findPython } from "./src/voice_profile";

const args = process.argv.slice(2);
const flag = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : d;
};
const video = flag("--video", "");
if (!video) {
  console.error("Usage: bun run tts:gaps --video <ID> [--sentence-gap 0.6] [--section-gap 0.9]");
  process.exit(1);
}
const ws = path.resolve(process.cwd(), "workspace", video);
const t0 = Date.now();
execFileSync(findPython(), [
  path.resolve(import.meta.dir, "src/gaps.py"),
  "--audio-dir", path.join(ws, "03-voiceover/audio"),
  "--words-dir", path.join(ws, "04-transcription/words"),
  "--sentence-gap", flag("--sentence-gap", "0.6"),
  "--section-gap", flag("--section-gap", "0.9"),
], { stdio: "inherit" });
for (const cmd of [
  `bun run tts --video ${video} --combine`,
  `bun run transcribe --video ${video}`,
  `bun run audio:master --video ${video}`,
  `bun run captions --video ${video}`,
]) {
  console.log(`\n▶ ${cmd}`);
  execSync(cmd, { stdio: ["ignore", "ignore", "inherit"] });
}
console.log(`\n✅ pauses applied and narration re-aligned in ${Math.round((Date.now() - t0) / 1000)}s`);
