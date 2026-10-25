import fs from "node:fs";
import path from "node:path";
import { resolveJobPaths } from "../src/lib/workspaceBridge";
import { buildTimeline } from "../src/lib/timelineBuilder";

function parseArgs() {
  const args = process.argv.slice(2);
  let videoId: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--video" || args[i] === "-v") {
      videoId = args[i + 1];
      i++;
    } else if (!args[i].startsWith("-") && !videoId) {
      videoId = args[i];
    }
  }

  return { videoId: videoId || process.env.ACTIVE_VIDEO || "VID01_Currency_Market" };
}

async function main() {
  const { videoId } = parseArgs();
  const paths = resolveJobPaths(videoId);

  console.log(`\n========================================`);
  console.log(`Building Timeline for: ${paths.jobId}`);
  console.log(`========================================`);

  // Locate captions.json
  const candidateCaptions = [
    path.join(paths.outputDir, "captions.json"),
    path.join(paths.outputDir, "public", "captions.json"),
    path.join(process.cwd(), "public", "jobs", paths.jobId, "captions.json"),
  ];

  let captionsFile = candidateCaptions.find((p) => fs.existsSync(p));
  if (!captionsFile) {
    console.error(`❌ Error: Missing captions.json for ${paths.jobId}. Please run "bun run captions --video <ID>" first.`);
    process.exit(1);
  }

  // Locate storyboard.json
  const candidateStoryboard = [
    path.join(paths.outputDir, "storyboard.json"),
    path.join(paths.inputDir, "storyboard.json"),
    path.join(paths.outputDir, "..", "05-video", "storyboard.json"),
  ];

  let storyboardFile = candidateStoryboard.find((p) => fs.existsSync(p));
  if (!storyboardFile) {
    console.error(`❌ Error: Missing storyboard.json for ${paths.jobId}. Run "bun run storyboard" first.`);
    process.exit(1);
  }

  const captions = JSON.parse(fs.readFileSync(captionsFile, "utf-8"));
  const storyboard = JSON.parse(fs.readFileSync(storyboardFile, "utf-8"));

  // Check config for fps
  let fps = 30;
  if (paths.configFile && fs.existsSync(paths.configFile)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(paths.configFile, "utf-8"));
      if (cfg.fps) fps = cfg.fps;
    } catch {}
  }

  const timeline = buildTimeline(captions, storyboard, { fps, leadMs: 200 });

  // Write timeline.json to outputDir and publicDir
  const outPath = path.join(paths.outputDir, "timeline.json");
  fs.writeFileSync(outPath, JSON.stringify(timeline, null, 2), "utf-8");
  console.log(`✓ Wrote timeline.json to ${outPath} (${timeline.scenes.length} scenes, ${timeline.durationFrames} frames)`);

  const publicTimeline = path.join(paths.outputDir, "public", "timeline.json");
  if (fs.existsSync(path.dirname(publicTimeline))) {
    fs.writeFileSync(publicTimeline, JSON.stringify(timeline, null, 2), "utf-8");
  }
}

main().catch((err) => {
  console.error(`\n❌ Timeline generation failed: ${err.message}\n`);
  process.exit(1);
});
