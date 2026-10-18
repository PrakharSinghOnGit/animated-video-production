import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { resolveJobPaths } from "../src/lib/workspaceBridge";
import { msToFrames } from "../src/lib/timing";

async function main() {
  const args = process.argv.slice(2);
  const target = args.find((a) => !a.startsWith("-")) || "fixtures/sample-job";
  const renderAll = args.includes("--all");
  const sceneId = args.find((a) => a !== target && !a.startsWith("-"));

  const paths = resolveJobPaths(target);
  const scenesPath = path.join(paths.outputDir, "scenes.json");

  if (!fs.existsSync(scenesPath)) {
    console.error(`❌ scenes.json not found at ${scenesPath}. Run plan first.`);
    process.exit(1);
  }

  const scenesData = JSON.parse(fs.readFileSync(scenesPath, "utf-8"));

  if (!sceneId && !renderAll) {
    console.log(`
🎬 Chunk Render: Render Individual Scenes Separately

Available Scenes for ${paths.jobId}:
${scenesData.scenes.map((s: any) => `  - ${s.id} (${((s.endMs - s.startMs) / 1000).toFixed(1)}s): ${s.chapter || s.voLine.slice(0, 45) + "..."}`).join("\n")}

Usage:
  bun scripts/chunk.ts <job-id> <scene-id>    # Render a single scene
  bun scripts/chunk.ts <job-id> --all         # Render all scenes into chunks/

Example:
  bun scripts/chunk.ts ${paths.jobId} ${scenesData.scenes[0]?.id || "s01"}
`);
    process.exit(0);
  }

  const chunksDir = path.join(paths.outputDir, "chunks");
  fs.mkdirSync(chunksDir, { recursive: true });

  const captionsPath = path.join(paths.outputDir, "captions.json");
  const captions = fs.existsSync(captionsPath)
    ? JSON.parse(fs.readFileSync(captionsPath, "utf-8"))
    : [];

  const scenesToRender = renderAll
    ? scenesData.scenes
    : scenesData.scenes.filter((s: any) => s.id === (sceneId || "").replace(/^Scene-/, ""));

  if (scenesToRender.length === 0) {
    console.error(`❌ Scene "${sceneId}" not found in ${scenesPath}.`);
    console.log(`Available: ${scenesData.scenes.map((s: any) => s.id).join(", ")}`);
    process.exit(1);
  }

  console.log(`\n======================================================`);
  console.log(`🎬 CHUNK RENDERER: Rendering ${scenesToRender.length} scene(s) for ${paths.jobId}`);
  console.log(`======================================================\n`);

  for (let i = 0; i < scenesToRender.length; i++) {
    const scene = scenesToRender[i];
    const cleanSceneId = scene.id;
    const durFrames = Math.max(1, msToFrames(scene.endMs - scene.startMs, 30));
    const outPath = path.join(chunksDir, `${cleanSceneId}.mp4`);

    console.log(`[${i + 1}/${scenesToRender.length}] Scene: ${cleanSceneId} (${scene.chapter || "Untitled"}) | ${durFrames} frames (${(durFrames / 30).toFixed(2)}s)`);

    const chunkPropsPath = path.join(chunksDir, `props-${cleanSceneId}.json`);
    fs.writeFileSync(
      chunkPropsPath,
      JSON.stringify(
        {
          scene,
          captions,
          hasCaptions: true,
        },
        null,
        2
      ),
      "utf-8"
    );

    const cmd = `bun x remotion render SingleScene "${outPath}" --props="${chunkPropsPath}" --codec=h264 --crf=18 --overwrite --gl=angle`;
    execSync(cmd, { stdio: "inherit" });
    console.log(`✅ Saved chunk: ${outPath}\n`);
  }

  console.log(`\n🎉 All ${scenesToRender.length} chunk(s) rendered in: ${chunksDir}\n`);
}

main().catch((err) => {
  console.error("Chunk render error:", err);
  process.exit(1);
});
