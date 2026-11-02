import { runGenerate, printHelp } from "./src/generate";
import { TTS_MODELS, type GenerationOptions, type TtsModel } from "./src/types";

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
    } else if (arg === "--part" || arg === "-p") {
      options.part = parseInt(args[++i], 10);
    } else if (arg === "--section" || arg === "--id" || arg === "-s") {
      options.sectionId = args[++i];
    } else if (arg === "--review") {
      options.review = true;
    } else if (arg === "--qwen") {
      options.ttsModel = "qwen";
    } else if (arg === "--gemini") {
      options.ttsModel = "gemini";
    } else if (arg === "--tts-model" || arg === "--engine") {
      const m = args[++i] as TtsModel;
      if (!TTS_MODELS.includes(m)) { console.error(`Unknown engine '${m}' (use ${TTS_MODELS.join(", ")})`); process.exit(1); }
      options.ttsModel = m;
    } else if (arg === "--no-moods") {
      options.noMoods = true;
    } else if (arg === "--voice-profile") {
      options.voiceProfile = args[++i];
    } else if (arg === "--voice") {
      options.voice = args[++i];
    } else if (arg === "--style") {
      options.style = args[++i];
    } else if (arg === "--parallel") {
      options.parallel = Math.max(1, parseInt(args[++i], 10) || 4);
    } else if (arg === "--gemini-model") {
      options.geminiModel = args[++i];
    } else if (arg === "--pace") {
      options.pace = parseFloat(args[++i]);
    } else if (arg === "--sentence-gap") {
      options.sentenceGap = parseFloat(args[++i]);
    } else if (arg === "--section-gap") {
      options.sectionGap = parseFloat(args[++i]);
    } else if (arg === "--chapter-gap") {
      options.chapterGap = parseFloat(args[++i]);
    } else if (arg === "--pause-ms") {
      options.pauseMs = parseInt(args[++i], 10);
    } else if (arg === "--temperature") {
      options.temperature = parseFloat(args[++i]);
    } else if (arg === "--takes") {
      options.takes = parseInt(args[++i], 10);
    } else if (arg === "--accept-wer") {
      options.acceptWer = parseFloat(args[++i]);
    } else if (arg === "--asr-model") {
      options.asrModel = args[++i];
    } else if (arg === "--check-ref") {
      options.checkRef = true;
    } else if (arg === "--out") {
      options.outputDir = args[++i];
    } else if (!arg.startsWith("-") && !options.video) {
      options.video = arg;
    }
  }

  return options;
}

const options = parseArgs();
runGenerate(options).catch((err) => {
  console.error("❌ Fatal Error in 03-Voiceover:", err.message);
  process.exit(1);
});
