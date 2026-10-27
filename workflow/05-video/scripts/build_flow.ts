import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import readline from "node:readline";
import { resolveJobPaths } from "../src/lib/workspaceBridge";
import { recordTiming, formatDuration } from "../src/lib/timings";

async function askConfirmation(query: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`\n${query} [Y/n]: `, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      resolve(trimmed === "" || trimmed === "y" || trimmed === "yes");
    });
  });
}

let timingDir = "";

function runStep(title: string, cmd: string) {
  console.log(`\n========================================`);
  console.log(`▶ ${title}`);
  console.log(`  $ ${cmd}`);
  console.log(`========================================`);
  const t0 = Date.now();
  execSync(cmd, { stdio: "inherit" });
  const ms = Date.now() - t0;
  if (timingDir) recordTiming(timingDir, { step: title.replace(/^\d+\.\s*/, ""), ms });
  console.log(`⏱  ${title}: ${formatDuration(ms)}`);
}

async function main() {
  const args = process.argv.slice(2);
  let target: string | undefined;
  const yesMode = args.includes("--yes") || args.includes("-y");
  const isDraftOnly = args.includes("--draft");

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--video" || args[i] === "-v") {
      target = args[i + 1];
      i++;
    } else if (!args[i].startsWith("-")) {
      if (!target) target = args[i];
    }
  }

  const effectiveTarget = target || process.env.ACTIVE_VIDEO || "VID01_Currency_Market";
  const paths = resolveJobPaths(effectiveTarget);
  timingDir = path.dirname(paths.outputDir);

  console.log(`\n======================================================`);
  console.log(`🎬 WEALTH GAP MOTION GRAPHICS BUILD: ${paths.jobId}`);
  console.log(`Mode: ${yesMode ? "NON-INTERACTIVE (--yes)" : "HUMAN-GATED (Gates 1 & 2)"}`);
  console.log(`======================================================`);

  // Step 1: Captions (if captions are missing or older than the transcript they come from)
  const captionsPath = path.join(paths.outputDir, "captions.json");
  const transcriptPath = path.join(path.dirname(paths.outputDir), "04-transcription", "full_transcript.json");
  const captionsStale =
    fs.existsSync(captionsPath) &&
    fs.existsSync(transcriptPath) &&
    fs.statSync(transcriptPath).mtimeMs > fs.statSync(captionsPath).mtimeMs;
  if (!fs.existsSync(captionsPath) || captionsStale) {
    runStep("1. Build Captions from Transcript", `bun run captions --video "${effectiveTarget}"`);
  }
  runStep("1b. Closed captions (.srt for YouTube)", `bun run srt --video "${paths.jobId}"`);

  // Step 2: Director plans the acts (acts.json + treatment; storyboard.json is its one-scene-per-act view)
  const actsPath = path.join(paths.outputDir, "acts.json");
  if (!fs.existsSync(actsPath)) {
    runStep("2. Direct: plan acts (Opus)", `bun run direct --video "${paths.jobId}"`);
  } else {
    runStep("2. Validate acts.json", `bun run direct --video "${paths.jobId}" --check`);
  }

  // Gate 1: Human review of the plan
  if (!yesMode) {
    console.log(`\n🛑 GATE 1: Plan Review`);
    console.log(`   - Read the treatment and acts in: ${actsPath}`);
    const proceed = await askConfirmation("Proceed to act authoring?");
    if (!proceed) {
      console.log("Build paused at Gate 1. Edit acts.json (then `bun run direct --check`) and resume.");
      process.exit(0);
    }
  }

  // Step 3-4: Timeline, then acts (Opus draws, fresh-context critic reviews)
  runStep("3. Timeline", `bun run timeline --video "${paths.jobId}"`);
  runStep("4. Author acts", `bun run act --video "${paths.jobId}"`);

  // Step 5: Sound: foley events + music plan from the acts, music bed, full mix
  runStep("5a. Sound cues", `bun run cues --video "${paths.jobId}"`);
  runStep("5b. Music bed (separate stem, added in post)", `bun run audio:music --video "${paths.jobId}"`);
  runStep("5c. Mix voice + foley", `bun run audio:mix --video "${paths.jobId}"`);

  // Step 6: Assemble Registry
  runStep("6. Assemble", `bun run assemble --video "${paths.jobId}"`);

  // Step 7: Draft Render
  runStep("7. Render Draft Video (30fps fast)", `bun run draft --video "${paths.jobId}"`);

  if (isDraftOnly) {
    console.log(`\n✅ Draft build complete: ${path.join(paths.outputDir, "draft.mp4")}`);
    process.exit(0);
  }

  // Gate 2: Human review of draft video & contact sheets
  if (!yesMode) {
    console.log(`\n🛑 GATE 2: Draft & Contact Sheet Review`);
    console.log(`   - Watch draft video: ${path.join(paths.outputDir, "draft.mp4")}`);
    console.log(`   - Inspect contact sheets under: ${path.join(paths.outputDir, "review")}/*/sheet.jpg`);
    const proceed = await askConfirmation("Proceed to final 1080p broadcast render & QC?");
    if (!proceed) {
      console.log("Build paused at Gate 2. Fix an act with 'bun run act --video <id> --act A03 --force' and resume.");
      process.exit(0);
    }
  }

  // Step 8: Final Render
  runStep("8. Render Final Broadcast Video (1080p H.264)", `bun run render --video "${paths.jobId}"`);

  // Step 9: Quality Control
  runStep("9. Automated Quality Control (QC)", `bun run qc --video "${paths.jobId}"`);

  console.log(`\n======================================================`);
  console.log(`🎉 BUILD COMPLETED SUCCESSFULLY FOR: ${paths.jobId}`);
  console.log(`   Final video: ${path.join(paths.outputDir, "final.mp4")}`);
  console.log(`   Time & cost per step: bun run timings --video ${paths.jobId}`);
  console.log(`======================================================\n`);
}

main().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
