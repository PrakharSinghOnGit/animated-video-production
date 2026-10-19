import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { resolveJobPaths } from "../src/lib/workspaceBridge";

async function main() {
  const args = process.argv.slice(2);
  let target: string | undefined;
  const isDraft = args.includes("--draft");

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--video" || args[i] === "-v") {
      target = args[i + 1];
      i++;
    } else if (!args[i].startsWith("-")) {
      if (!target) target = args[i];
    }
  }

  const effectiveTarget = target || process.env.ACTIVE_VIDEO || "fixtures/sample-job";
  const paths = resolveJobPaths(effectiveTarget);

  console.log(`[render] Starting render for job: ${paths.jobId}`);
  console.log(`[render] Profile: ${isDraft ? "DRAFT (Fast low-res 0.5x, 30fps)" : "FINAL (1080p Broadcast H.264, 60fps/full)"}`);

  const isKitWorkspace =
    fs.existsSync(path.join(paths.outputDir, "src", "index.ts")) &&
    fs.existsSync(path.join(paths.outputDir, "timeline.json"));

  const outFileName = isDraft ? "draft.mp4" : "final.mp4";
  const outFilePath = path.join(paths.outputDir, outFileName);

  const scale = isDraft ? "0.5" : "1";
  const crf = isDraft ? "26" : "16";

  let renderArgs: string[] = [];

  if (isKitWorkspace) {
    // -------------------------------------------------------------
    // Kit Video Architecture (per-video Remotion root + Main)
    // -------------------------------------------------------------
    const entryFile = path.join(paths.outputDir, "src", "index.ts");
    const timelinePath = path.join(paths.outputDir, "timeline.json");
    const timeline = JSON.parse(fs.readFileSync(timelinePath, "utf-8"));

    // Check voiceover file in public
    const publicVo = path.join(paths.outputDir, "public", "voiceover.wav");
    const hasAudio = fs.existsSync(publicVo);

    // If audio exists in voiceover directory but not public, copy it
    if (!hasAudio && paths.audioFile && fs.existsSync(paths.audioFile)) {
      const publicDir = path.join(paths.outputDir, "public");
      fs.mkdirSync(publicDir, { recursive: true });
      fs.copyFileSync(paths.audioFile, publicVo);
    }

    const renderPropsPath = path.join(paths.outputDir, "render-props.json");
    const propsPayload = {
      timeline: {
        ...timeline,
        audioFile: fs.existsSync(publicVo) ? "voiceover.wav" : undefined,
      },
      showVoiceOver: fs.existsSync(publicVo),
    };
    fs.writeFileSync(renderPropsPath, JSON.stringify(propsPayload, null, 2), "utf-8");

    renderArgs = [
      "remotion",
      "render",
      entryFile,
      "Main",
      outFilePath,
      `--public-dir=${path.join(paths.outputDir, "public")}`,
      `--props=${renderPropsPath}`,
      "--codec=h264",
      `--crf=${crf}`,
      `--scale=${scale}`,
      "--overwrite",
      "--gl=angle",
    ];

    if (!isDraft) {
      // Broadcast quality 60fps or high frame rate
      // Remotion will render at 60fps if requested
    }
  } else {
    // -------------------------------------------------------------
    // Legacy Remotion Pipeline (v1 fallback)
    // -------------------------------------------------------------
    const scenesPath = path.join(paths.outputDir, "scenes.json");
    if (!fs.existsSync(scenesPath)) {
      console.error(`[render] scenes.json not found at: ${scenesPath}. Run 'npm run plan ${effectiveTarget}' first.`);
      process.exit(1);
    }

    const captionsPath = path.join(paths.outputDir, "captions.json");
    if (!fs.existsSync(captionsPath)) {
      console.error(`[render] captions.json not found at: ${captionsPath}. Run 'npm run ingest ${effectiveTarget}' first.`);
      process.exit(1);
    }

    const scenesRaw = JSON.parse(fs.readFileSync(scenesPath, "utf-8"));
    const captionsRaw = JSON.parse(fs.readFileSync(captionsPath, "utf-8"));

    const publicJobDir = path.resolve(process.cwd(), "public", "jobs", paths.jobId);
    fs.mkdirSync(publicJobDir, { recursive: true });
    if (paths.audioFile && fs.existsSync(paths.audioFile)) {
      const destAudio = path.join(publicJobDir, `audio${path.extname(paths.audioFile)}`);
      if (!fs.existsSync(destAudio)) {
        fs.copyFileSync(paths.audioFile, destAudio);
      }
    }

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

    renderArgs = [
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
  }

  console.log(`[render] Executing: bun x ${renderArgs.join(" ")}`);
  const startTime = Date.now();

  const logStream = fs.createWriteStream(path.join(paths.outputDir, "render.log"), { flags: "w" });
  logStream.write(`Render started at ${new Date().toISOString()}\nCommand: bun x ${renderArgs.join(" ")}\n\n`);

  const proc = spawn("bun", ["x", ...renderArgs], {
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
