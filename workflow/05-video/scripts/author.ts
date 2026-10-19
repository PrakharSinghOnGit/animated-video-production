import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { resolveJobPaths } from "../src/lib/workspaceBridge";
import { lintSceneCode } from "@wealthgap/kit";

function parseArgs() {
  const args = process.argv.slice(2);
  let videoId: string | undefined;
  let targetScenes: string[] = [];
  let force = false;
  let concurrency = 1;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--video" || args[i] === "-v") {
      videoId = args[i + 1];
      i++;
    } else if (args[i] === "--scenes" || args[i] === "-s") {
      targetScenes = args[i + 1].split(",").map((s) => s.trim().toUpperCase());
      i++;
    } else if (args[i] === "--force") {
      force = true;
    } else if (args[i] === "--concurrency") {
      concurrency = parseInt(args[i + 1], 10) || 1;
      i++;
    } else if (!args[i].startsWith("-") && !videoId) {
      videoId = args[i];
    }
  }

  return {
    videoId: videoId || process.env.ACTIVE_VIDEO || "VID01_Currency_Market",
    targetScenes,
    force,
    concurrency,
  };
}

async function main() {
  const { videoId, targetScenes, force } = parseArgs();
  const paths = resolveJobPaths(videoId);

  console.log(`\n========================================`);
  console.log(`Scene Author Orchestrator for: ${paths.jobId}`);
  console.log(`========================================`);

  // Verify storyboard and timeline exist
  const storyboardFile = path.join(paths.outputDir, "storyboard.json");
  const timelineFile = path.join(paths.outputDir, "timeline.json");

  if (!fs.existsSync(storyboardFile) || !fs.existsSync(timelineFile)) {
    console.error(`❌ Missing storyboard.json or timeline.json. Run "bun run storyboard" and "bun run timeline" first.`);
    process.exit(1);
  }

  const storyboard = JSON.parse(fs.readFileSync(storyboardFile, "utf-8"));
  const timeline = JSON.parse(fs.readFileSync(timelineFile, "utf-8"));

  // Read SCENE_AUTHOR prompt
  const authorPromptPaths = [
    path.resolve(process.cwd(), "workflow", "prompts", "SCENE_AUTHOR.md"),
    path.resolve(process.cwd(), "_migration", "SCENE_AUTHOR.md"),
  ];
  const authorPromptPath = authorPromptPaths.find((p) => fs.existsSync(p));
  const authorInstructions = authorPromptPath ? fs.readFileSync(authorPromptPath, "utf-8") : "";

  // Read KIT_API
  const kitApiPaths = [
    path.resolve(process.cwd(), "packages", "kit", "KIT_API.md"),
    path.resolve(process.cwd(), "_migration", "KIT_API.md"),
  ];
  const kitApiPath = kitApiPaths.find((p) => fs.existsSync(p));
  const kitApi = kitApiPath ? fs.readFileSync(kitApiPath, "utf-8") : "";

  const scenesToProcess = targetScenes.length > 0
    ? storyboard.scenes.filter((s: any) => targetScenes.includes(s.id.toUpperCase()))
    : storyboard.scenes;

  console.log(`Targeting ${scenesToProcess.length} scene(s): ${scenesToProcess.map((s: any) => s.id).join(", ")}\n`);

  const scenesDir = path.join(paths.outputDir, "src", "scenes");
  fs.mkdirSync(scenesDir, { recursive: true });

  const authorLog: Record<string, any> = {};

  for (let idx = 0; idx < scenesToProcess.length; idx++) {
    const s = scenesToProcess[idx];
    const tlScene = timeline.scenes.find((ts: any) => ts.id.toUpperCase() === s.id.toUpperCase());
    const sceneReviewDir = path.join(paths.outputDir, "review", s.id);
    fs.mkdirSync(sceneReviewDir, { recursive: true });

    const sceneFile = path.join(scenesDir, `${s.id}_${s.slug}.tsx`);

    // Check if already exists and !force
    if (fs.existsSync(sceneFile) && !force) {
      console.log(`⏩ [${s.id}] Already exists at ${path.basename(sceneFile)}. Skipping (use --force to overwrite).`);
      continue;
    }

    const prevScene = idx > 0 ? scenesToProcess[idx - 1] : null;
    const nextScene = idx < scenesToProcess.length - 1 ? scenesToProcess[idx + 1] : null;

    // Build the scene author prompt
    const prompt = `# Scene Authoring Brief: ${s.id} (${s.slug})

${authorInstructions}

---

# CONTEXT FOR SCENE ${s.id}

## 1. Video Arc
\`\`\`json
${JSON.stringify(storyboard.videoArc || {}, null, 2)}
\`\`\`

## 2. Storyboard Row for ${s.id}
\`\`\`json
${JSON.stringify(s, null, 2)}
\`\`\`

## 3. Timeline Slice for ${s.id}
\`\`\`json
${JSON.stringify(tlScene || {}, null, 2)}
\`\`\`

## 4. Context & Handoffs
- **Previous Scene (${prevScene?.id ?? "None"}):** ${prevScene?.hero ?? "None"} (Handoff: ${prevScene?.handoff ?? "None"})
- **Next Scene (${nextScene?.id ?? "None"}):** ${nextScene?.metaphor ?? "None"}

## 5. Available Kit Primitives (from @wealthgap/kit)
\`\`\`markdown
${kitApi.slice(0, 3500)}
\`\`\`

---

# INSTRUCTIONS
Write the complete React component for this scene and save it to:
\`${sceneFile}\`

After writing the file, run:
\`bun run lint:scene --video ${paths.jobId} --scene ${s.id}\`
\`bun run still --video ${paths.jobId} --scene ${s.id}\`
`;

    const promptPath = path.join(sceneReviewDir, "prompt.txt");
    fs.writeFileSync(promptPath, prompt, "utf-8");
    console.log(`📝 [${s.id}] Prepared author prompt at: ${promptPath}`);

    authorLog[s.id] = {
      status: "prompt_prepared",
      promptPath,
      targetFile: sceneFile,
      timestamp: new Date().toISOString(),
    };
  }

  const logPath = path.join(paths.outputDir, "review", "author-log.json");
  fs.writeFileSync(logPath, JSON.stringify(authorLog, null, 2), "utf-8");
  console.log(`\n✓ Author log saved to: ${logPath}`);
  console.log(`Authoring prompts ready in review/<sceneId>/prompt.txt for model execution.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
