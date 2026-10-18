import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { resolveJobPaths } from "../src/lib/workspaceBridge";

async function main() {
  const args = process.argv.slice(2);
  const target = args.find((a) => !a.startsWith("-")) || "fixtures/sample-job";
  const isDraft = args.includes("--draft");

  const paths = resolveJobPaths(target);
  console.log(`[render] Starting render for job: ${paths.jobId}`);
  console.log(`[render] Profile: ${isDraft ? "DRAFT (Fast low-res 0.5x)" : "FINAL (1080p Broadcast H.264)"}`);

  const scenesPath = path.join(paths.outputDir, "scenes.json");
  if (!fs.existsSync(scenesPath)) {
    console.error(`[render] scenes.json not found at: ${scenesPath}. Run 'npm run plan ${target}' first.`);
    process.exit(1);
  }

  const captionsPath = path.join(paths.outputDir, "captions.json");
  if (!fs.existsSync(captionsPath)) {
    console.error(`[render] captions.json not found at: ${captionsPath}. Run 'npm run ingest ${target}' first.`);
    process.exit(1);
  }

  const scenesRaw = JSON.parse(fs.readFileSync(scenesPath, "utf-8"));
  const captionsRaw = JSON.parse(fs.readFileSync(captionsPath, "utf-8"));

  // Ensure public/jobs/<jobId> has audio and captions mirrored
  const publicJobDir = path.resolve(process.cwd(), "public", "jobs", paths.jobId);
  fs.mkdirSync(publicJobDir, { recursive: true });
  if (paths.audioFile && fs.existsSync(paths.audioFile)) {
    const destAudio = path.join(publicJobDir, `audio${path.extname(paths.audioFile)}`);
    if (!fs.existsSync(destAudio)) {
      fs.copyFileSync(paths.audioFile, destAudio);
    }
  }

  // Create props file for Remotion CLI
  const ext = paths.audioFile ? path.extname(paths.audioFile) : ".mp3";
  const renderPropsPath = path.join(paths.outputDir, "render-props.json");
  const propsPayload = {
    jobId: paths.jobId,
    scenes: scenesRaw.scenes,
    captions: captionsRaw,
    audioSrc: `jobs/${paths.jobId}/audio${ext}`,
    showCaptions: true,
    captionStyle: "clean-bottom",
  };
  fs.writeFileSync(renderPropsPath, JSON.stringify(propsPayload, null, 2), "utf-8");

  // Output video path
  const outFileName = isDraft ? "draft.mp4" : "final.mp4";
  const outFilePath = path.join(paths.outputDir, outFileName);

  const scale = isDraft ? "0.5" : "1";
  const crf = isDraft ? "26" : "16";

  const renderArgs = [
    "remotion",
    "render",
    "Main",
    outFilePath,
    `--props=${renderPropsPath}`,
    "--codec=h264",
    `--crf=${crf}`,
    `--scale=${scale}`,
    "--overwrite",
    "--gl=angle",
  ];

  console.log(`[render] Executing: npx ${renderArgs.join(" ")}`);
  const startTime = Date.now();

  const logStream = fs.createWriteStream(path.join(paths.outputDir, "render.log"), { flags: "w" });
  logStream.write(`Render started at ${new Date().toISOString()}\nCommand: npx ${renderArgs.join(" ")}\n\n`);

  const proc = spawn("npx", renderArgs, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  proc.stdout.on("data", (data) => {
    process.stdout.write(data);
    logStream.write(data);
  });

  proc.stderr.on("data", (data) => {
    process.stderr.write(data);
    logStream.write(data);
  });

  proc.on("close", (code) => {
    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
    logStream.write(`\nRender finished in ${elapsedSec}s with exit code ${code}\n`);
    logStream.end();

    if (code === 0) {
      const stats = fs.statSync(outFilePath);
      const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
      console.log(`\n✅ Render succeeded in ${elapsedSec}s!`);
      console.log(`   File: ${outFilePath}`);
      console.log(`   Size: ${sizeMB} MB`);
      process.exit(0);
    } else {
      console.error(`\n❌ Render failed with code ${code} after ${elapsedSec}s`);
      process.exit(code ?? 1);
    }
  });
}

main().catch((err) => {
  console.error("[render] Fatal error:", err);
  process.exit(1);
});
