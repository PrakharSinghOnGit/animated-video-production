/**
 * Captions stage: normalizes the workspace transcript (04-transcription/full_transcript.json)
 * into word-level `captions.json` in the video's 05-video dir.
 * storyboard, storyboard:check, timeline and assemble all read this file.
 *
 * Usage: bun run workflow/05-video/scripts/captions.ts --video <ID>
 */
import fs from "node:fs";
import path from "node:path";
import { resolveJobPaths } from "../src/lib/workspaceBridge";
import { probeAudio } from "../src/lib/audioProbe";
import { normalizeTranscript } from "../src/lib/normalizeTranscript";

async function main() {
  const args = process.argv.slice(2);
  let target: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--video" || args[i] === "-v") {
      target = args[++i];
    } else if (!args[i].startsWith("-") && !target) {
      target = args[i];
    }
  }
  if (!target) {
    console.error("Usage: bun run captions --video <ID>");
    process.exit(1);
  }

  const paths = resolveJobPaths(target);
  if (!paths.transcriptFile || !fs.existsSync(paths.transcriptFile)) {
    console.error(`❌ Missing transcript for ${paths.jobId} (expected 04-transcription/full_transcript.json). Run "bun run transcribe" first.`);
    process.exit(1);
  }

  let durationSec: number | undefined;
  if (paths.audioFile && fs.existsSync(paths.audioFile)) {
    durationSec = (await probeAudio(paths.audioFile)).durationSec;
  } else {
    console.warn(`⚠️  No voiceover audio found for ${paths.jobId}; normalizing without audio duration.`);
  }

  const raw = fs.readFileSync(paths.transcriptFile, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = raw; // raw SRT/VTT
  }

  const result = normalizeTranscript(parsed, durationSec);
  console.log(
    `Transcript normalized: ${result.stats.wordCount} words, format "${result.formatDetected}", ${result.stats.durationMs}ms`
  );
  for (const w of result.warnings) console.warn(`  - ${w}`);

  fs.mkdirSync(paths.outputDir, { recursive: true });
  const out = path.join(paths.outputDir, "captions.json");
  fs.writeFileSync(out, JSON.stringify(result.captions, null, 2), "utf-8");
  console.log(`✓ Saved ${out}`);
}

main().catch((err) => {
  console.error(`❌ Captions failed: ${err.message}`);
  process.exit(1);
});
