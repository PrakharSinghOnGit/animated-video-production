import fs from "node:fs";
import path from "node:path";
import { resolveJobPaths } from "../src/lib/workspaceBridge";
import { validateStoryboard, generateStoryboardMarkdown } from "../src/lib/storyboardValidator";

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
  console.log(`Validating Storyboard for: ${paths.jobId}`);
  console.log(`========================================`);

  // Locate storyboard.json
  const candidateStoryboard = [
    path.join(paths.outputDir, "storyboard.json"),
    path.join(paths.inputDir, "storyboard.json"),
  ];

  let storyboardFile = candidateStoryboard.find((p) => fs.existsSync(p));
  if (!storyboardFile) {
    console.error(`❌ Error: Missing storyboard.json for ${paths.jobId}`);
    process.exit(1);
  }

  // Locate captions for anchor validation if available
  const candidateCaptions = [
    path.join(paths.outputDir, "captions.json"),
    path.join(paths.outputDir, "public", "captions.json"),
  ];
  let captions: Array<{ text: string; startMs: number; endMs: number }> = [];
  const capFile = candidateCaptions.find((p) => fs.existsSync(p));
  if (capFile) {
    try {
      captions = JSON.parse(fs.readFileSync(capFile, "utf-8"));
    } catch {}
  }

  const rawStoryboard = JSON.parse(fs.readFileSync(storyboardFile, "utf-8"));
  const validation = validateStoryboard(rawStoryboard, captions);

  // Generate markdown report
  const reviewDir = path.join(paths.outputDir, "review");
  fs.mkdirSync(reviewDir, { recursive: true });

  const md = generateStoryboardMarkdown(
    validation.storyboard || (rawStoryboard as any),
    [...validation.errors, ...validation.warnings]
  );

  const reviewMdPath = path.join(reviewDir, "storyboard.md");
  fs.writeFileSync(reviewMdPath, md, "utf-8");
  console.log(`✓ Wrote readable storyboard to: ${reviewMdPath}`);

  if (validation.warnings.length > 0) {
    console.log(`\n⚠️ Warnings (${validation.warnings.length}):`);
    validation.warnings.forEach((w) => {
      console.log(`  - [${w.sceneId ?? "GLOBAL"}] ${w.message}`);
    });
  }

  if (!validation.valid) {
    console.error(`\n❌ Storyboard validation FAILED with ${validation.errors.length} error(s):`);
    validation.errors.forEach((e) => {
      console.error(`  ✖ [${e.sceneId ?? "GLOBAL"}] ${e.message}`);
    });
    console.error(`\nPlease address the errors above in storyboard.json and re-run storyboard:check.`);
    process.exit(1);
  }

  console.log(`\n✅ Storyboard passed all structural, timing, anchor, and data integrity checks!`);
}

main().catch((err) => {
  console.error(`\n❌ Storyboard check failed: ${err.message}\n`);
  process.exit(1);
});
