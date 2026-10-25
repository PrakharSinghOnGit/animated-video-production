import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import readline from "node:readline";
import { resolveJobPaths } from "../src/lib/workspaceBridge";

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

function runStep(title: string, cmd: string) {
  console.log(`\n========================================`);
  console.log(`▶ ${title}`);
  console.log(`  $ ${cmd}`);
  console.log(`========================================`);
  execSync(cmd, { stdio: "inherit" });
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

  // Step 2: Storyboard
  const storyboardPath = path.join(paths.outputDir, "storyboard.json");
  if (!fs.existsSync(storyboardPath)) {
    runStep("2. Build Storyboard Prompt", `bun run storyboard --video "${paths.jobId}"`);
  }

  // Gate 1: Human review of storyboard
  const storyboardMd = path.join(paths.outputDir, "review", "storyboard.md");
  if (!yesMode) {
    console.log(`\n🛑 GATE 1: Storyboard Review`);
    console.log(`   - Review the storyboard at: ${fs.existsSync(storyboardMd) ? storyboardMd : path.join(paths.outputDir, "review", "storyboard_prompt.txt")}`);
    console.log(`   - Ensure storyboard.json is placed in: ${storyboardPath}`);
    const proceed = await askConfirmation("Proceed to timeline generation and scene authoring?");
    if (!proceed) {
      console.log("Build paused at Gate 1. Resume when storyboard is approved.");
      process.exit(0);
    }
  }

  // Step 3: Storyboard Check & Timeline
  runStep("3. Validate Storyboard", `bun run storyboard:check --video "${paths.jobId}"`);
  runStep("4. Generate Frame-Accurate Timeline", `bun run timeline --video "${paths.jobId}"`);

  // Step 5: Author Scenes
  runStep("5. Author Scenes Orchestration", `bun run author --video "${paths.jobId}"`);

  // Step 6: Assemble Registry & SFX Cues
  runStep("6. Assemble Scenes & Cues", `bun run assemble --video "${paths.jobId}"`);

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
    console.log(`   - Inspect contact sheets under: ${path.join(paths.outputDir, "review")}/*/contact-sheet.png`);
    const proceed = await askConfirmation("Proceed to final 1080p broadcast render & QC?");
    if (!proceed) {
      console.log("Build paused at Gate 2. Fix any scenes with 'bun run author --video <id> --scenes <scene>' and resume.");
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
  console.log(`======================================================\n`);
}

main().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
