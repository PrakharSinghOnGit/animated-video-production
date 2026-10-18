import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import type { TranscribeOptions, ClipTranscript, FullTranscript } from "./src/types";

function findPython(): string {
  // Check DancingDuck venv
  const duckVenv = path.resolve(process.cwd(), "../DancingDuck/.venv/bin/python");
  if (fs.existsSync(duckVenv)) return duckVenv;

  // Check local venv
  const localVenv = path.resolve(process.cwd(), ".venv/bin/python");
  if (fs.existsSync(localVenv)) return localVenv;

  // Check env variable
  if (process.env.PYTHON_PATH && fs.existsSync(process.env.PYTHON_PATH)) {
    return process.env.PYTHON_PATH;
  }

  // Fallback to system python3
  return "python3";
}

function parseArgs(): TranscribeOptions {
  const args = process.argv.slice(2);
  const options: TranscribeOptions = {
    model: "base",
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (arg === "--video" || arg === "-v") {
      options.video = args[++i];
    } else if (arg === "--model" || arg === "-m") {
      options.model = args[++i] as any;
    } else if (arg === "--part" || arg === "-p") {
      options.part = parseInt(args[++i], 10);
    } else if (arg === "--force" || arg === "-f") {
      options.force = true;
    } else if (arg === "--python") {
      options.pythonPath = args[++i];
    }
  }

  return options;
}

function printHelp() {
  console.log(`
🎙️  04-Transcription: Word-Level Whisper Transcriber

Usage:
  bun run 04-transcription/transcribe.ts [options]
  bun run transcribe [options]

Options:
  --help, -h               Show this help message
  --video, -v <id>         Target video workspace (default: active workspace or VID01_Currency_Market)
  --model, -m <size>       Whisper model (tiny, base, small, medium, large-v3) [default: base]
  --part, -p <number>      Transcribe audio files for a specific part only
  --force, -f              Overwrite existing word transcript JSONs
  --python <path>          Path to Python executable with faster-whisper

Outputs:
  workspace/<VIDEO>/04-transcription/words/<clip_name>.json
  workspace/<VIDEO>/04-transcription/full_transcript.json

Examples:
  bun run transcribe
  bun run transcribe --video VID01_Currency_Market --model base
  bun run transcribe --part 1 --force
`);
}

function findAudioFiles(audioDir: string, partFilter?: number): { part: number; file: string }[] {
  if (!fs.existsSync(audioDir)) return [];
  const results: { part: number; file: string }[] = [];

  const partDirs = fs
    .readdirSync(audioDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith("part-"));

  for (const pDir of partDirs) {
    const partNum = parseInt(pDir.name.replace("part-", ""), 10);
    if (partFilter !== undefined && partNum !== partFilter) continue;

    const fullPartDir = path.join(audioDir, pDir.name);
    const wavFiles = fs
      .readdirSync(fullPartDir)
      .filter((f) => f.endsWith(".wav") || f.endsWith(".mp3"))
      .sort();

    for (const f of wavFiles) {
      results.push({
        part: partNum,
        file: path.join(fullPartDir, f),
      });
    }
  }

  return results;
}

async function main() {
  const options = parseArgs();
  const workspaceRoot = path.resolve(process.cwd(), "workspace");
  const videoId = options.video || process.env.ACTIVE_VIDEO || "VID01_Currency_Market";
  const videoDir = path.join(workspaceRoot, videoId);

  if (!fs.existsSync(videoDir)) {
    console.error(`❌ Video workspace not found at: ${videoDir}`);
    process.exit(1);
  }

  const audioDir = path.join(videoDir, "03-voiceover", "audio");
  const transcriptionDir = path.join(videoDir, "04-transcription");
  const wordsDir = path.join(transcriptionDir, "words");
  const fullTranscriptPath = path.join(transcriptionDir, "full_transcript.json");

  fs.mkdirSync(wordsDir, { recursive: true });

  const audioClips = findAudioFiles(audioDir, options.part);
  if (audioClips.length === 0) {
    console.log(`⚠️ No audio files found in: ${path.relative(process.cwd(), audioDir)}`);
    console.log("Run Step 3 (bun run tts) to generate voiceover audio first.");
    process.exit(0);
  }

  const pythonExec = options.pythonPath || findPython();
  const whisperScript = path.resolve(process.cwd(), "04-transcription/transcribe_whisper.py");
  const model = options.model || "base";

  console.log("\n=======================================================");
  console.log("🎙️  04-TRANSCRIPTION: WORD-LEVEL TIMESTAMP GENERATOR");
  console.log("=======================================================");
  console.log(`  Video Workspace: ${videoId}`);
  console.log(`  Model:           ${model}`);
  console.log(`  Python:          ${pythonExec}`);
  console.log(`  Total Clips:     ${audioClips.length}`);
  console.log(`  Output Dir:      ${path.relative(process.cwd(), wordsDir)}`);
  console.log("=======================================================\n");

  const clipTranscripts: ClipTranscript[] = [];
  let totalWordsCount = 0;
  let totalAudioDuration = 0;

  for (let i = 0; i < audioClips.length; i++) {
    const clip = audioClips[i];
    const baseName = path.basename(clip.file, path.extname(clip.file));
    const outputJson = path.join(wordsDir, `${baseName}.json`);

    console.log(`[${i + 1}/${audioClips.length}] Part ${clip.part}: ${baseName}`);

    if (fs.existsSync(outputJson) && !options.force) {
      console.log(`    ⏩ Skipping: Already transcribed. (Use --force to re-transcribe)`);
      try {
        const cached = JSON.parse(fs.readFileSync(outputJson, "utf-8"));
        clipTranscripts.push({
          file: clip.file,
          part: clip.part,
          sectionId: baseName,
          duration: cached.duration || 0,
          text: cached.text || "",
          words: cached.words || [],
          segments: cached.segments || [],
        });
        totalWordsCount += (cached.words || []).length;
        totalAudioDuration += cached.duration || 0;
      } catch {}
      console.log();
      continue;
    }

    try {
      const startTime = Date.now();
      process.stdout.write(`    ⏳ Transcribing with Whisper (${model})... `);

      const cmd = `"${pythonExec}" "${whisperScript}" --audio "${clip.file}" --output "${outputJson}" --model "${model}"`;
      execSync(cmd, { stdio: "pipe" });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      const data = JSON.parse(fs.readFileSync(outputJson, "utf-8"));

      clipTranscripts.push({
        file: clip.file,
        part: clip.part,
        sectionId: baseName,
        duration: data.duration || 0,
        text: data.text || "",
        words: data.words || [],
        segments: data.segments || [],
      });

      totalWordsCount += (data.words || []).length;
      totalAudioDuration += data.duration || 0;

      console.log(`✅ Done in ${elapsed}s (${(data.words || []).length} words, ${data.duration}s)\n`);
    } catch (err: any) {
      console.log(`❌ Failed: ${err.message}\n`);
    }
  }

  // Save aggregate full transcript
  const fullTranscript: FullTranscript = {
    videoId,
    generatedAt: new Date().toISOString(),
    model,
    totalDuration: Number(totalAudioDuration.toFixed(2)),
    clips: clipTranscripts,
  };

  fs.writeFileSync(fullTranscriptPath, JSON.stringify(fullTranscript, null, 2));

  console.log("=======================================================");
  console.log("                    SUMMARY");
  console.log("=======================================================");
  console.log(`  Total Audio Clips:   ${audioClips.length}`);
  console.log(`  Total Words:         ${totalWordsCount.toLocaleString()}`);
  console.log(`  Total Duration:      ${totalAudioDuration.toFixed(1)} seconds (~${(totalAudioDuration / 60).toFixed(1)} mins)`);
  console.log(`  Per-Clip Words:      ${path.relative(process.cwd(), wordsDir)}/`);
  console.log(`  Full Transcript:     ${path.relative(process.cwd(), fullTranscriptPath)}`);
  console.log("=======================================================\n");
}

main().catch((err) => {
  console.error("Fatal error in transcription:", err);
  process.exit(1);
});
