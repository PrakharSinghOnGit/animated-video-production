import fs from "node:fs";
import { recordTiming } from "../src/lib/timings";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { resolveJobPaths } from "../src/lib/workspaceBridge";
import { currentMix } from "../src/lib/freshness";
import { checkSceneCoverage, writeRenderManifest } from "../src/lib/sceneCoverage";
import { keepAwake } from "../../lib/awake";
import { tryRefreshLibrary } from "../../../scripts/library";
keepAwake();  // a long run: the Mac must not sleep mid-way (workflow/lib/awake.ts)

const REPO_ROOT = path.resolve(import.meta.dir, "../../..");

async function main() {
  const args = process.argv.slice(2);
  let target: string | undefined;
  const isDraft = args.includes("--draft");
  const allowPlaceholders = args.includes("--allow-placeholders");
  const flag = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  // Finals only: --res 1080|1440|2160 (acts draw at 1920x1080, so higher is a lanczos upscale) and --audio mix|voice|none.
  const res = Number(flag("--res") ?? 1080);
  const audio = (flag("--audio") ?? "mix") as AudioMode;
  if (![1080, 1440, 2160].includes(res)) { console.error("--res must be 1080, 1440 or 2160"); process.exit(1); }
  if (!["mix", "voice", "none"].includes(audio)) { console.error("--audio must be mix, voice or none"); process.exit(1); }
  // --concurrency N: Chrome tabs rendering in parallel (default: Remotion's, half the CPU cores). Fewer = less memory, slower.
  const concurrency = flag("--concurrency");
  // Drafts only: --scale 1|0.5|0.25 of the timeline size (default 0.5 = 960x540; 0.25 = 480x270, fastest, to check timing)
  const draftScale = flag("--scale") ?? "0.5";
  if (!["1", "0.5", "0.25"].includes(draftScale)) { console.error("--scale must be 1, 0.5 or 0.25"); process.exit(1); }
  if (concurrency !== undefined && !(Number(concurrency) >= 1 && Number(concurrency) <= 16)) { console.error("--concurrency must be 1-16"); process.exit(1); }

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--res" || args[i] === "--audio" || args[i] === "--concurrency" || args[i] === "--scale") { i++; continue; }
    if (args[i] === "--video" || args[i] === "-v") {
      target = args[i + 1];
      i++;
    } else if (!args[i].startsWith("-")) {
      if (!target) target = args[i];
    }
  }

  const effectiveTarget = target || process.env.ACTIVE_VIDEO;
  if (!effectiveTarget) {
    console.error("Usage: bun run render --video <ID>  (or set ACTIVE_VIDEO)");
    process.exit(1);
  }
  const paths = resolveJobPaths(effectiveTarget);

  console.log(`[render] Starting render for job: ${paths.jobId}`);
  console.log(`[render] Profile: ${isDraft ? `DRAFT (${draftScale}x, 30fps)` : `FINAL (${res}p H.264, audio: ${audio})`}`);

  const isKitWorkspace =
    fs.existsSync(path.join(paths.outputDir, "src", "index.ts")) &&
    fs.existsSync(path.join(paths.outputDir, "timeline.json"));

  const outFileName = isDraft ? "draft.mp4" : "final.mp4";
  const outFilePath = path.join(paths.outputDir, outFileName);

  const scale = isDraft ? draftScale : "1";
  const crf = isDraft ? "26" : "16";

  let renderArgs: string[] = [];
  let vertical = false;   // a 9:16 short (timeline 1080x1920)

  if (isKitWorkspace) {
    // -------------------------------------------------------------
    // Kit Video Architecture (per-video Remotion root + Main)
    // -------------------------------------------------------------
    // Always regenerate the scene registry first, so a render can never use a stale
    // index.ts (VID02's final.mp4 was rendered before assemble and came out all placeholders).
    console.log(`[render] Regenerating scene registry (assemble)...`);
    const assemble = spawnSync(
      "bun",
      ["run", path.join(REPO_ROOT, "workflow/05-video/scripts/assemble.ts"), "--video", effectiveTarget],
      { cwd: REPO_ROOT, stdio: "inherit", env: process.env }
    );
    if (assemble.status !== 0) {
      console.error(`[render] assemble failed (exit ${assemble.status}); refusing to render.`);
      process.exit(1);
    }

    const coverage = checkSceneCoverage(paths.outputDir);
    if (coverage.missing.length > 0) {
      const ids = coverage.missing.map((m) => m.id).join(", ");
      const msg = `${coverage.missing.length}/${coverage.total} scenes are not authored and would render as placeholders: ${ids}`;
      if (!isDraft && !allowPlaceholders) {
        console.error(`\n❌ [render] ${msg}`);
        console.error(`   Author the missing scenes, or pass --allow-placeholders to override.`);
        process.exit(1);
      }
      console.warn(`\n⚠️  [render] ${msg}\n`);
    }

    const entryFile = path.join(paths.outputDir, "src", "index.ts");
    const timelinePath = path.join(paths.outputDir, "timeline.json");
    let timeline = JSON.parse(fs.readFileSync(timelinePath, "utf-8"));
    vertical = timeline.height > timeline.width;

    // Check voiceover file in public and keep it synchronized with master audio
    const publicVo = path.join(paths.outputDir, "public", "voiceover.wav");
    const hasAudio = fs.existsSync(publicVo);

    if (paths.audioFile && fs.existsSync(paths.audioFile)) {
      const masterSize = fs.statSync(paths.audioFile).size;
      const publicSize = hasAudio ? fs.statSync(publicVo).size : 0;
      if (!hasAudio || publicSize !== masterSize) {
        const publicDir = path.join(paths.outputDir, "public");
        fs.mkdirSync(publicDir, { recursive: true });
        fs.copyFileSync(paths.audioFile, publicVo);
        console.log(`[render] Synchronized master voiceover to public/voiceover.wav (${(masterSize / (1024 * 1024)).toFixed(1)} MB)`);
      }
    }

    // no transition plan (never planned, or assemble dropped an out-of-date one): plan it now, or every cut is a jump
    if (timeline.scenes.length > 1 && !timeline.scenes.some((s: any) => s.seams)) {
      console.log("[render] no transition plan in timeline.json: planning the seams first (bun run seams --plan-only)");
      const sp = spawnSync("bun", ["run", path.join(REPO_ROOT, "workflow/05-video/scripts/seams.ts"), "--video", effectiveTarget, "--plan-only"], { cwd: REPO_ROOT, stdio: "inherit", env: process.env });
      if (sp.status !== 0) { console.error(`[render] planning the seams failed (exit ${sp.status}); refusing to render plain cuts.`); process.exit(1); }
      timeline = JSON.parse(fs.readFileSync(path.join(paths.outputDir, "timeline.json"), "utf-8"));
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
      ...(concurrency ? [`--concurrency=${concurrency}`] : []),
    ];

  } else {
    console.error(`[render] ${paths.outputDir} is not a kit workspace (needs src/index.ts and timeline.json). Run direct -> assemble first.`);
    process.exit(1);
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
      finishAudio(outFilePath, paths.outputDir, isDraft, isDraft ? 1080 : res, isDraft ? "mix" : audio, vertical);
      recordTiming(path.dirname(paths.outputDir), { step: isDraft ? "render draft" : "render final", ms: Date.now() - startTime });
      const stats = fs.statSync(outFilePath);
      const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
      console.log(`\n✅ Render succeeded in ${elapsedSec}s!`);
      console.log(`   File: ${outFilePath}`);
      console.log(`   Size: ${sizeMB} MB`);
      if (isKitWorkspace) {
        const manifest = writeRenderManifest(paths.outputDir, outFilePath, isDraft ? "draft" : "final");
        console.log(`   Manifest: ${manifest.sceneCount - manifest.missingScenes.length}/${manifest.sceneCount} scenes authored`);
      }
      process.exit(0);
    } else {
      console.error(`\n❌ Render failed with code ${code} after ${elapsedSec}s`);
      process.exit(code ?? 1);
    }
  });
}

type AudioMode = "mix" | "voice" | "none";

/** 06-audio/mix.wav, when it was built from the current voice. */
function pickMixFile(audioDir: string): string {
  // only a mix built from the current voice; an older one would put the old narration under the new picture
  const cm = currentMix(path.dirname(audioDir));
  if (!cm.file) { console.log(`[render] ⚠️ audio: ${cm.note}; keeping the voice-only track`); return path.join(audioDir, "__no_current_mix__.wav"); }
  console.log("[render] audio: mix.wav (auto mix)");
  return cm.file;
}

/**
 * One ffmpeg pass after Remotion: swap in the full mix (06-audio/mix.wav) when it exists, keep the voice-only track, or
 * drop audio; upscale finals to 1440p/2160p (lanczos) and add film grain: grain drawn per frame would make every frame
 * slow and incompressible. Drafts keep the voice-only track if there is no mix, and get no grain.
 */
function finishAudio(videoPath: string, outputDir: string, isDraft: boolean, res = 1080, audio: AudioMode = "mix", vertical = false): void {
  const mixFile = pickMixFile(path.join(path.dirname(outputDir), "06-audio"));
  const mix = audio === "mix" && fs.existsSync(mixFile);
  const grain = isDraft ? 0 : parseFloat(process.env.WG_GRAIN ?? "3");
  const vf = [res > 1080 ? (vertical ? `scale=${res}:-2:flags=lanczos` : `scale=-2:${res}:flags=lanczos`) : "", grain > 0 ? `noise=alls=${grain}:allf=t` : ""].filter(Boolean);
  if (!mix && !vf.length && audio !== "none") return;
  const tmp = videoPath.replace(/\.mp4$/, ".mux.mp4");
  const ff = ["-v", "error", "-y", "-i", videoPath];
  // mix.wav ends before the video (end-card hold): pad it with silence, -shortest then stops at the video. The voice track comes from Remotion at full length.
  const pad = ["-af", "apad", "-shortest"];
  if (mix) ff.push("-i", mixFile, "-map", "0:v", "-map", "1:a", ...pad);
  else ff.push("-map", "0:v", ...(audio === "none" ? [] : ["-map", "0:a?"]));
  if (vf.length) ff.push("-vf", vf.join(","), "-c:v", "libx264", "-crf", res > 1080 ? "18" : "21", "-preset", "medium", "-pix_fmt", "yuv420p");
  else ff.push("-c:v", "copy");
  ff.push(...(audio === "none" ? ["-an"] : ["-c:a", "aac", "-b:a", "256k"]), tmp);
  const t0 = Date.now();
  const r = spawnSync("ffmpeg", ff, { encoding: "utf-8" });
  if (r.status !== 0) {
    console.error(`[render] ⚠️ audio/grain pass failed, keeping the plain render:\n${r.stderr}`);
    return;
  }
  fs.renameSync(tmp, videoPath);
  const what = audio === "none" ? "No audio" : mix ? "Mixed audio (voice+music+foley)" : "Voice audio";
  console.log(`[render] ${what}${res > 1080 ? ` + ${res}p upscale` : ""}${grain > 0 ? ` + grain ${grain}` : ""} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().then(() => { if (!process.argv.includes("--draft")) tryRefreshLibrary(); }).catch((err) => {
  console.error("[render] Fatal error:", err);
  process.exit(1);
});
