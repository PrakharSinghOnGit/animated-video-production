import fs from "node:fs";
import path from "node:path";
import { resolveJobPaths } from "../src/lib/workspaceBridge";
import { execSync } from "node:child_process";

function parseArgs() {
  const args = process.argv.slice(2);
  let videoId: string | undefined;
  let autoMode = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--video" || args[i] === "-v") {
      videoId = args[i + 1];
      i++;
    } else if (args[i] === "--auto") {
      autoMode = true;
    } else if (!args[i].startsWith("-") && !videoId) {
      videoId = args[i];
    }
  }

  return {
    videoId: videoId || process.env.ACTIVE_VIDEO || "VID01_Currency_Market",
    autoMode,
  };
}

async function main() {
  const { videoId, autoMode } = parseArgs();
  const paths = resolveJobPaths(videoId);

  console.log(`\n========================================`);
  console.log(`Generating Storyboard Prompt for: ${paths.jobId}`);
  console.log(`========================================`);

  const reviewDir = path.join(paths.outputDir, "review");
  fs.mkdirSync(reviewDir, { recursive: true });

  // 1. Read STORYBOARD prompt template
  const promptTemplatePaths = [
    path.resolve(process.cwd(), "workflow", "prompts", "STORYBOARD.md"),
    path.resolve(process.cwd(), "_migration", "STORYBOARD.md"),
  ];
  const templatePath = promptTemplatePaths.find((p) => fs.existsSync(p));
  const promptTemplate = templatePath ? fs.readFileSync(templatePath, "utf-8") : "You are the Art Director.";

  // 2. Read KIT_API summary
  const kitApiPaths = [
    path.resolve(process.cwd(), "packages", "kit", "KIT_API.md"),
    path.resolve(process.cwd(), "_migration", "KIT_API.md"),
  ];
  const kitApiPath = kitApiPaths.find((p) => fs.existsSync(p));
  const kitApi = kitApiPath ? fs.readFileSync(kitApiPath, "utf-8") : "";

  // 3. Read transcript
  const transcript = paths.transcriptFile && fs.existsSync(paths.transcriptFile)
    ? fs.readFileSync(paths.transcriptFile, "utf-8")
    : fs.existsSync(path.join(paths.outputDir, "captions.json"))
    ? fs.readFileSync(path.join(paths.outputDir, "captions.json"), "utf-8")
    : "[]";

  // 4. Read script
  const scriptContent = paths.briefFile && fs.existsSync(paths.briefFile)
    ? fs.readFileSync(paths.briefFile, "utf-8")
    : "";

  // 5. Build full prompt
  const fullPrompt = `${promptTemplate}

---

# CONTEXT & INPUTS FOR VIDEO: ${paths.jobId}

## 1. Raw Written Script
\`\`\`markdown
${scriptContent}
\`\`\`

## 2. Word-Level Spoken Transcript (The Clock)
\`\`\`json
${transcript}
\`\`\`

## 3. Kit API Summary (Available Primitives & Shortcuts)
\`\`\`markdown
${kitApi.slice(0, 4000)}
\`\`\`

---

Please return ONLY the valid JSON storyboard object matching the schema in Section 6. Save as storyboard.json.
`;

  const promptFile = path.join(reviewDir, "storyboard_prompt.txt");
  fs.writeFileSync(promptFile, fullPrompt, "utf-8");
  console.log(`✓ Wrote complete storyboard prompt to: ${promptFile}`);

  // Check if storyboard.json already exists
  const storyboardFile = path.join(paths.outputDir, "storyboard.json");
  if (fs.existsSync(storyboardFile)) {
    console.log(`\nExisting storyboard.json found at ${storyboardFile}. Running storyboard:check...`);
    execSync(`bun run workflow/05-video/scripts/storyboard_check.ts --video ${paths.jobId}`, {
      stdio: "inherit",
    });
  } else {
    console.log(`\n======================================================`);
    console.log(`Manual Mode:`);
    console.log(`1. Copy prompt from: ${promptFile}`);
    console.log(`2. Paste into Claude / Gemini to generate storyboard.json`);
    console.log(`3. Save JSON to: ${storyboardFile}`);
    console.log(`4. Run: bun run storyboard:check --video ${paths.jobId}`);
    console.log(`======================================================\n`);
  }
}

main().catch((err) => {
  console.error(`\n❌ Storyboard step failed: ${err.message}\n`);
  process.exit(1);
});
