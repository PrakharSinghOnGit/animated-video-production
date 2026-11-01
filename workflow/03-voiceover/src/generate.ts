import fs from "fs";
import path from "path";
import os from "os";
import { execSync, execFileSync } from "child_process";
import { resolveWorkspace, loadSections, listAvailableVideos } from "./workspace";
import { resolveVoice, findPython } from "./voice_profile";
import { normalizeForSpeech } from "./normalize";
import { chunkText } from "./chunk";
import { moodFor } from "./mood";
import type { GenerationOptions, TtsModel, VOSection } from "./types";

const ENGINE_NAME: Record<TtsModel, string> = { qwen: "Qwen3-TTS", gemini: "Gemini TTS" };
/** The channel's base direction for Gemini; each section's [VO: tone] note is added to it (sectionStyle). */
// Kept short on purpose: Google's guide says long direction text is the main cause of voice drift, and speaker traits
// belong to the voice, not the style. Emphasis and pauses come from the script's own marks (CAPS, ..., —, <short pause>).
export const DEFAULT_GEMINI_STYLE = "Conversational YouTube explainer talking to one friend; natural and alive, never announcer-like";
export const DEFAULT_GEMINI_VOICE = "Algenib";
/** Passage length per TTS call: whole sentences of one script block, so sentences are phrased together. */
const PASSAGE_CHARS: Record<TtsModel, number> = { gemini: 1200, qwen: 420 };

/** Base style + this section's tone note ("[VO: dry, slightly lower]" -> "This passage: dry, slightly lower."). */
function sectionStyle(base: string, instruction?: string): string {
  const tone = (instruction ?? "").replace(/^[\s`\[]*VO\s*:\s*/i, "").replace(/[\]`]+\s*$/, "").trim();
  return tone ? `${base}. This passage: ${tone}.` : base;
}

/** The engine when none is given: TTS_ENGINE in .env, else Gemini. */
export function defaultEngine(): TtsModel {
  const e = (process.env.TTS_ENGINE ?? "").trim().toLowerCase();
  return e === "qwen" || e === "gemini" ? e : "gemini";
}

/** Gemini TTS bills 25 audio tokens per second ($9 / 1M through 2026-12-31). ~14 chars of narration per second; every take is billed. */
function geminiCost(sections: VOSection[], takes: number) {
  const secs = sections.reduce((n, s) => n + s.text.length, 0) / 14;
  const one = (secs * 25 * 9) / 1e6;
  return `~$${one.toFixed(2)} per take ($${(one * Math.max(1, takes)).toFixed(2)} worst case at ${takes} takes; free tier: $0)`;
}

export function printHelp() {
  console.log(`
🎙️  03-Voiceover
   • Default: Gemini TTS (cloud; free tier with an AI Studio key in GEMINI_TTS, else ~$0.15 per 9-min take)
     Each script block is read in one call with the channel style + its [VO: tone] note as direction.
   • --qwen: Qwen3-TTS 1.7B (local, Apple Silicon MLX, free) cloning the channel voice (voices/ACTIVE)
   • TTS_ENGINE=qwen|gemini in .env changes the default

Usage:
  bun run tts [options]

Voice:
  --voice-profile <name>   Clone voices/<name> instead of the channel voice (bun run voice:list)
  --no-moods               Read every section with the main reference (ignore tone notes / mood clips)
  --temperature <x>        Qwen sampling temperature (model default ~0.9; lower = steadier, higher = livelier)
  --pace <x>               Tempo of the chosen take, pitch kept (default 1 = as generated)
  --sentence-gap <s>       Pause between passages of one long block, seconds (default 0.45; inside a passage the model paces itself)
  --section-gap <s>        Pause after each script section (default 0.9)
  --chapter-gap <s>        Pause at a chapter (part) change, for the chapter title card (default 0 = off)
  --pause-ms <n>           Raw pause between passages in ms (overrides --sentence-gap)

Voices:
  bun run voice:design --name <slug> --describe "..."   Design a voice (Qwen VoiceDesign): writes takes to listen to
  bun run voice:design --name <slug> --pick <n>         Make take n the clip that gets cloned
  bun run voice:use <slug>                              Make it the channel voice (every video and short)
  bun run voice:emotions --name <slug>                  Mood clips (excited, suspense, serious, wry) of that voice;
                                                        each section's tone note picks one
  bun run voice:list

Gemini:
  --gemini / --qwen        Pick the engine for this run (key GEMINI_TTS in .env, else Vertex AI via gcloud ADC)
  --voice <name>           Gemini voice (default Algenib) or a designed Gemini voice
  --parallel <n>           Gemini requests in flight at once (default 4)
  --style "<text>"         Channel delivery direction (each section's tone note is appended to it)
  --gemini-model <id>      default gemini-3.8-flash-tts (3.8 takes --style only via the API key)

Target Options:
  --video <id>             Target video workspace (e.g. --video VID01_Currency_Market)
  --part, -p <number>      Generate audio for a specific part only (e.g. --part 1)
  --section, -s <id>       Generate audio for a specific section ID (e.g. --section part1_01_beat)
  --cost, -e               Count characters per section
  --list, -l               List all script sections
  --dry-run, -d            Preview voice settings and paths without generating audio
  --force, -f              Overwrite existing audio files
  --takes <n>              Takes per passage; the first one ASR finds correct is kept (default 3; 1 = fast, no ASR)
  --accept-wer <0-1>       A take with at most this word error rate is kept (default 0.08)
  --asr-model <name>       faster-whisper model that scores takes (default small.en)
  --check-ref              Verify the reference clip matches its transcript before synthesizing
  --combine, -c            Combine generated clips into single tracks per part and full script (ffmpeg)

Examples:
  bun run tts --video <id> --force --combine   # whole video with the channel voice
  bun run tts --part 1                         # part 1 only
`);
}

export function printCostEstimate(targets: VOSection[], videoId: string) {
  console.log("\n=======================================================");
  console.log(`🎙️  LOCAL TTS ENGINE - ZERO COST PIPELINE [${videoId}]`);
  console.log("   Qwen3-TTS on Apple Silicon (MLX) | offline");
  console.log("=======================================================");

  const partsMap: Map<number, VOSection[]> = new Map();
  for (const sec of targets) {
    if (!partsMap.has(sec.part)) partsMap.set(sec.part, []);
    partsMap.get(sec.part)!.push(sec);
  }

  let totalChars = 0;

  for (const [partNum, sections] of partsMap.entries()) {
    const partTitle = sections[0]?.partTitle || `PART ${partNum}`;
    const partChars = sections.reduce((sum, s) => sum + s.text.length, 0);
    totalChars += partChars;

    console.log(`\n📂 ${partTitle} (${sections.length} section${sections.length > 1 ? "s" : ""})`);
    console.log("--------------------------------------------------------------------------------");

    sections.forEach((sec, idx) => {
      const paddedId = sec.id.padEnd(35, " ");
      console.log(`  [${String(idx + 1).padStart(2, "0")}] ${paddedId} ${String(sec.text.length).padStart(4, " ")} chars`);
    });

    console.log("--------------------------------------------------------------------------------");
    console.log(`  Subtotal Part ${partNum}:                        ${String(partChars).padStart(4, " ")} chars`);
  }

  console.log("\n=======================================================");
  console.log(`  Video Workspace:       ${videoId}`);
  console.log(`  Total Sections:        ${targets.length}`);
  console.log(`  Total Characters:      ${totalChars.toLocaleString()} chars`);
  console.log(`  Active Engine:         Qwen3-TTS (channel voice, offline)`);
  console.log(`  Estimated Actual Cost: none (offline)`);
  console.log("=======================================================\n");
}

export function printList(sections: VOSection[]) {
  console.log("\n=======================================================");
  console.log("       VOICEOVER SECTIONS");
  console.log("=======================================================\n");

  const parts = Array.from(new Set(sections.map((s) => s.part))).sort((a, b) => a - b);
  for (const partNum of parts) {
    const partSecs = sections.filter((s) => s.part === partNum);
    console.log(`\n📂 ${partSecs[0]?.partTitle || `PART ${partNum}`}`);
    console.log("--------------------------------------------------------------------------------");

    partSecs.forEach((sec, idx) => {
      console.log(`  [${idx + 1}] ID: ${sec.id}`);
      console.log(`      Clips:       ${sec.clips}`);
      console.log(`      Instruction: "${sec.rawInstruction}"`);
      console.log(`      Chars:       ${sec.text.length} chars`);
      console.log(`      Text:        "${sec.text.slice(0, 90)}..."`);
      console.log(`      Spoken:      "${normalizeForSpeech(sec.text).slice(0, 90)}..."\n`);
    });
  }
}

async function combineAudioFiles(filePaths: string[], outputPath: string) {
  if (filePaths.length === 0) return;
  try {
    const listFile = outputPath + ".list.txt";
    const listContent = filePaths.map((f) => `file '${path.resolve(f)}'`).join("\n");
    fs.writeFileSync(listFile, listContent);

    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    execSync(`ffmpeg -y -f concat -safe 0 -i "${listFile}" -c copy "${outputPath}"`, {
      stdio: "pipe",
    });

    if (fs.existsSync(listFile)) fs.unlinkSync(listFile);
    console.log(`  🔗 Combined track generated: ${path.relative(process.cwd(), outputPath)}`);
  } catch (err: any) {
    console.warn(`  ⚠️ Could not combine audio files with ffmpeg: ${err.message}`);
  }
}

// Transcribe the reference clip and compare with its configured text (WER > 0.1 => warn)
export function checkReference(pythonBin: string, refWav: string, refTxt: string, asrModel: string) {
  try {
    const out = execFileSync(
      pythonBin,
      [path.resolve(__dirname, "tts_best_of_n.py"), "--check-ref", refWav, "--ref-text-file", refTxt, "--asr-model", asrModel],
      { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }
    );
    const res = JSON.parse(out.trim().split("\n").pop()!);
    if (res.wer > 0.1) {
      console.warn(`  ⚠️ Reference transcript does not match the audio (WER ${(res.wer * 100).toFixed(1)}%). This degrades F5 cloning (Chatterbox ignores the transcript).`);
      console.warn(`     Heard:    "${res.heard}"`);
      console.warn(`     Expected: "${res.expected}"`);
    } else {
      console.log(`  ✓ Reference clip matches its transcript (WER ${(res.wer * 100).toFixed(1)}%)`);
    }
  } catch (err: any) {
    console.warn(`  ⚠️ Could not check reference clip: ${err.message}`);
  }
}

export async function runGenerate(options: GenerationOptions) {
  const ws = resolveWorkspace(options.video);
  const allSections = await loadSections(ws);

  if (options.listOnly) {
    printList(allSections);
    return;
  }

  // Filter sections
  let targets: VOSection[] = [];
  if (options.sectionId) {
    const match = allSections.find((s) => s.id.toLowerCase() === options.sectionId?.toLowerCase());
    if (!match) {
      console.error(`❌ Section with ID '${options.sectionId}' not found.`);
      console.log("Use --list to view all available section IDs.");
      process.exit(1);
    }
    targets = [match];
  } else if (options.part !== undefined) {
    targets = allSections.filter((s) => s.part === options.part);
    if (targets.length === 0) {
      console.error(`❌ No sections found for Part ${options.part}.`);
      process.exit(1);
    }
  } else {
    targets = allSections;
  }

  if (options.costOnly) {
    printCostEstimate(targets, ws.videoId);
    return;
  }

  const baseAudioDir = options.outputDir || ws.audioDir;

  const ttsModel = options.ttsModel || defaultEngine();
  const modelName = ENGINE_NAME[ttsModel];
  const cloud = ttsModel === "gemini";
  // the voice Qwen clones: --voice-profile, else the channel voice (voices/ACTIVE)
  const voice = cloud ? null : resolveVoice(options.voiceProfile);

  console.log("\n=======================================================");
  console.log(`🎙️  ${modelName.toUpperCase()} VOICEOVER`);
  console.log("=======================================================");
  console.log(`  Video Project:  ${ws.videoId}`);
  console.log(`  Engine:         ${modelName} (${cloud ? "Google cloud" : "local, Apple Silicon MLX"})`);
  console.log(`  Pace:           ${options.pace ?? 1}× , sentence gap ${options.sentenceGap ?? 0.6}s, section gap ${options.sectionGap ?? 0.9}s${options.chapterGap ? `, chapter gap ${options.chapterGap}s` : ""}`);
  if (cloud) {
    console.log(`  Voice:          ${options.voice || DEFAULT_GEMINI_VOICE} on ${options.geminiModel || "gemini-3.8-flash-tts"}`);
    console.log(`  Style:          ${options.style ?? DEFAULT_GEMINI_STYLE}`);
  } else {
    console.log(`  Voice:          ${voice!.name} (${path.relative(process.cwd(), voice!.refWav)})${options.temperature !== undefined ? `, temperature ${options.temperature}` : ""}`);
  }
  console.log(`  Target Count:   ${targets.length} VO section(s)`);
  console.log(`  Output Dir:     ${path.relative(process.cwd(), baseAudioDir)}`);
  console.log(`  Cost:           ${cloud ? geminiCost(targets, options.takes ?? 3) : "₹0.00 (Zero API Charges)"}`);
  if (options.dryRun) {
    console.log(`  Mode:           DRY RUN (Previewing manifest)`);
  }
  console.log("=======================================================\n");

  const takes = Math.max(1, options.takes ?? 3);
  const asrModel = options.asrModel || "small.en";
  // Reports sit beside the audio, so --out test runs never overwrite the workspace's reports
  const reportsDir = options.outputDir ? path.join(baseAudioDir, "reports") : path.resolve(ws.sectionsDir, "..", "reports");
  const pythonBin = findPython();
  if (cloud && options.acceptWer === undefined && takes > 1) console.log("  Takes stop early at WER <= 5%, so most sentences cost one call.\n");

  // Qwen clones from the clip and its transcript: a mismatched transcript degrades the clone
  if (options.checkRef && voice) {
    checkReference(pythonBin, voice.refWav, voice.refTxt, asrModel);
  }

  const manifestItems: Array<{
    id: string;
    text: string;
    outputPath: string;
    part: number;
    reportPath: string;
  }> = [];

  let skippedCount = 0;
  const generatedFilesByPart: Map<number, string[]> = new Map();
  const allGeneratedFiles: string[] = [];

  for (let i = 0; i < targets.length; i++) {
    const sec = targets[i];
    const partFolder = path.join(baseAudioDir, `part-${sec.part}`);
    if (!fs.existsSync(partFolder) && !options.dryRun) {
      fs.mkdirSync(partFolder, { recursive: true });
    }

    // Name by global section order so --part/--section runs match a full run's files
    const globalIdx = allSections.indexOf(sec);
    const fileName = `${String(globalIdx + 1).padStart(2, "0")}_${sec.id}.wav`;
    const filePath = path.join(partFolder, fileName);

    if (!generatedFilesByPart.has(sec.part)) {
      generatedFilesByPart.set(sec.part, []);
    }

    if (options.dryRun) {
      console.log(`[${i + 1}/${targets.length}] Part ${sec.part}: ${sec.id}`);
      console.log(`    Clips:       ${sec.clips}`);
      console.log(`    Instruction: "${sec.rawInstruction}"`);
      console.log(`    Text:        "${sec.text.slice(0, 80)}..."`);
      console.log(`    Spoken:      "${normalizeForSpeech(sec.text).slice(0, 80)}..."`);
      console.log(`    Output:      ${path.relative(process.cwd(), filePath)}`);
      console.log(`    [DRY RUN] Would synthesize ${sec.text.length} chars (₹0.00).\n`);
      continue;
    }

    if (fs.existsSync(filePath) && !options.forceOverwrite) {
      console.log(`[${i + 1}/${targets.length}] ⏩ Cached: ${sec.id} (${path.basename(filePath)})`);
      skippedCount++;
      generatedFilesByPart.get(sec.part)!.push(filePath);
      allGeneratedFiles.push(filePath);
      continue;
    }

    manifestItems.push({
      id: sec.id,
      text: normalizeForSpeech(sec.text, { keepDashes: cloud, keepTags: cloud }),
      outputPath: filePath,
      part: sec.part,
      reportPath: path.join(reportsDir, `${path.basename(filePath, ".wav")}.json`),
    });
    generatedFilesByPart.get(sec.part)!.push(filePath);
    allGeneratedFiles.push(filePath);
  }

  if (options.dryRun) {
    console.log("=======================================================");
    console.log("                    DRY RUN COMPLETE");
    console.log("=======================================================");
    console.log(`  Total Sections:   ${targets.length}`);
    console.log(`  Estimated Cost:   ${cloud ? geminiCost(targets, options.takes ?? 3) : `₹0.00 (Local ${modelName})`}`);
    console.log("=======================================================\n");
    return;
  }

  if (manifestItems.length > 0) {
    console.log(`\n⏳ Synthesizing ${manifestItems.length} section(s) with ${cloud ? "" : "local "}${modelName} (${takes} take${takes > 1 ? "s" : ""} per chunk${takes > 1 ? `, scored by ${asrModel}` : ""})...`);
    const refText = voice ? fs.readFileSync(voice.refTxt, "utf-8").trim() : "";
    const batchScript = path.resolve(__dirname, "tts_best_of_n.py");
    let totalFlagged = 0;
    const reportPaths: string[] = [];

    // One job for every section: the TTS and ASR models load once, not once per section.
    // A chunk is a passage of whole sentences (PASSAGE_CHARS), so the model phrases them together and places its own
    // pauses; passages of one long section are joined with the passage gap. Each section ends with the section gap;
    // the last section of a part gets the chapter gap.
    const sectionGapMs = Math.round((options.sectionGap ?? 0.9) * 1000);
    const chapterGapMs = Math.round((options.chapterGap ?? 0) * 1000);
    const items = manifestItems.map((item) => {
      const pieces = chunkText(item.text, PASSAGE_CHARS[ttsModel]);
      const idx = allSections.findIndex((s) => s.id === item.id);
      const next = allSections[idx + 1];
      // the pause before a chapter: script chapters always get one (default 2.5 s), plain parts only with --chapter-gap
      const chapterEnd = next !== undefined && next.part !== item.part && (next.chapterTitle !== undefined || chapterGapMs > 0);
      // the section's tone note picks a mood clip of the same voice (falls back to the main reference)
      const sec = allSections[idx];
      const mood = voice && !options.noMoods ? moodFor(sec?.rawInstruction) : "neutral";
      const moodWav = voice && mood !== "neutral" ? path.join(voice.dir, "emotions", `${mood}.wav`) : "";
      const hasMood = !!moodWav && fs.existsSync(moodWav);
      return {
        id: item.id,
        mood: hasMood ? mood : "neutral",
        ...(cloud ? { style: sectionStyle(options.style ?? DEFAULT_GEMINI_STYLE, sec?.rawInstruction) } : {}),
        ...(hasMood ? { ref_audio: moodWav, ref_text: fs.readFileSync(moodWav.replace(/\.wav$/, ".txt"), "utf-8").trim() } : {}),
        chunks: pieces.map((text, ci) => ({ id: `${item.id}_c${String(ci + 1).padStart(2, "0")}`, text })),
        out_path: item.outputPath,
        report_path: item.reportPath,
        tail_ms: next === undefined ? 0 : chapterEnd ? (chapterGapMs || 2500) : sectionGapMs,
      };
    });
    const job = {
      engine: ttsModel,
      pace: options.pace ?? 1.0,
      temperature: options.temperature,
      ref_audio: voice?.refWav,
      ref_text: refText,
      voice_name: voice?.name ?? options.voice ?? DEFAULT_GEMINI_VOICE,
      takes,
      accept_wer: options.acceptWer ?? 0.08,
      asr_model: asrModel,
      pause_ms: options.pauseMs ?? Math.round((options.sentenceGap ?? 0.45) * 1000),
      voice: options.voice || DEFAULT_GEMINI_VOICE,
      parallel: options.parallel ?? 4,
      style: options.style ?? DEFAULT_GEMINI_STYLE,
      gemini_model: options.geminiModel || "gemini-3.8-flash-tts",
      items,
    };
    const jobPath = path.join(os.tmpdir(), `wg_tts_job_${process.pid}.json`);
    fs.writeFileSync(jobPath, JSON.stringify(job, null, 2), "utf-8");
    console.log(`  ${items.length} section(s), ${items.reduce((n, it) => n + it.chunks.length, 0)} chunk(s)`);
    try {
      execFileSync(pythonBin, [batchScript, "--job", jobPath], {
        stdio: ["ignore", "inherit", "inherit"],
        env: { ...process.env, TQDM_DISABLE: "1", TRANSFORMERS_VERBOSITY: "error", PYTHONWARNINGS: "ignore" },
      });
    } finally {
      if (fs.existsSync(jobPath)) fs.unlinkSync(jobPath);
    }

    for (const item of manifestItems) {
      const report = JSON.parse(fs.readFileSync(item.reportPath, "utf-8"));
      const flagged = report.chunks.filter((c: any) => c.flagged).length;
      const meanWer = report.chunks.reduce((sum: number, c: any) => sum + c.chosenWer, 0) / report.chunks.length;
      const takesUsed = report.chunks.reduce((sum: number, c: any) => sum + (c.takesUsed ?? 1), 0);
      const werStr = takes > 1 ? `${(meanWer * 100).toFixed(1)}%` : "n/a (--takes 1)";
      console.log(`    ✓ ${path.basename(item.outputPath)}: ${report.chunks.length} chunks, ${flagged} flagged, mean WER ${werStr}, ${takesUsed}/${report.chunks.length * takes} takes used`);
      totalFlagged += flagged;
      reportPaths.push(item.reportPath);
    }

    console.log(`\n  Flagged chunks (WER > 15%): ${totalFlagged}`);
    console.log(`  Reports:`);
    for (const rp of reportPaths) console.log(`    ${path.relative(process.cwd(), rp)}`);
  } else {
    console.log(`\n✨ All ${targets.length} audio sections already exist on disk. Use --force to regenerate.`);
  }

  // the voice step's "done" marker (dashboard status; Align → Speed & gaps builds the combined file from the sections)
  if (!options.outputDir) {
    fs.writeFileSync(path.join(baseAudioDir, "voice.json"), JSON.stringify({ engine: ttsModel, voice: cloud ? (options.voice || DEFAULT_GEMINI_VOICE) : voice?.name, sections: targets.length, generated: manifestItems.length, at: new Date().toISOString() }, null, 2));
  }

  // Concatenation (CLI --combine; the dashboard combines in Align → Speed & gaps)
  if (options.combinePart) {
    console.log("\n🔗 Combining audio tracks...");
    const combinedDir = path.join(baseAudioDir, "combined");
    if (!fs.existsSync(combinedDir)) fs.mkdirSync(combinedDir, { recursive: true });

    for (const [partNum, files] of generatedFilesByPart.entries()) {
      if (files.length > 0) {
        const partOutputFile = path.join(combinedDir, `part_${partNum}_combined.wav`);
        await combineAudioFiles(files, partOutputFile);
      }
    }

    if (options.combineAll && allGeneratedFiles.length > 0) {
      const fullOutputFile = path.join(combinedDir, `full_voiceover.wav`);
      await combineAudioFiles(allGeneratedFiles, fullOutputFile);
    }
  }

  console.log("\n=======================================================");
  console.log("                    SUMMARY");
  console.log("=======================================================");
  console.log(`  Video Workspace:       ${ws.videoId}`);
  console.log(`  Engine:                ${cloud ? `${modelName} (cloud, voice ${options.voice || DEFAULT_GEMINI_VOICE})` : `Local ${modelName} (Cloned Voice)`}`);
  console.log(`  Total Sections:        ${targets.length}`);
  console.log(`  Newly Generated:       ${manifestItems.length}`);
  console.log(`  Skipped (Cached):      ${skippedCount}`);
  console.log(`  Total Incurred Cost:   ${cloud ? `${geminiCost(manifestItems.length ? targets.filter((t) => manifestItems.some((m) => m.id === t.id)) : [], options.takes ?? 3)} (estimate)` : "₹0.00 (Offline, Free)"}`);
  console.log("=======================================================\n");
}
