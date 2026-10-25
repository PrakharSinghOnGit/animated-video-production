import fs from "node:fs";
import path from "node:path";
import { execSync, spawnSync } from "node:child_process";
import { resolveJobPaths } from "../src/lib/workspaceBridge";

function parseArgs() {
  const args = process.argv.slice(2);
  let videoId: string | undefined;
  let targetScenes: string[] = [];
  let force = false;
  let concurrency = 1;
  // Scene authoring fills a well-specified brief, so a mid-size model is the default;
  // pass --model opus for hero scenes that need more design judgement.
  let model = process.env.AUTHOR_MODEL || "sonnet";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--video" || args[i] === "-v") {
      videoId = args[i + 1];
      i++;
    } else if (args[i] === "--scenes" || args[i] === "--scene" || args[i] === "-s") {
      targetScenes = args[i + 1].split(",").map((s) => s.trim().toUpperCase());
      i++;
    } else if (args[i] === "--model") {
      model = args[i + 1];
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
    model,
  };
}

function runCommandSilent(cmd: string): { success: boolean; output: string } {
  try {
    const out = execSync(cmd, { encoding: "utf-8", stdio: "pipe" });
    return { success: true, output: out };
  } catch (err: any) {
    return { success: false, output: (err.stdout || "") + (err.stderr || "") + err.message };
  }
}

async function main() {
  const { videoId, targetScenes, force, model } = parseArgs();
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

  if (scenesToProcess.length === 0) {
    console.log(`No matching scenes found for target: ${targetScenes.join(", ")}`);
    process.exit(0);
  }

  console.log(`Targeting ${scenesToProcess.length} scene(s): ${scenesToProcess.map((s: any) => s.id).join(", ")}\n`);

  const scenesDir = path.join(paths.outputDir, "src", "scenes");
  fs.mkdirSync(scenesDir, { recursive: true });

  const authorLogPath = path.join(paths.outputDir, "review", "author-log.json");
  let authorLog: Record<string, any> = {};
  if (fs.existsSync(authorLogPath)) {
    try {
      authorLog = JSON.parse(fs.readFileSync(authorLogPath, "utf-8"));
    } catch {}
  }

  // Check Claude CLI availability
  const claudeAvailable = runCommandSilent("which claude").success;

  for (let idx = 0; idx < scenesToProcess.length; idx++) {
    const s = scenesToProcess[idx];
    const tlScene = timeline.scenes.find((ts: any) => ts.id.toUpperCase() === s.id.toUpperCase());
    const sceneReviewDir = path.join(paths.outputDir, "review", s.id);
    fs.mkdirSync(sceneReviewDir, { recursive: true });

    const sceneFile = path.join(scenesDir, `${s.id}_${s.slug}.tsx`);

    // Archetype scenes are rendered from their storyboard spec; there is nothing to author.
    if (s.archetype) {
      console.log(`🧩 [${s.id}] Archetype scene (${s.archetype}); rendered from storyboard props, skipping authoring.`);
      authorLog[s.id] = { status: "verified", agentResult: "archetype", archetype: s.archetype, timestamp: new Date().toISOString() };
      continue;
    }

    // Check if already exists and !force
    if (fs.existsSync(sceneFile) && !force) {
      console.log(`⏩ [${s.id}] Already exists at ${path.basename(sceneFile)}. Skipping (use --force to overwrite).`);
      continue;
    }

    // If force and file exists, archive to history
    if (fs.existsSync(sceneFile) && force) {
      const historyDir = path.join(sceneReviewDir, "history");
      fs.mkdirSync(historyDir, { recursive: true });
      const archivePath = path.join(historyDir, `${s.id}_${Date.now()}.tsx`);
      fs.copyFileSync(sceneFile, archivePath);
      console.log(`📦 [${s.id}] Archived previous version to: ${archivePath}`);
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
${kitApi}
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

    const startTime = Date.now();
    let agentResult: "headless_success" | "interactive_fallback" = "interactive_fallback";

    // Attempt headless run with Claude Code if available
    if (claudeAvailable) {
      console.log(`🤖 [${s.id}] Attempting headless agent authoring via Claude Code (${model})...`);
      // Prompt goes over stdin (it is far too large for argv), and the tools the brief asks
      // for are pre-approved so a non-interactive run cannot stall on a permission prompt.
      const claudeRes = spawnSync(
        "claude",
        [
          "-p",
          "--model", model,
          "--output-format", "json",
          "--permission-mode", "acceptEdits",
          "--allowedTools",
          "Read", "Write", "Edit", "Glob", "Grep",
          "Bash(bun run lint:scene:*)", "Bash(bun run still:*)", "Bash(bun run sheet:*)",
        ],
        { input: prompt, encoding: "utf-8", maxBuffer: 50 * 1024 * 1024, cwd: process.cwd() }
      );

      const headlessLog = path.join(sceneReviewDir, "headless.log");
      fs.writeFileSync(
        headlessLog,
        `exit: ${claudeRes.status}\nerror: ${claudeRes.error?.message ?? ""}\n\n--- stdout ---\n${claudeRes.stdout ?? ""}\n\n--- stderr ---\n${claudeRes.stderr ?? ""}\n`,
        "utf-8"
      );

      let resultIsError = claudeRes.status !== 0;
      try {
        const parsed = JSON.parse(claudeRes.stdout || "{}");
        if (parsed.is_error) resultIsError = true;
      } catch {
        resultIsError = true;
      }

      if (!resultIsError && fs.existsSync(sceneFile)) {
        console.log(`✅ [${s.id}] Headless authoring finished.`);
        agentResult = "headless_success";
      } else {
        const why = resultIsError ? `agent run failed (exit ${claudeRes.status})` : "agent finished but did not write the scene file";
        console.log(`❌ [${s.id}] Headless authoring: ${why}. Full output: ${headlessLog}`);
      }
    } else {
      console.log(`ℹ️ [${s.id}] Claude CLI not found. Falling back to interactive mode.`);
    }

    if (agentResult === "interactive_fallback") {
      console.log(`
👉 Interactive Authoring Action for [${s.id}]:
   1. Open Claude Code or your AI coding assistant.
   2. Paste the prompt from:
      ${promptPath}
   3. Author the scene and save to:
      ${sceneFile}
   4. Run:
      bun run lint:scene --video ${paths.jobId} --scene ${s.id}
      bun run still --video ${paths.jobId} --scene ${s.id}
      bun run sheet --video ${paths.jobId} --scene ${s.id}
`);
    }

    // Run verification if the file exists
    let lintPassed = false;
    if (fs.existsSync(sceneFile)) {
      console.log(`🔍 [${s.id}] Running static linter...`);
      const lintRes = runCommandSilent(`bun run workflow/05-video/scripts/lint_scene.ts --video ${paths.jobId} --scene ${s.id}`);
      lintPassed = lintRes.success;
      if (lintPassed) {
        console.log(`   ✓ Lint: PASS`);
      } else {
        console.warn(`   ⚠️ Lint: FAILED\n${lintRes.output}`);
      }

      console.log(`📸 [${s.id}] Capturing keyframe stills...`);
      runCommandSilent(`bun run workflow/05-video/scripts/still.ts --video ${paths.jobId} --scene ${s.id}`);

      console.log(`🖼️ [${s.id}] Tiling contact sheet...`);
      runCommandSilent(`bun run workflow/05-video/scripts/sheet.ts --video ${paths.jobId} --scene ${s.id}`);
    }

    authorLog[s.id] = {
      status: fs.existsSync(sceneFile) ? (lintPassed ? "verified" : "needs_lint_fix") : "pending_author",
      agentResult,
      promptPath,
      targetFile: sceneFile,
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }

  fs.writeFileSync(authorLogPath, JSON.stringify(authorLog, null, 2), "utf-8");
  console.log(`\n✓ Author log saved to: ${authorLogPath}`);

  // After all scenes: assemble & draft
  console.log(`\n========================================`);
  console.log(`Post-Authoring Assembly & Verification`);
  console.log(`========================================`);
  const assembleRes = runCommandSilent(`bun run workflow/05-video/scripts/assemble.ts --video ${paths.jobId}`);
  if (assembleRes.success) {
    console.log(`✓ Assembled video registry and cues.`);
  } else {
    console.error(`❌ Assemble failed:\n${assembleRes.output}`);
  }

  const unverified = scenesToProcess.filter((s: any) => authorLog[s.id] && authorLog[s.id].status !== "verified");
  if (unverified.length > 0) {
    console.warn(`\n⚠️  ${unverified.length} scene(s) not verified: ${unverified.map((s: any) => `${s.id}=${authorLog[s.id].status}`).join(", ")}`);
  }

  console.log(`\n✨ Gate 2 Review Ready:`);
  console.log(`1. Inspect per-scene contact sheets at:`);
  scenesToProcess.forEach((s: any) => {
    console.log(`   - ${paths.jobId} [${s.id}]: review/${s.id}/contact-sheet.png`);
  });
  console.log(`2. Render a draft preview with: bun run draft --video ${paths.jobId}`);
  console.log(`3. To re-author any scene: bun run author --video ${paths.jobId} --scenes <sceneId> --force\n`);

  if (!assembleRes.success || unverified.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
