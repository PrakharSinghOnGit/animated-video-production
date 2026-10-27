import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { alignScriptToAsr, matchedFraction } from "./src/align";
import type { TranscribeOptions, ClipTranscript, FullTranscript } from "./src/types";

interface WordTimestamp {
  word: string;
  start: number;
  end: number;
  matched?: boolean;
}

const DEFAULT_MODEL = process.env.WHISPER_MODEL || "small.en";
const MATCH_WARN_PCT = 80;

/** Exact clip duration in seconds from the WAV header (frames / sample rate). */
function wavDurationSeconds(file: string): number | undefined {
  try {
    const fd = fs.openSync(file, "r");
    try {
      const size = fs.fstatSync(fd).size;
      const head = Buffer.alloc(Math.min(size, 1 << 16));
      fs.readSync(fd, head, 0, head.length, 0);
      if (head.toString("ascii", 0, 4) !== "RIFF" || head.toString("ascii", 8, 12) !== "WAVE") return undefined;
      let pos = 12;
      let byteRate = 0;
      while (pos + 8 <= head.length) {
        const id = head.toString("ascii", pos, pos + 4);
        let len = head.readUInt32LE(pos + 4);
        if (id === "fmt ") byteRate = head.readUInt32LE(pos + 16);
        if (id === "data") {
          if (len === 0 || len === 0xffffffff || pos + 8 + len > size) len = size - (pos + 8); // streamed/truncated header
          return byteRate ? len / byteRate : undefined;
        }
        pos += 8 + len + (len % 2);
      }
    } finally {
      fs.closeSync(fd);
    }
  } catch {}
  return undefined;
}

/** Exact duration: WAV header, else ffprobe, else the (rounded) value Whisper reported. */
function exactDuration(file: string, fallback: number): number {
  const wav = wavDurationSeconds(file);
  if (wav !== undefined && wav > 0) return wav;
  try {
    const out = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${file}"`, { stdio: "pipe" }).toString().trim();
    const v = parseFloat(out);
    if (Number.isFinite(v) && v > 0) return v;
  } catch {}
  return fallback;
}

type SectionLookup = (clipBaseName: string) => string | undefined;

/** Load the workspace's script sections; clip `NN_...` maps to getAllSections()[NN-1].text. */
async function loadSectionLookup(videoDir: string): Promise<SectionLookup> {
  const modPath = path.join(videoDir, "03-voiceover", "sections", "index.ts");
  if (!fs.existsSync(modPath)) return () => undefined;
  try {
    const mod = await import(modPath);
    const sections: { text?: string }[] = mod.getAllSections();
    return (name) => {
      const m = name.match(/^(\d+)_/);
      return m ? sections[parseInt(m[1], 10) - 1]?.text : undefined;
    };
  } catch (err: any) {
    console.warn(`⚠️ Could not load script sections (${err.message}); falling back to raw ASR words.`);
    return () => undefined;
  }
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
    model: DEFAULT_MODEL,
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
  --model, -m <size>       Whisper model (tiny, base, small.en, medium, large-v3, ...) [default: small.en; env WHISPER_MODEL]
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
  const model = options.model || DEFAULT_MODEL;

  console.log("\n=======================================================");
  console.log("🎙️  04-TRANSCRIPTION: WORD-LEVEL TIMESTAMP GENERATOR");
  console.log("=======================================================");
  console.log(`  Video Workspace: ${videoId}`);
  console.log(`  Model:           ${model}`);
  console.log(`  Python:          ${pythonExec}`);
  console.log(`  Total Clips:     ${audioClips.length}`);
  console.log(`  Output Dir:      ${path.relative(process.cwd(), wordsDir)}`);
  console.log("=======================================================\n");

  const sectionTextFor = await loadSectionLookup(videoDir);
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
          start: Number(Number(w.start || 0).toFixed(3)),
          end: Number(Number(w.end || 0).toFixed(3)),
          ...(typeof w.matched === "boolean" ? { matched: w.matched } : {}),
        }))
        .filter((w) => w.word.length > 0);
    }

    // Build the clip entry from Whisper output (`data`), replacing ASR words with the
    // script's words when the section text is known. Rewrites the word JSON with the
    // raw ASR preserved under `asr_words`.
    function buildClip(data: any): ClipTranscript {
      const asrWords = cleanWords(data.asr_words ?? data.words);
      const duration = exactDuration(clip.file, Number(data.duration || 0));
      const sectionText = sectionTextFor(baseName);
      let words = asrWords;
      let text: string = data.text || "";
      let matchedPct: number | undefined;

      if (sectionText) {
        const aligned = alignScriptToAsr(sectionText, asrWords, { clipStart: 0, clipEnd: duration });
        words = cleanWords(aligned);
        text = aligned.map((a) => a.word).join(" ");
        matchedPct = Number((matchedFraction(aligned) * 100).toFixed(1));
        const warn = matchedPct < MATCH_WARN_PCT ? `  ⚠️ below ${MATCH_WARN_PCT}% - likely TTS babble, listen to this clip` : "";
        console.log(`    🔗 Script-aligned: ${matchedPct}% of ${aligned.length} tokens matched ASR${warn}`);
        fs.writeFileSync(
          outputJson,
          JSON.stringify({ ...data, duration, text, words, asr_words: asrWords, matchedPct }, null, 2),
          "utf-8"
        );
      } else {
        console.log(`    ℹ️ No script section found for this clip; using raw ASR words.`);
      }

      return {
        part: clip.part,
        sectionId: baseName,
        duration,
        durationMs: duration * 1000,
        text,
        words,
        ...(sectionText ? { asr_words: asrWords, matchedPct } : {}),
      };
    }

    // Re-transcribe when the audio was regenerated after its transcript
    const fresh = fs.existsSync(outputJson) && fs.statSync(outputJson).mtimeMs >= fs.statSync(clip.file).mtimeMs;
    if (fresh && !options.force) {
      console.log(`    ⏩ Skipping Whisper: Already transcribed. (Use --force to re-transcribe)`);
      try {
        const cached = JSON.parse(fs.readFileSync(outputJson, "utf-8"));
        const entry = buildClip(cached);
        clipTranscripts.push(entry);
        totalWordsCount += entry.words.length;
        totalAudioDuration += entry.duration;
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
      console.log(`✅ Done in ${elapsed}s (${data.words?.length ?? 0} ASR words, ${data.duration}s)`);

      const entry = buildClip(data);
      clipTranscripts.push(entry);
      totalWordsCount += entry.words.length;
      totalAudioDuration += entry.duration;
      console.log();
    } catch (err: any) {
      console.log(`❌ Failed: ${err.message}\n`);
    }
  }

  // 1. Minimized full transcript JSON (No duplicate segments or redundant file paths)
  const fullTranscript = {
    videoId,
    generatedAt: new Date().toISOString(),
    model,
    totalDuration: Number(totalAudioDuration.toFixed(3)),
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

  const jsonSizeKb = (fs.statSync(fullTranscriptPath).size / 1024).toFixed(1);
  const csvSizeKb = (fs.statSync(fullTranscriptCsvPath).size / 1024).toFixed(1);
  const compactSizeKb = (fs.statSync(fullTranscriptCompactPath).size / 1024).toFixed(1);
  const clipsSizeKb = (fs.statSync(clipsSummaryCsvPath).size / 1024).toFixed(1);

  console.log("=======================================================");
  console.log("                    SUMMARY");
  console.log("=======================================================");
  console.log(`  Total Audio Clips:   ${audioClips.length}`);
  console.log(`  Total Words:         ${totalWordsCount.toLocaleString()}`);
  console.log(`  Total Duration:      ${totalAudioDuration.toFixed(1)} seconds (~${(totalAudioDuration / 60).toFixed(1)} mins)`);
  console.log(`  Per-Clip Words:      ${path.relative(process.cwd(), wordsDir)}/`);
  console.log(`\n  Generated Deliverables:`);
  console.log(`  1. Compact LLM Text: ${path.relative(process.cwd(), fullTranscriptCompactPath)} (${compactSizeKb} KB - 95% token savings)`);
  console.log(`  2. Word-Level CSV:   ${path.relative(process.cwd(), fullTranscriptCsvPath)} (${csvSizeKb} KB - Tabular word timestamps)`);
  console.log(`  3. Clips Summary CSV:${path.relative(process.cwd(), clipsSummaryCsvPath)} (${clipsSizeKb} KB - Scene timing & text)`);
  console.log(`  4. Minimized JSON:   ${path.relative(process.cwd(), fullTranscriptPath)} (${jsonSizeKb} KB - Clean Remotion JSON)`);
  console.log("=======================================================\n");
}

main().catch((err) => {
  console.error("Fatal error in transcription:", err);
  process.exit(1);
});
