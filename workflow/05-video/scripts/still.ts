import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { resolveJobPaths } from "../src/lib/workspaceBridge";

function parseArgs() {
  const args = process.argv.slice(2);
  let videoId: string | undefined;
  let sceneId: string | undefined;
  let atStr = "enter,anchors,mid,exit";
  let explicitFrames: number[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--video" || args[i] === "-v") {
      videoId = args[i + 1];
      i++;
    } else if (args[i] === "--scene" || args[i] === "-s") {
      sceneId = args[i + 1];
      i++;
    } else if (args[i] === "--at") {
      atStr = args[i + 1];
      i++;
    } else if (args[i] === "--frame" || args[i] === "-f") {
      explicitFrames = args[i + 1].split(",").map((n) => parseInt(n.trim(), 10));
      i++;
    } else if (!args[i].startsWith("-")) {
      if (!videoId) videoId = args[i];
      else if (!sceneId) sceneId = args[i];
    }
  }

  return {
    videoId: videoId || process.env.ACTIVE_VIDEO || "VID01_Currency_Market",
    sceneId: sceneId || "S01",
    atStr,
    explicitFrames,
  };
}

async function main() {
  const { videoId, sceneId, atStr, explicitFrames } = parseArgs();
  const paths = resolveJobPaths(videoId);

  console.log(`\n========================================`);
  console.log(`Rendering Stills for ${sceneId} (${paths.jobId})`);
  console.log(`========================================`);

  // Read timeline.json
  const timelinePath = path.join(paths.outputDir, "timeline.json");
  if (!fs.existsSync(timelinePath)) {
    console.error(`❌ Missing timeline.json in ${paths.outputDir}. Run "bun run timeline" first.`);
    process.exit(1);
  }

  const timeline = JSON.parse(fs.readFileSync(timelinePath, "utf-8"));
  const scene = timeline.scenes.find(
    (s: any) => s.id.toUpperCase() === sceneId.toUpperCase()
  );

  if (!scene) {
    console.error(`❌ Scene "${sceneId}" not found in timeline.json`);
    process.exit(1);
  }

  const reviewDir = path.join(paths.outputDir, "review", scene.id);
  fs.mkdirSync(reviewDir, { recursive: true });

  // Calculate frames to render
  const framesToCapture: { frame: number; label: string }[] = [];

  if (explicitFrames.length > 0) {
    explicitFrames.forEach((f) => framesToCapture.push({ frame: f, label: "explicit" }));
  } else {
    const atTokens = atStr.split(",").map((t) => t.trim().toLowerCase());

    if (atTokens.includes("enter")) {
      framesToCapture.push({ frame: 0, label: "enter" });
      if (scene.voiceStartFrame > 0) {
        framesToCapture.push({ frame: scene.voiceStartFrame, label: "voiceStart" });
      }
    }
    if (atTokens.includes("anchors")) {
      // Find anchor beats from storyboard if available
      const storyboardPath = path.join(paths.outputDir, "storyboard.json");
      if (fs.existsSync(storyboardPath)) {
        try {
          const sb = JSON.parse(fs.readFileSync(storyboardPath, "utf-8"));
          const sbScene = sb.scenes.find((s: any) => s.id.toUpperCase() === scene.id.toUpperCase());
          if (sbScene && sbScene.beats) {
            for (const beat of sbScene.beats) {
              const matchedWord = scene.words.find(
                (w: any) => w.text.toLowerCase().replace(/[^a-z0-9]/g, "") === beat.anchor.toLowerCase().replace(/[^a-z0-9]/g, "")
              );
              if (matchedWord) {
                const targetF = Math.max(0, matchedWord.startFrame + Math.round(((beat.offsetMs || 0) / 1000) * timeline.fps));
                framesToCapture.push({ frame: targetF, label: `anchor_${beat.anchor}` });
              }
            }
          }
        } catch {}
      }
    }
    if (atTokens.includes("mid")) {
      framesToCapture.push({ frame: Math.round(scene.durationFrames / 2), label: "mid" });
    }
    if (atTokens.includes("exit")) {
      framesToCapture.push({ frame: Math.max(0, scene.durationFrames - 1), label: "exit" });
    }
  }

  // Deduplicate and sort frames
  const uniqueFrames = Array.from(
    new Map(framesToCapture.map((item) => [item.frame, item])).values()
  ).sort((a, b) => a.frame - b.frame);

  console.log(`Capturing ${uniqueFrames.length} frame(s) for scene ${scene.id} (duration: ${scene.durationFrames} frames):`);

  // Target entry file & workspace template validation
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

  for (const { frame, label } of uniqueFrames) {
    // Find nearest word
    let nearestWord = "silence";
    let minDiff = Infinity;
    for (const w of scene.words) {
      const diff = Math.abs(frame - w.startFrame);
      if (diff < minDiff) {
        minDiff = diff;
        nearestWord = w.text.replace(/[^a-zA-Z0-9]/g, "");
      }
    }

    const paddedFrame = String(frame).padStart(4, "0");
    const filename = `still_f${paddedFrame}_${label}_${nearestWord}.png`;
    const outPath = path.join(reviewDir, filename);

    console.log(`  - Frame ${paddedFrame} (${label}, near "${nearestWord}") -> ${filename}`);

    const cmd = `bunx remotion still ${entryFile} ${scene.id} ${outPath} --frame ${frame}${publicDirFlag} --log=warn`;
    try {
      execSync(cmd, { stdio: "inherit" });
    } catch (e: any) {
      console.warn(`    ⚠️ Failed to render frame ${frame}: ${e.message}`);
    }
  }

  console.log(`\n✓ Stills saved to: ${reviewDir}\n`);
}

main().catch((err) => {
  console.error(`\n❌ Still rendering failed: ${err.message}\n`);
  process.exit(1);
});
