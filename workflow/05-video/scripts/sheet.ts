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
    sceneId,
  };
}

function generateLayout(total: number, cols: number): string {
  const layouts: string[] = [];
  for (let i = 0; i < total; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col === 0 ? "0" : `w0*${col}`;
    const y = row === 0 ? "0" : `h0*${row}`;
    layouts.push(`${x}_${y}`);
  }
  return layouts.join("|");
}

async function main() {
  const { videoId, sceneId } = parseArgs();
  const paths = resolveJobPaths(videoId);

  console.log(`\n========================================`);
  console.log(`Generating Contact Sheet for: ${paths.jobId}`);
  console.log(`========================================`);

  const reviewDir = path.join(paths.outputDir, "review");
  let targetDir = reviewDir;
  let outputFile = path.join(reviewDir, "contact-sheet.png");

  if (sceneId) {
    targetDir = path.join(reviewDir, sceneId);
    outputFile = path.join(targetDir, "contact-sheet.png");
  }

  if (!fs.existsSync(targetDir)) {
    console.error(`❌ Directory not found: ${targetDir}. Run "bun run still" first.`);
    process.exit(1);
  }

  // Find all PNG stills in targetDir (recursively if sceneId not specified)
  let imageFiles: string[] = [];
  if (sceneId) {
    imageFiles = fs
      .readdirSync(targetDir)
      .filter((f) => f.startsWith("still_") && f.endsWith(".png"))
      .sort()
      .map((f) => path.join(targetDir, f));
  } else {
    // Scan all scene review folders
    const subdirs = fs.readdirSync(reviewDir).filter((d) => fs.statSync(path.join(reviewDir, d)).isDirectory());
    for (const d of subdirs) {
      const dPath = path.join(reviewDir, d);
      const files = fs
        .readdirSync(dPath)
        .filter((f) => f.startsWith("still_") && f.endsWith(".png"))
        .sort()
        .map((f) => path.join(dPath, f));
      imageFiles.push(...files);
    }
  }

  if (imageFiles.length === 0) {
    console.error(`❌ No stills found in ${targetDir}. Run "bun run still" first.`);
    process.exit(1);
  }

  console.log(`Found ${imageFiles.length} still(s). Tiling into ${outputFile}...`);

  const cols = Math.min(3, imageFiles.length);
  const inputArgs: string[] = [];
  const filterInputs: string[] = [];

  imageFiles.forEach((file, index) => {
    inputArgs.push("-i", file);
    filterInputs.push(`[${index}:v]scale=960:540[v${index}]`);
  });

  const vList = imageFiles.map((_, i) => `[v${i}]`).join("");
  const layout = generateLayout(imageFiles.length, cols);
  const filterComplex = `${filterInputs.join(";")};${vList}xstack=inputs=${imageFiles.length}:layout=${layout}[out]`;

  const ffmpegCmd = `ffmpeg -y ${inputArgs.join(" ")} -filter_complex "${filterComplex}" -map "[out]" -update 1 -frames:v 1 "${outputFile}"`;

  try {
    execSync(ffmpegCmd, { stdio: "inherit" });
    console.log(`\n✓ Contact sheet generated successfully at: ${outputFile}\n`);
  } catch (err: any) {
    console.error(`❌ Failed to tile contact sheet: ${err.message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
