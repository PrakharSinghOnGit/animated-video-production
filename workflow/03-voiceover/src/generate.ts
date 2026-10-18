import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { CONFIG } from "./config";
import { SarvamClient } from "./sarvam_client";
import { resolveWorkspace, loadSections, listAvailableVideos } from "./workspace";
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
🎙️  03-Voiceover: Sarvam Bulbul v4 Flash Audio Generator

Usage:
  bun run 03-voiceover/run.ts [options]
  bun run tts [options]

Options:
  --help, -h               Show this help message
  --video <id>             Target video workspace (e.g. --video VID01_Currency_Market)
  --scale, -m <0.0-1.0>    Master expression scaling (0.0 = neutral, 1.0 = full set, default: 0.3)
  --pitch-scale <0.0-1.0>  Pitch variation scaling (e.g. 0.0 to disable pitch modulation)
  --pace-scale <0.0-1.0>   Pace variation scaling
  --loudness-scale <0.0-1.0> Loudness variation scaling
  --cost, -e               Estimate character count and cost (₹1 / 1,000 chars)
  --list, -l               List all script sections, expressions, and prosody
  --dry-run, -d            Preview voice settings and character counts without calling API
  --part, -p <number>      Generate audio for a specific part only (e.g. --part 1)
  --section, -s <id>       Generate audio for a specific section ID (e.g. --section part1_01_shadow_market)
  --speaker <persona>      Override speaker persona (e.g. --speaker varun_en_suspense)
  --rate <hz>              Override sample rate (8000, 16000, 22050, 24000, 44100, 48000)
  --codec <wav|mp3>        Set output audio codec (default: wav)
  --force, -f              Overwrite existing audio files
  --combine, -c            Combine generated clips into single tracks per part and full script (requires ffmpeg)
  --api-key <key>          Override SARVAM_API_KEY from command line

Examples:
  bun run tts --cost
  bun run tts --video VID01_Currency_Market --dry-run
  bun run tts --part 1 --scale 0.3
  bun run tts --section part1_01_shadow_market --force
  bun run tts --combine
`);
}

export function printCostEstimate(targets: VOSection[], videoId: string) {
  console.log("\n=======================================================");
  console.log(`💰 SARVAM BULBUL v4 FLASH - COST ESTIMATE [${videoId}]`);
  console.log("   Rate: ₹1.00 per 1,000 characters (₹0.001 / char)");
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
      const cost = formatCost(charCount);
      const paddedId = sec.id.padEnd(35, " ");
      console.log(`  [${String(idx + 1).padStart(2, "0")}] ${paddedId} ${String(charCount).padStart(4, " ")} chars  ->  ${cost}`);
    });

    console.log("--------------------------------------------------------------------------------");
    console.log(`  Subtotal Part ${partNum}:                        ${String(partChars).padStart(4, " ")} chars  ->  ${formatCost(partChars)}`);
  }

  const grandTotalCost = formatCost(totalChars);

  console.log("\n=======================================================");
  console.log("📊 GRAND TOTAL COST ESTIMATE");
  console.log("=======================================================");
  console.log(`  Video Workspace:       ${videoId}`);
  console.log(`  Total Sections:        ${targets.length}`);
  console.log(`  Total Characters:      ${totalChars.toLocaleString()} chars`);
  console.log(`  Estimated Total Cost:  ${grandTotalCost} INR`);
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
      console.log(`      Text:        "${sec.text.slice(0, 90)}..."\n`);
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

  if (options.costOnly) {
    printCostEstimate(targets, ws.videoId);
    return;
  }

  const baseAudioDir = options.outputDir || ws.audioDir;
  const codec = options.codec || CONFIG.defaultCodec;
  const sampleRate = options.sampleRate || CONFIG.defaultSampleRate;
  const globalSpeaker = options.speakerOverride || CONFIG.defaultSpeaker;

  const effectiveScale = options.expressionScale !== undefined ? options.expressionScale : CONFIG.expressionScale;
  const effectivePaceScale = options.paceScale !== undefined ? options.paceScale : (CONFIG.paceScale !== undefined ? CONFIG.paceScale : effectiveScale);
  const effectivePitchScale = options.pitchScale !== undefined ? options.pitchScale : (CONFIG.pitchScale !== undefined ? CONFIG.pitchScale : effectiveScale);
  const effectiveLoudnessScale = options.loudnessScale !== undefined ? options.loudnessScale : (CONFIG.loudnessScale !== undefined ? CONFIG.loudnessScale : effectiveScale);

  console.log("\n=======================================================");
  console.log("🎙️  SARVAM BULBUL v4 FLASH - TTS AUDIO GENERATOR");
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
    const fileName = `${String(i + 1).padStart(2, "0")}_${sec.id}.${codec}`;
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
        text: sec.text,
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
