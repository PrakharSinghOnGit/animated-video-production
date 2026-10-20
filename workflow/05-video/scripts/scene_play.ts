import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { resolveJobPaths } from "../src/lib/workspaceBridge";

function parseArgs() {
  const args = process.argv.slice(2);
  let videoId: string | undefined;
  let sceneId: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--video" || args[i] === "-v") {
      videoId = args[i + 1];
      i++;
    } else if (args[i] === "--scene" || args[i] === "-s") {
      sceneId = args[i + 1];
      i++;
    } else if (!args[i].startsWith("-")) {
      if (!videoId) videoId = args[i];
      else if (!sceneId) sceneId = args[i];
    }
  }

  return {
    videoId: videoId || process.env.ACTIVE_VIDEO || "VID01_Currency_Market",
    sceneId: sceneId || "S01",
  };
}

async function main() {
  const { videoId, sceneId } = parseArgs();
  const paths = resolveJobPaths(videoId);

  console.log(`\n========================================`);
  console.log(`Rendering Fast Preview MP4 for ${sceneId} (${paths.jobId})`);
  console.log(`========================================`);

  const reviewDir = path.join(paths.outputDir, "review", sceneId);
  fs.mkdirSync(reviewDir, { recursive: true });
  const outputFile = path.join(reviewDir, "preview.mp4");

  const workspaceSrc = path.join(paths.outputDir, "src");
  const workspaceEntry = path.join(workspaceSrc, "index.ts");
  const rootEntry = path.join(workspaceSrc, "Root.tsx");
  const templateDir = path.resolve(process.cwd(), "workflow/05-video/template");

  // Auto-scaffold Remotion root if missing or corrupt
  if (fs.existsSync(templateDir) && (!fs.existsSync(rootEntry) || !fs.existsSync(workspaceEntry) || !fs.readFileSync(workspaceEntry, "utf-8").includes("registerRoot"))) {
    fs.mkdirSync(workspaceSrc, { recursive: true });
    fs.copyFileSync(path.join(templateDir, "src", "Root.tsx"), rootEntry);
    fs.copyFileSync(path.join(templateDir, "src", "Main.tsx"), path.join(workspaceSrc, "Main.tsx"));
    fs.copyFileSync(path.join(templateDir, "src", "index.ts"), workspaceEntry);
  }

  const entryFile = fs.existsSync(workspaceEntry)
    ? workspaceEntry
    : "workflow/05-video/src/index.ts";

  const publicDir = path.join(paths.outputDir, "public");
  const publicDirFlag = fs.existsSync(publicDir) ? ` --public-dir="${publicDir}"` : "";

  console.log(`Rendering scene ${sceneId} at 0.5x scale (CRF 28, 30fps)...`);

  const cmd = `bunx remotion render ${entryFile} ${sceneId} "${outputFile}" --scale=0.5 --crf=28 --gl=angle${publicDirFlag} --log=warn`;

  try {
    const t0 = performance.now();
    execSync(cmd, { stdio: "inherit" });
    const durSec = ((performance.now() - t0) / 1000).toFixed(1);
    console.log(`\n✓ Preview rendered in ${durSec}s: ${outputFile}\n`);
  } catch (err: any) {
    console.error(`❌ Failed to render preview MP4: ${err.message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
