import fs from "node:fs";
import path from "node:path";
import { resolveJobPaths } from "../src/lib/workspaceBridge";
import { lintSceneCode, type LintIssue } from "@wealthgap/kit";

function parseArgs() {
  const args = process.argv.slice(2);
  let videoId: string | undefined;
  let targetScene: string | undefined;
  let targetFile: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--video" || args[i] === "-v") {
      videoId = args[i + 1];
      i++;
    } else if (args[i] === "--scene" || args[i] === "-s") {
      targetScene = args[i + 1];
      i++;
    } else if (args[i] === "--file" || args[i] === "-f") {
      targetFile = args[i + 1];
      i++;
    } else if (!args[i].startsWith("-")) {
      if (!videoId) videoId = args[i];
      else if (!targetScene) targetScene = args[i];
    }
  }

  return {
    videoId: videoId || process.env.ACTIVE_VIDEO || "VID01_Currency_Market",
    targetScene,
    targetFile,
  };
}

async function main() {
  const { videoId, targetScene, targetFile } = parseArgs();
  const paths = resolveJobPaths(videoId);

  const scenesDir = path.join(paths.outputDir, "src", "scenes");
  if (!fs.existsSync(scenesDir)) {
    console.error(`❌ Scenes directory not found: ${scenesDir}`);
    process.exit(1);
  }

  // Load words from timeline if available
  const timelinePath = path.join(paths.outputDir, "timeline.json");
  let sceneWordsMap: Record<string, string[]> = {};
  if (fs.existsSync(timelinePath)) {
    try {
      const tl = JSON.parse(fs.readFileSync(timelinePath, "utf-8"));
      for (const s of tl.scenes) {
        sceneWordsMap[s.id.toUpperCase()] = s.words.map((w: any) => w.text);
      }
    } catch {}
  }

  let filesToLint: string[] = [];
  if (targetFile) {
    filesToLint = [path.resolve(targetFile)];
  } else if (targetScene) {
    const allFiles = fs.readdirSync(scenesDir).filter((f) => f.endsWith(".tsx") && f !== "index.ts");
    const found = allFiles.find((f) => f.toUpperCase().startsWith(targetScene.toUpperCase()));
    if (!found) {
      console.error(`❌ Scene file matching "${targetScene}" not found in ${scenesDir}`);
      process.exit(1);
    }
    filesToLint = [path.join(scenesDir, found)];
  } else {
    filesToLint = fs
      .readdirSync(scenesDir)
      .filter((f) => f.endsWith(".tsx") && f !== "index.ts")
      .map((f) => path.join(scenesDir, f));
  }

  if (filesToLint.length === 0) {
    console.log(`No scene files found to lint in ${scenesDir}`);
    process.exit(0);
  }

  console.log(`\n========================================`);
  console.log(`Linting ${filesToLint.length} Scene File(s) for ${paths.jobId}`);
  console.log(`========================================\n`);

  let totalErrors = 0;
  let totalWarnings = 0;

  for (const file of filesToLint) {
    const filename = path.basename(file);
    const idMatch = filename.match(/^(S\d+)/i);
    const sceneId = idMatch ? idMatch[1].toUpperCase() : "";
    const words = sceneWordsMap[sceneId] || [];

    const code = fs.readFileSync(file, "utf-8");
    const result = lintSceneCode(code, filename, words);

    if (result.errors.length > 0 || result.warnings.length > 0) {
      console.log(`📄 ${filename}:`);
      result.errors.forEach((err) => {
        console.error(`  ✖ Line ${err.line ?? "?"} [${err.code}]: ${err.message}`);
        if (err.snippet) console.error(`    | ${err.snippet}`);
      });
      result.warnings.forEach((warn) => {
        console.warn(`  ⚠️ Line ${warn.line ?? "?"} [${warn.code}]: ${warn.message}`);
        if (warn.snippet) console.warn(`    | ${warn.snippet}`);
      });
      console.log();
    } else {
      console.log(`✓ ${filename}: PASS`);
    }

    totalErrors += result.errors.length;
    totalWarnings += result.warnings.length;
  }

  if (totalErrors > 0) {
    console.error(`\n❌ Scene lint failed with ${totalErrors} error(s) and ${totalWarnings} warning(s).\n`);
    process.exit(1);
  }

  console.log(`\n✨ All scene files passed static analysis! (${totalWarnings} warnings)\n`);
}

main().catch((err) => {
  console.error(`\n❌ Lint error: ${err.message}\n`);
  process.exit(1);
});
