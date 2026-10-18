import { runGenerate, printHelp } from "./src/generate";
import type { GenerationOptions } from "./src/types";

function parseArgs(): GenerationOptions {
  const args = process.argv.slice(2);
  const options: GenerationOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (arg === "--list" || arg === "-l") {
      options.listOnly = true;
    } else if (arg === "--cost" || arg === "--estimate" || arg === "-e") {
      options.costOnly = true;
    } else if (arg === "--dry-run" || arg === "-d") {
      options.dryRun = true;
    } else if (arg === "--force" || arg === "-f") {
      options.forceOverwrite = true;
    } else if (arg === "--combine" || arg === "-c") {
      options.combinePart = true;
      options.combineAll = true;
    } else if (arg === "--video" || arg === "-v") {
      options.video = args[++i];
    } else if (arg === "--scale" || arg === "-m") {
      options.expressionScale = parseFloat(args[++i]);
    } else if (arg === "--pitch-scale") {
      options.pitchScale = parseFloat(args[++i]);
    } else if (arg === "--pace-scale") {
      options.paceScale = parseFloat(args[++i]);
    } else if (arg === "--loudness-scale") {
      options.loudnessScale = parseFloat(args[++i]);
    } else if (arg === "--part" || arg === "-p") {
      options.part = parseInt(args[++i], 10);
    } else if (arg === "--section" || arg === "--id" || arg === "-s") {
      options.sectionId = args[++i];
    } else if (arg === "--speaker") {
      options.speakerOverride = args[++i];
    } else if (arg === "--rate") {
      options.sampleRate = parseInt(args[++i], 10);
    } else if (arg === "--codec") {
      options.codec = args[++i] as "wav" | "mp3";
    } else if (arg === "--api-key") {
      options.apiKey = args[++i];
    } else if (arg === "--cloud" || arg === "--sarvam" || arg === "--api") {
      options.engine = "cloud";
    } else if (arg === "--local" || arg === "--f5") {
      options.engine = "local";
    } else if (arg === "--out") {
      options.outputDir = args[++i];
    } else if (!arg.startsWith("-") && !options.video) {
      options.video = arg;
    }
  }

  // Default to local F5-TTS voice cloning unless explicitly flagged
  options.engine = options.engine || "local";

  return options;
}

const options = parseArgs();
runGenerate(options).catch((err) => {
  console.error("❌ Fatal Error in 03-Voiceover:", err.message);
  process.exit(1);
});
