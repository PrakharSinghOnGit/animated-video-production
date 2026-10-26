import fs from "fs";
import path from "path";
import os from "os";
import { execSync, execFileSync } from "child_process";
import { CONFIG } from "./config";
import { SarvamClient } from "./sarvam_client";
import { resolveWorkspace, loadSections, listAvailableVideos } from "./workspace";
import { setupVoiceProfile, findPython } from "./voice_profile";
import { normalizeForSpeech } from "./normalize";
import { chunkText } from "./chunk";
import type { GenerationOptions, VOSection } from "./types";

const COST_PER_1K_CHARS_INR = 1.0;

export function formatCost(charCount: number): string {
  const cost = (charCount / 1000) * COST_PER_1K_CHARS_INR;
  return `₹${cost.toFixed(2)}`;
}

export function scaleProsody(
  base: { pace: number; pitch: number; loudness: number },
  scales: { master?: number; pace?: number; pitch?: number; loudness?: number }
): { pace: number; pitch: number; loudness: number } {
  const m = scales.master !== undefined ? scales.master : CONFIG.expressionScale;
  const paceM = scales.pace !== undefined ? scales.pace : (CONFIG.paceScale !== undefined ? CONFIG.paceScale : m);
  const pitchM = scales.pitch !== undefined ? scales.pitch : (CONFIG.pitchScale !== undefined ? CONFIG.pitchScale : m);
  const loudnessM = scales.loudness !== undefined ? scales.loudness : (CONFIG.loudnessScale !== undefined ? CONFIG.loudnessScale : m);

  // Neutral baselines: pace = 1.0, pitch = 0.0, loudness = 1.0
  const pace = Number((1.0 + (base.pace - 1.0) * paceM).toFixed(3));
  const pitch = Number((0.0 + (base.pitch - 0.0) * pitchM).toFixed(3));
  const loudness = Number((1.0 + (base.loudness - 1.0) * loudnessM).toFixed(3));

  return { pace, pitch, loudness };
}

export function printHelp() {
  console.log(`
🎙️  03-Voiceover: Dual-Engine Audio Generator
   • Default: Local Chatterbox Cloned Voice (100% Offline, Apple Silicon GPU, ₹0.00)
   • Cloud:   Sarvam Bulbul v4 Flash API (--cloud / --sarvam)

Usage:
  bun run workflow/03-voiceover/run.ts [options]
  bun run tts [options]

Engine Options:
  --local, --chatterbox    Use local Chatterbox voice cloning (DEFAULT)
  --f5                     Use local F5-TTS instead (legacy; flatter pacing)
  --exaggeration <x>       Chatterbox emotion intensity (default 0.5; 0.6-0.8 = more energetic)
  --cfg <x>                Chatterbox pacing guidance (default 0.5; 0.3 = slower, more deliberate)
  --temperature <x>        Chatterbox sampling temperature (default 0.8)
  --pace <x>               Tempo of the chosen take, pitch kept (default 0.9 for Chatterbox; 1 = as generated)
  --pause-ms <n>           Pause between sentences (default 350 for Chatterbox)
  --cloud, --sarvam        Use Sarvam Bulbul v4 Flash Cloud API

Voice Profile Options:
  bun run voice:setup      Initialize cloned voice profile (workflow/03-voiceover/voice_profile)
  bun run voice:remake     Re-clone voice from voice_to_clone.wav & prompt

Target Options:
  --video <id>             Target video workspace (e.g. --video VID01_Currency_Market)
  --part, -p <number>      Generate audio for a specific part only (e.g. --part 1)
  --section, -s <id>       Generate audio for a specific section ID (e.g. --section part1_01_beat)
  --cost, -e               Estimate character count and cost
  --list, -l               List all script sections, expressions, and prosody
  --dry-run, -d            Preview voice settings and paths without generating audio
  --force, -f              Overwrite existing audio files
  --takes <n>              Local: takes per sentence chunk, best one picked by ASR score (default 3; 1 = fast, no ASR)
  --accept-wer <0-1>       Local: keep the first take scoring <= this, else try more seeds up to --takes (default 0.05)
  --asr-model <name>       Local: faster-whisper model that scores takes (default small.en)
  --check-ref              Local: verify the reference clip matches its transcript before synthesizing
  --combine, -c            Combine generated clips into single tracks per part and full script (ffmpeg)

Prosody / Cloud Tuning:
  --scale, -m <0.0-1.0>    Master expression scaling (default: 0.3 for cloud, 1.0 for local)
  --speaker <persona>      Override Sarvam speaker persona (e.g. --speaker varun_en_suspense)
  --rate <hz>              Override sample rate (8000, 16000, 24000, 48000)
  --codec <wav|mp3>        Set output audio codec (default: wav)

Examples:
  bun run tts                              # Generate entire video using local Chatterbox
  bun run tts --part 1                     # Generate part 1 only
  bun run tts --dry-run                    # Preview settings offline
  bun run tts --cloud                      # Fall back to Sarvam Cloud API
  bun run tts --combine                    # Synthesize and combine parts
`);
}

export function printCostEstimate(targets: VOSection[], videoId: string, engine: "local" | "cloud" = "local") {
  console.log("\n=======================================================");
  if (engine === "local") {
    console.log(`🎙️  LOCAL TTS ENGINE - ZERO COST PIPELINE [${videoId}]`);
    console.log("   Hardware: Apple Silicon GPU (MPS) | 100% Offline");
    console.log("   Rate:     ₹0.00 (Zero API Charges)");
  } else {
    console.log(`💰 SARVAM BULBUL v4 FLASH - CLOUD COST ESTIMATE [${videoId}]`);
    console.log("   Rate: ₹1.00 per 1,000 characters (₹0.001 / char)");
  }
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
      const charCount = sec.text.length;
      const cloudCost = formatCost(charCount);
      const costStr = engine === "local" ? "₹0.00 (Local)" : cloudCost;
      const paddedId = sec.id.padEnd(35, " ");
      console.log(`  [${String(idx + 1).padStart(2, "0")}] ${paddedId} ${String(charCount).padStart(4, " ")} chars  ->  ${costStr}`);
    });

    console.log("--------------------------------------------------------------------------------");
    const subCostStr = engine === "local" ? "₹0.00 (Local)" : formatCost(partChars);
    console.log(`  Subtotal Part ${partNum}:                        ${String(partChars).padStart(4, " ")} chars  ->  ${subCostStr}`);
  }

  const grandTotalCost = formatCost(totalChars);

  console.log("\n=======================================================");
  console.log("📊 GRAND TOTAL COST ESTIMATE");
  console.log("=======================================================");
  console.log(`  Video Workspace:       ${videoId}`);
  console.log(`  Total Sections:        ${targets.length}`);
  console.log(`  Total Characters:      ${totalChars.toLocaleString()} chars`);
  if (engine === "local") {
    console.log(`  Active Engine:         Local Chatterbox / F5-TTS (Cloned Voice, Offline)`);
    console.log(`  Estimated Actual Cost: ₹0.00 INR (100% Free)`);
    console.log(`  Cloud Fallback Cost:   ${grandTotalCost} INR (if run with --cloud)`);
  } else {
    console.log(`  Active Engine:         Sarvam Bulbul v4 Flash (Cloud API)`);
    console.log(`  Estimated Total Cost:  ${grandTotalCost} INR`);
  }
  console.log("=======================================================\n");
}

export function printList(sections: VOSection[], options?: GenerationOptions) {
  const masterScale = options?.expressionScale !== undefined ? options.expressionScale : CONFIG.expressionScale;
  console.log("\n=======================================================");
  console.log("       VOICEOVER SECTIONS & EXPRESSION PROSODY");
  console.log(`       Expression Scaling: ${(masterScale * 100).toFixed(0)}% (0% = neutral, 100% = full)`);
  console.log("=======================================================\n");

  const parts = Array.from(new Set(sections.map((s) => s.part))).sort((a, b) => a - b);
  for (const partNum of parts) {
    const partSecs = sections.filter((s) => s.part === partNum);
    console.log(`\n📂 ${partSecs[0]?.partTitle || `PART ${partNum}`}`);
    console.log("--------------------------------------------------------------------------------");

    partSecs.forEach((sec, idx) => {
      const speaker = sec.speaker || CONFIG.defaultSpeaker;
      const charCount = sec.text.length;
      const cost = formatCost(charCount);
      const scaled = scaleProsody(
        { pace: sec.pace, pitch: sec.pitch, loudness: sec.loudness },
        {
          master: options?.expressionScale,
          pace: options?.paceScale,
          pitch: options?.pitchScale,
          loudness: options?.loudnessScale,
        }
      );

      console.log(`  [${idx + 1}] ID: ${sec.id}`);
      console.log(`      Clips:       ${sec.clips}`);
      console.log(`      Instruction: "${sec.rawInstruction}"`);
      console.log(
        `      Prosody:     Speaker: ${speaker} | Pace: ${scaled.pace} | Pitch: ${scaled.pitch} | Loudness: ${scaled.loudness} (scaled ${(masterScale * 100).toFixed(0)}%)`
      );
      console.log(`      Chars:       ${charCount} chars (~${cost})`);
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
    printList(allSections, options);
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

  const engine = options.engine || "local";

  if (options.costOnly) {
    printCostEstimate(targets, ws.videoId, engine);
    return;
  }

  const baseAudioDir = options.outputDir || ws.audioDir;
  const codec = options.codec || (engine === "local" ? "wav" : CONFIG.defaultCodec);

  // -------------------------------------------------------------
  // ENGINE 1: LOCAL VOICE CLONING: CHATTERBOX (DEFAULT) OR F5-TTS, 100% OFFLINE
  // -------------------------------------------------------------
  if (engine === "local") {
    const profile = setupVoiceProfile(options.remakeVoice || false);
    const ttsModel = options.ttsModel || "chatterbox";
    const modelName = ttsModel === "f5" ? "F5-TTS" : "Chatterbox";

    console.log("\n=======================================================");
    console.log(`🎙️  LOCAL ${modelName.toUpperCase()} - CLONED VOICEOVER GENERATOR`);
    console.log("=======================================================");
    console.log(`  Video Project:  ${ws.videoId}`);
    console.log(`  Engine:         ${modelName} (Offline, Apple Silicon Metal MPS)`);
    if (ttsModel === "chatterbox") {
      console.log(`  Pace:           ${options.pace ?? 0.9}× , ${options.pauseMs ?? 350} ms between sentences`);
      console.log(`  Expression:     exaggeration ${options.exaggeration ?? 0.5}, cfg ${options.cfgWeight ?? 0.5}, temperature ${options.temperature ?? 0.8}`);
    }
    console.log(`  Voice Profile:  ${path.relative(process.cwd(), profile.profileDir)}`);
    console.log(`  Target Count:   ${targets.length} VO section(s)`);
    console.log(`  Output Dir:     ${path.relative(process.cwd(), baseAudioDir)}`);
    console.log(`  Cost:           ₹0.00 (Zero API Charges)`);
    if (options.dryRun) {
      console.log(`  Mode:           DRY RUN (Previewing manifest)`);
    }
    console.log("=======================================================\n");

    const takes = Math.max(1, options.takes ?? 3);
    const asrModel = options.asrModel || "small.en";
    // Reports sit beside the audio, so --out test runs never overwrite the workspace's reports
    const reportsDir = options.outputDir ? path.join(baseAudioDir, "reports") : path.resolve(ws.sectionsDir, "..", "reports");
    const pythonBin = findPython(ttsModel);

    // Mismatched reference text degrades F5 cloning, so verify it when asked
    if (options.checkRef) {
      checkReference(pythonBin, profile.refWav, profile.refTxt, asrModel);
    }

    const manifestItems: Array<{
      id: string;
      text: string;
      speed: number;
      outputPath: string;
      part: number;
      reportPath: string;
    }> = [];

    let skippedCount = 0;
    const generatedFilesByPart: Map<number, string[]> = new Map();
    const allGeneratedFiles: string[] = [];
    const effectiveScale = options.expressionScale !== undefined ? options.expressionScale : 1.0;

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
      const baseSpeed = sec.speed || 1.0;
      const speed = Number((1.0 + (baseSpeed - 1.0) * effectiveScale).toFixed(2));

      if (!generatedFilesByPart.has(sec.part)) {
        generatedFilesByPart.set(sec.part, []);
      }

      if (options.dryRun) {
        console.log(`[${i + 1}/${targets.length}] Part ${sec.part}: ${sec.id}`);
        console.log(`    Clips:       ${sec.clips}`);
        console.log(`    Instruction: "${sec.rawInstruction}"`);
        console.log(`    Settings:    Speed: ${speed} (scaled ${(effectiveScale * 100).toFixed(0)}%) | Rate: 24kHz Mono PCM`);
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
        text: normalizeForSpeech(sec.text),
        speed,
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
      console.log(`  Estimated Cost:   ₹0.00 (Local ${modelName})`);
      console.log("=======================================================\n");
      return;
    }

    if (manifestItems.length > 0) {
      console.log(`\n⏳ Synthesizing ${manifestItems.length} section(s) with local ${modelName} (${takes} take${takes > 1 ? "s" : ""} per chunk${takes > 1 ? `, scored by ${asrModel}` : ""})...`);
      const refText = fs.readFileSync(profile.refTxt, "utf-8").trim();
      const batchScript = path.resolve(__dirname, "tts_best_of_n.py");
      let totalFlagged = 0;
      const reportPaths: string[] = [];

      // One job for every section: the TTS and ASR models load once, not once per section
      const items = manifestItems.map((item) => ({
        id: item.id,
        speed: item.speed,
        chunks: chunkText(item.text).map((text, ci) => ({ id: `${item.id}_c${String(ci + 1).padStart(2, "0")}`, text })),
        out_path: item.outputPath,
        report_path: item.reportPath,
      }));
      const job = {
        engine: ttsModel,
        // Chatterbox has no speed control and reads fast; slow it slightly after picking the take
        pace: options.pace ?? (ttsModel === "chatterbox" ? 0.9 : 1.0),
        exaggeration: options.exaggeration ?? 0.5,
        cfg_weight: options.cfgWeight ?? 0.5,
        temperature: options.temperature ?? 0.8,
        ref_audio: profile.refWav,
        ref_text: refText,
        takes,
        accept_wer: options.acceptWer ?? 0.05,
        asr_model: asrModel,
        pause_ms: options.pauseMs ?? (ttsModel === "chatterbox" ? 350 : 250),
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

    // Concatenation
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
    console.log(`  Engine:                Local ${modelName} (Cloned Voice)`);
    console.log(`  Total Sections:        ${targets.length}`);
    console.log(`  Newly Generated:       ${manifestItems.length}`);
    console.log(`  Skipped (Cached):      ${skippedCount}`);
    console.log(`  Total Incurred Cost:   ₹0.00 (Offline, Free)`);
    console.log("=======================================================\n");
    return;
  }

  // -------------------------------------------------------------
  // ENGINE 2: CLOUD SARVAM BULBUL v4 FLASH (OPTIONAL --cloud)
  // -------------------------------------------------------------
  const sampleRate = options.sampleRate || CONFIG.defaultSampleRate;
  const globalSpeaker = options.speakerOverride || CONFIG.defaultSpeaker;

  const effectiveScale = options.expressionScale !== undefined ? options.expressionScale : CONFIG.expressionScale;
  const effectivePaceScale = options.paceScale !== undefined ? options.paceScale : (CONFIG.paceScale !== undefined ? CONFIG.paceScale : effectiveScale);
  const effectivePitchScale = options.pitchScale !== undefined ? options.pitchScale : (CONFIG.pitchScale !== undefined ? CONFIG.pitchScale : effectiveScale);
  const effectiveLoudnessScale = options.loudnessScale !== undefined ? options.loudnessScale : (CONFIG.loudnessScale !== undefined ? CONFIG.loudnessScale : effectiveScale);

  console.log("\n=======================================================");
  console.log("🎙️  SARVAM BULBUL v4 FLASH - CLOUD TTS GENERATOR");
  console.log("=======================================================");
  console.log(`  Video Project: ${ws.videoId}`);
  console.log(`  Model:         ${CONFIG.model}`);
  console.log(`  Language:      ${CONFIG.languageCode}`);
  console.log(`  Default Voice: ${globalSpeaker}`);
  console.log(`  Sample Rate:   ${sampleRate} Hz`);
  console.log(`  Codec:         ${codec.toUpperCase()}`);
  console.log(`  Expr Scale:    ${(effectiveScale * 100).toFixed(0)}% (Pace: ${(effectivePaceScale * 100).toFixed(0)}%, Pitch: ${(effectivePitchScale * 100).toFixed(0)}%, Loud: ${(effectiveLoudnessScale * 100).toFixed(0)}%)`);
  console.log(`  Target Count:  ${targets.length} VO section(s)`);
  console.log(`  Output Dir:    ${path.relative(process.cwd(), baseAudioDir)}`);
  if (options.dryRun) {
    console.log(`  Mode:          DRY RUN (No API calls will be made)`);
  }
  console.log("=======================================================\n");

  const client = new SarvamClient(options.apiKey);

  let successCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  let newlyGeneratedChars = 0;
  let skippedChars = 0;
  const generatedFilesByPart: Map<number, string[]> = new Map();
  const allGeneratedFiles: string[] = [];

  for (let i = 0; i < targets.length; i++) {
    const sec = targets[i];
    const partFolder = path.join(baseAudioDir, `part-${sec.part}`);
    if (!fs.existsSync(partFolder) && !options.dryRun) {
      fs.mkdirSync(partFolder, { recursive: true });
    }

    const speaker = options.speakerOverride || sec.speaker || globalSpeaker;
    const fileName = `${String(allSections.indexOf(sec) + 1).padStart(2, "0")}_${sec.id}.${codec}`;
    const filePath = path.join(partFolder, fileName);
    const charCost = formatCost(sec.text.length);

    const scaled = scaleProsody(
      { pace: sec.pace, pitch: sec.pitch, loudness: sec.loudness },
      {
        master: options.expressionScale,
        pace: options.paceScale,
        pitch: options.pitchScale,
        loudness: options.loudnessScale,
      }
    );

    console.log(`[${i + 1}/${targets.length}] Part ${sec.part}: ${sec.id}`);
    console.log(`    Clips:       ${sec.clips}`);
    console.log(`    Instruction: "${sec.rawInstruction}"`);
    console.log(
      `    Prosody:     Speaker: ${speaker} | Pace: ${scaled.pace} | Pitch: ${scaled.pitch} | Loudness: ${scaled.loudness} (scaled ${(effectiveScale * 100).toFixed(0)}%)`
    );
    console.log(`    Text:        "${sec.text.slice(0, 80)}..."`);
    console.log(`    Spoken:      "${normalizeForSpeech(sec.text).slice(0, 80)}..."`);
    console.log(`    Output:      ${path.relative(process.cwd(), filePath)}`);

    if (!generatedFilesByPart.has(sec.part)) {
      generatedFilesByPart.set(sec.part, []);
    }

    if (options.dryRun) {
      console.log(`    [DRY RUN] Would synthesize ${sec.text.length} characters (~${charCost}).\n`);
      continue;
    }

    if (fs.existsSync(filePath) && !options.forceOverwrite) {
      console.log(`    ⏩ Skipping: File already exists. (${sec.text.length} chars -> ${charCost} saved)\n`);
      skippedCount++;
      skippedChars += sec.text.length;
      generatedFilesByPart.get(sec.part)!.push(filePath);
      allGeneratedFiles.push(filePath);
      continue;
    }

    try {
      const startTime = Date.now();
      process.stdout.write(`    ⏳ Generating audio with Sarvam Bulbul v4 Flash... `);

      const audioBuffer = await client.synthesize({
        text: normalizeForSpeech(sec.text),
        speaker,
        pace: scaled.pace,
        pitch: scaled.pitch,
        loudness: scaled.loudness,
        speechSampleRate: sampleRate,
        outputAudioCodec: codec as any,
      });

      fs.writeFileSync(filePath, audioBuffer);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      const sizeKb = (audioBuffer.length / 1024).toFixed(1);

      console.log(`✅ Done in ${elapsed}s (${sizeKb} KB | ~${charCost})\n`);
      successCount++;
      newlyGeneratedChars += sec.text.length;
      generatedFilesByPart.get(sec.part)!.push(filePath);
      allGeneratedFiles.push(filePath);
    } catch (err: any) {
      console.log(`❌ Failed: ${err.message}\n`);
      errorCount++;
    }
  }

  console.log("=======================================================");
  console.log("                    SUMMARY");
  console.log("=======================================================");
  console.log(`  Video Workspace:       ${ws.videoId}`);
  console.log(`  Total Sections:        ${targets.length}`);
  if (options.dryRun) {
    const totalTargetChars = targets.reduce((sum, s) => sum + s.text.length, 0);
    console.log(`  Total Characters:      ${totalTargetChars.toLocaleString()} chars`);
    console.log(`  Estimated Total Cost:  ${formatCost(totalTargetChars)} INR (Rate: ₹1.00 / 1k chars)`);
  } else {
    console.log(`  Newly Generated:       ${successCount} (${newlyGeneratedChars.toLocaleString()} chars -> ${formatCost(newlyGeneratedChars)})`);
    console.log(`  Skipped (Existed):     ${skippedCount} (${skippedChars.toLocaleString()} chars -> ${formatCost(skippedChars)} saved)`);
    console.log(`  Errors:                ${errorCount}`);
    console.log(`  Total Cost Incurred:   ${formatCost(newlyGeneratedChars)} INR`);
    console.log(`  Full Script Value:     ${formatCost(newlyGeneratedChars + skippedChars)} INR`);
  }

  // Concatenation
  if (options.combinePart && !options.dryRun) {
    console.log("\n🔗 Combining audio tracks...");
    const combinedDir = path.join(baseAudioDir, "combined");
    if (!fs.existsSync(combinedDir)) fs.mkdirSync(combinedDir, { recursive: true });

    for (const [partNum, files] of generatedFilesByPart.entries()) {
      if (files.length > 0) {
        const partOutputFile = path.join(combinedDir, `part_${partNum}_combined.${codec}`);
        await combineAudioFiles(files, partOutputFile);
      }
    }

    if (options.combineAll && allGeneratedFiles.length > 0) {
      const fullOutputFile = path.join(combinedDir, `full_voiceover.${codec}`);
      await combineAudioFiles(allGeneratedFiles, fullOutputFile);
    }
  }

  console.log("=======================================================\n");
}
