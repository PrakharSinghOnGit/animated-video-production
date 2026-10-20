import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import type { TranscribeOptions, ClipTranscript, FullTranscript } from "./src/types";

interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

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
    } else if (!arg.startsWith("-") && !options.video) {
      options.video = arg;
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
    .filter((d) => d.isDirectory() && d.name.startsWith("part-"))
    .sort((a, b) => {
      const numA = parseInt(a.name.replace(/\D/g, ""), 10) || 0;
      const numB = parseInt(b.name.replace(/\D/g, ""), 10) || 0;
      return numA - numB;
    });

  for (const pDir of partDirs) {
    const partNum = parseInt(pDir.name.replace("part-", ""), 10);
    if (partFilter !== undefined && partNum !== partFilter) continue;

    const fullPartDir = path.join(audioDir, pDir.name);
    const wavFiles = fs
      .readdirSync(fullPartDir)
      .filter((f) => f.endsWith(".wav") || f.endsWith(".mp3"))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

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
  const workspaceRoot = fs.existsSync(path.resolve(process.cwd(), "workspace"))
    ? path.resolve(process.cwd(), "workspace")
    : path.resolve(__dirname, "../../workspace");

  const candidates = fs.existsSync(workspaceRoot)
    ? fs.readdirSync(workspaceRoot, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
    : [];

  let targetVideo = options.video || process.env.ACTIVE_VIDEO || "VID01_Currency_Market";
  const matched = candidates.find((c) => c.toLowerCase() === targetVideo.toLowerCase()) ||
                  candidates.find((c) => c.toLowerCase().startsWith(targetVideo.toLowerCase()));
  if (matched) {
    targetVideo = matched;
  }

  const videoId = targetVideo;
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
  const whisperScript = path.resolve(__dirname, "transcribe_whisper.py");
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

    function cleanWords(rawWords: any[]): WordTimestamp[] {
      return (rawWords || [])
        .map((w: any) => ({
          word: String(w.word || "").trim(),
          start: Number(Number(w.start || 0).toFixed(2)),
          end: Number(Number(w.end || 0).toFixed(2)),
        }))
        .filter((w) => w.word.length > 0);
    }

    if (fs.existsSync(outputJson) && !options.force) {
      console.log(`    ⏩ Skipping: Already transcribed. (Use --force to re-transcribe)`);
      try {
        const cached = JSON.parse(fs.readFileSync(outputJson, "utf-8"));
        const cleanedWords = cleanWords(cached.words);
        clipTranscripts.push({
          part: clip.part,
          sectionId: baseName,
          duration: Number((cached.duration || 0).toFixed(2)),
          text: cached.text || "",
          words: cleanedWords,
        });
        totalWordsCount += cleanedWords.length;
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
      const cleanedWords = cleanWords(data.words);

      clipTranscripts.push({
        part: clip.part,
        sectionId: baseName,
        duration: Number((data.duration || 0).toFixed(2)),
        text: data.text || "",
        words: cleanedWords,
      });

      totalWordsCount += cleanedWords.length;
      totalAudioDuration += data.duration || 0;

      console.log(`✅ Done in ${elapsed}s (${cleanedWords.length} words, ${data.duration}s)\n`);
    } catch (err: any) {
      console.log(`❌ Failed: ${err.message}\n`);
    }
  }

  // 1. Minimized full transcript JSON (No duplicate segments or redundant file paths)
  const fullTranscript = {
    videoId,
    generatedAt: new Date().toISOString(),
    model,
    totalDuration: Number(totalAudioDuration.toFixed(2)),
    clips: clipTranscripts,
  };
  fs.writeFileSync(fullTranscriptPath, JSON.stringify(fullTranscript, null, 2), "utf-8");

  // 2. Word-Level CSV format (clip,start,end,word)
  const fullTranscriptCsvPath = path.join(transcriptionDir, "full_transcript.csv");
  let csvContent = "clip,start,end,word\n";
  for (const clip of clipTranscripts) {
    for (const w of clip.words) {
      const cleanWord = w.word.replace(/"/g, '""');
      csvContent += `${clip.sectionId},${w.start.toFixed(2)},${w.end.toFixed(2)},"${cleanWord}"\n`;
    }
  }
  fs.writeFileSync(fullTranscriptCsvPath, csvContent, "utf-8");

  // 3. Compact Inline Timeline Format (95% token reduction - optimal for Claude, GPT, Gemini)
  const fullTranscriptCompactPath = path.join(transcriptionDir, "full_transcript_compact.txt");
  let compactContent = `# Video Transcript: ${videoId}\n`;
  compactContent += `# Duration: ${totalAudioDuration.toFixed(1)}s | Clips: ${clipTranscripts.length} | Words: ${totalWordsCount}\n\n`;

  let cumulativeOffset = 0;
  for (const clip of clipTranscripts) {
    const clipStart = cumulativeOffset;
    const clipEnd = cumulativeOffset + clip.duration;
    compactContent += `## [${clip.sectionId}] (Part ${clip.part} | ${clipStart.toFixed(2)}s - ${clipEnd.toFixed(2)}s | ${clip.duration.toFixed(2)}s)\n`;
    compactContent += `Text: "${clip.text}"\n`;
    compactContent += `Words: ` + clip.words.map((w) => `[${w.start.toFixed(2)}] ${w.word}`).join(" ") + `\n\n`;
    cumulativeOffset += clip.duration;
  }
  fs.writeFileSync(fullTranscriptCompactPath, compactContent, "utf-8");

  // 4. Clips Summary CSV (High-level scene breakdown with cumulative timeline offsets)
  const clipsSummaryCsvPath = path.join(transcriptionDir, "clips_summary.csv");
  let clipsSummaryContent = "part,clip,timeline_start,timeline_end,duration,text\n";
  let cumOffset = 0;
  for (const clip of clipTranscripts) {
    const cStart = cumOffset;
    const cEnd = cumOffset + clip.duration;
    const cleanText = clip.text.replace(/"/g, '""');
    clipsSummaryContent += `${clip.part},${clip.sectionId},${cStart.toFixed(2)},${cEnd.toFixed(2)},${clip.duration.toFixed(2)},"${cleanText}"\n`;
    cumOffset += clip.duration;
  }
  fs.writeFileSync(clipsSummaryCsvPath, clipsSummaryContent, "utf-8");

  // 5. Ready-to-Paste AI Director Prompt (DIRECTOR_PROMPT template with auto-filled transcript & schema)
  const directorPromptTemplatePath = path.resolve(__dirname, "../prompts/DIRECTOR_PROMPT.md");
  let promptContent = "";
  if (fs.existsSync(directorPromptTemplatePath)) {
    const rawTemplate = fs.readFileSync(directorPromptTemplatePath, "utf-8");
    const fenceMatch = rawTemplate.match(/````markdown\n([\s\S]*?)\n````/);
    const templateBody = fenceMatch ? fenceMatch[1] : rawTemplate;

    promptContent = templateBody
      .replace(
        /\[PASTE FULL_TRANSCRIPT_COMPACT\.TXT OR FULL_TRANSCRIPT\.CSV HERE\]/gi,
        compactContent
      )
      .replace(/"jobId":\s*"VIDEO_WORKSPACE_ID"/g, `"jobId": "${videoId}"`)
      .replace(/"totalDurationMs":\s*101640/g, `"totalDurationMs": ${Math.round(totalAudioDuration * 1000)}`);
  } else {
    promptContent = compactContent;
  }

  const promptPathInTranscription = path.join(transcriptionDir, "prompt.txt");
  fs.writeFileSync(promptPathInTranscription, promptContent, "utf-8");

  const videoDir05 = path.join(videoDir, "05-video");
  if (!fs.existsSync(videoDir05)) fs.mkdirSync(videoDir05, { recursive: true });
  const promptPathInVideo = path.join(videoDir05, "prompt.txt");
  fs.writeFileSync(promptPathInVideo, promptContent, "utf-8");

  const jsonSizeKb = (fs.statSync(fullTranscriptPath).size / 1024).toFixed(1);
  const csvSizeKb = (fs.statSync(fullTranscriptCsvPath).size / 1024).toFixed(1);
  const compactSizeKb = (fs.statSync(fullTranscriptCompactPath).size / 1024).toFixed(1);
  const clipsSizeKb = (fs.statSync(clipsSummaryCsvPath).size / 1024).toFixed(1);
  const promptSizeKb = (fs.statSync(promptPathInTranscription).size / 1024).toFixed(1);

  console.log("=======================================================");
  console.log("                    SUMMARY");
  console.log("=======================================================");
  console.log(`  Total Audio Clips:   ${audioClips.length}`);
  console.log(`  Total Words:         ${totalWordsCount.toLocaleString()}`);
  console.log(`  Total Duration:      ${totalAudioDuration.toFixed(1)} seconds (~${(totalAudioDuration / 60).toFixed(1)} mins)`);
  console.log(`  Per-Clip Words:      ${path.relative(process.cwd(), wordsDir)}/`);
  console.log(`\n  Generated Deliverables:`);
  console.log(`  1. 🎯 Director Prompt: ${path.relative(process.cwd(), promptPathInTranscription)} (${promptSizeKb} KB - Auto-assembled, ready to paste into LLM!)`);
  console.log(`     (Also saved to:   ${path.relative(process.cwd(), promptPathInVideo)})`);
  console.log(`  2. Compact LLM Text: ${path.relative(process.cwd(), fullTranscriptCompactPath)} (${compactSizeKb} KB - 95% token savings)`);
  console.log(`  3. Word-Level CSV:   ${path.relative(process.cwd(), fullTranscriptCsvPath)} (${csvSizeKb} KB - Tabular word timestamps)`);
  console.log(`  4. Clips Summary CSV:${path.relative(process.cwd(), clipsSummaryCsvPath)} (${clipsSizeKb} KB - Scene timing & text)`);
  console.log(`  5. Minimized JSON:   ${path.relative(process.cwd(), fullTranscriptPath)} (${jsonSizeKb} KB - Clean Remotion JSON)`);
  console.log("=======================================================\n");
}

main().catch((err) => {
  console.error("Fatal error in transcription:", err);
  process.exit(1);
});
