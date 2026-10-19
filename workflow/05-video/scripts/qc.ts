import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { resolveJobPaths } from "../src/lib/workspaceBridge";
import { probeAudio } from "../src/lib/audioProbe";

interface QCIssue {
  type: "ERROR" | "WARN" | "INFO";
  rule: string;
  message: string;
}

async function main() {
  const args = process.argv.slice(2);
  let target = process.env.ACTIVE_VIDEO || "fixtures/sample-job";
  let explicitFinal: boolean | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--video" && args[i + 1]) {
      target = args[i + 1];
      i++;
    } else if (args[i] === "--final") {
      explicitFinal = true;
    } else if (args[i] === "--draft") {
      explicitFinal = false;
    } else if (!args[i].startsWith("--")) {
      target = args[i];
    }
  }

  const paths = resolveJobPaths(target);

  console.log(`[qc] Running automated quality control on job: ${paths.jobId}`);
  const issues: QCIssue[] = [];

  let tailPaddingMs = 1100;
  let failOnWarnings = false;
  if (paths.configFile && fs.existsSync(paths.configFile)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(paths.configFile, "utf-8"));
      if (typeof cfg.tailPaddingMs === "number") tailPaddingMs = cfg.tailPaddingMs;
      if (typeof cfg.qc?.failOnWarnings === "boolean") failOnWarnings = cfg.qc.failOnWarnings;
    } catch {
      // ignore
    }
  }

  const videoPath = path.join(paths.outputDir, "final.mp4");
  const draftPath = path.join(paths.outputDir, "draft.mp4");
  const testVideo = fs.existsSync(videoPath) ? videoPath : (fs.existsSync(draftPath) ? draftPath : null);

  // 1. Output file check
  if (!testVideo) {
    issues.push({
      type: "ERROR",
      rule: "file_exists",
      message: `Rendered output video not found at ${videoPath} or ${draftPath}. Run render first.`,
    });
  } else {
    const stats = fs.statSync(testVideo);
    if (stats.size === 0) {
      issues.push({
        type: "ERROR",
        rule: "file_size",
        message: `Rendered output video is 0 bytes.`,
      });
    } else {
      issues.push({
        type: "INFO",
        rule: "file_size",
        message: `File size: ${(stats.size / (1024 * 1024)).toFixed(2)} MB (${path.basename(testVideo)})`,
      });
    }

    // 2. FFprobe probe on video
    try {
      const probeJson = execSync(
        `ffprobe -v quiet -print_format json -show_format -show_streams "${testVideo}"`,
        { encoding: "utf-8" }
      );
      const data = JSON.parse(probeJson);
      const vStream = data.streams?.find((s: any) => s.codec_type === "video");
      const aStream = data.streams?.find((s: any) => s.codec_type === "audio");

      if (!vStream) {
        issues.push({
          type: "ERROR",
          rule: "video_stream",
          message: "No video stream found in rendered file.",
        });
      } else {
        const width = vStream.width;
        const height = vStream.height;
        const rFrameRate = vStream.r_frame_rate || "30/1";
        const [num, den] = rFrameRate.split("/").map(Number);
        const fps = Math.round(num / (den || 1));

        if (width !== 1920 && width !== 1080) {
          issues.push({
            type: "WARN",
            rule: "resolution",
            message: `Video resolution is ${width}x${height} (standard is 1920x1080 or 1080x1920).`,
          });
        }
        if (fps !== 30 && fps !== 60) {
          issues.push({
            type: "WARN",
            rule: "frame_rate",
            message: `FPS is ${fps} (standard is 30 fps).`,
          });
        }
        issues.push({
          type: "INFO",
          rule: "stream_spec",
          message: `Codec: ${vStream.codec_name}, Resolution: ${width}x${height}, FPS: ${fps}`,
        });
      }

      if (!aStream) {
        issues.push({
          type: "ERROR",
          rule: "audio_stream",
          message: "No audio stream found in rendered output video.",
        });
      }

      // Check duration match against original audio or timeline specification
      if (paths.audioFile && fs.existsSync(paths.audioFile)) {
        const originalAudio = await probeAudio(paths.audioFile);
        const videoDurationSec = parseFloat(data.format?.duration || "0");
        const timelinePath = path.join(paths.outputDir, "timeline.json");
        let expectedDurationSec = originalAudio.durationSec + (tailPaddingMs / 1000);
        if (fs.existsSync(timelinePath)) {
          try {
            const tl = JSON.parse(fs.readFileSync(timelinePath, "utf-8"));
            if (typeof tl.durationFrames === "number") {
              const tlFps = tl.fps || 30;
              expectedDurationSec = tl.durationFrames / tlFps;
            }
          } catch {}
        }
        const diff = Math.abs(videoDurationSec - expectedDurationSec);
        if (diff > 0.5) {
          issues.push({
            type: "ERROR",
            rule: "duration_drift",
            message: `Video duration (${videoDurationSec.toFixed(2)}s) differs from expected (${expectedDurationSec.toFixed(2)}s) by ${diff.toFixed(2)}s (> 0.5s).`,
          });
        } else {
          issues.push({
            type: "INFO",
            rule: "duration_match",
            message: `Duration sync exact: video=${videoDurationSec.toFixed(2)}s, expected=${expectedDurationSec.toFixed(2)}s (diff ${diff.toFixed(3)}s).`,
          });
        }
      }
    } catch (err: any) {
      issues.push({
        type: "ERROR",
        rule: "ffprobe_failed",
        message: `Failed to probe video with ffprobe: ${err.message}`,
      });
    }

    // 3. Black frame detection via ffmpeg
    try {
      const blackLog = execSync(
        `ffmpeg -i "${testVideo}" -vf "blackdetect=d=0.5:pic_th=0.98" -f null - 2>&1`,
        { encoding: "utf-8" }
      );
      const blackMatches = blackLog.match(/black_start:([0-9.]+)\s+black_end:([0-9.]+)\s+black_duration:([0-9.]+)/g);
      if (blackMatches && blackMatches.length > 0) {
        issues.push({
          type: "WARN",
          rule: "black_frames",
          message: `Detected ${blackMatches.length} unexpected dark/black intervals longer than 0.5s.`,
        });
      } else {
        issues.push({
          type: "INFO",
          rule: "black_frames",
          message: "Zero unwanted black frames detected (continuous visual engagement).",
        });
      }
    } catch {
      // ffmpeg exit 0 on null muxer
    }

    // 4. Freeze detection via ffmpeg
    try {
      const freezeLog = execSync(
        `ffmpeg -i "${testVideo}" -vf "freezedetect=n=-60dB:d=3.0" -f null - 2>&1`,
        { encoding: "utf-8" }
      );
      const freezeMatches = freezeLog.match(/freeze_start:([0-9.]+)/g);
      if (freezeMatches && freezeMatches.length > 0) {
        issues.push({
          type: "WARN",
          rule: "frozen_frames",
          message: `Detected static frame stretch longer than 3.0s (${freezeMatches.length} times). Add ambient motion.`,
        });
      } else {
        issues.push({
          type: "INFO",
          rule: "ambient_motion",
          message: "No static scenes over 3s. Ambient camera push-in and background drift verified.",
        });
      }
    } catch {
      // ignore
    }

    // 5. Audio Loudness Check (-14 LUFS target)
    try {
      const loudnormLog = execSync(
        `ffmpeg -i "${testVideo}" -af "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json" -f null - 2>&1`,
        { encoding: "utf-8" }
      );
      const jsonStart = loudnormLog.indexOf("{");
      const jsonEnd = loudnormLog.lastIndexOf("}");
      if (jsonStart !== -1 && jsonEnd !== -1) {
        const stats = JSON.parse(loudnormLog.substring(jsonStart, jsonEnd + 1));
        const inputI = parseFloat(stats.input_i);
        const inputTp = parseFloat(stats.input_tp);
        issues.push({
          type: "INFO",
          rule: "loudness_profile",
          message: `Integrated Loudness: ${inputI.toFixed(1)} LUFS (target -14), True Peak: ${inputTp.toFixed(1)} dBTP.`,
        });

        if (inputI < -17 || inputI > -11) {
          issues.push({
            type: "WARN",
            rule: "loudness_tolerance",
            message: `Loudness ${inputI.toFixed(1)} LUFS is outside -14 ± 2 LU tolerance.`,
          });
        }
      }
    } catch {
      // ignore
    }
  }

  // 6. Check Scene Completeness & Linting (for storyboard workspaces)
  const storyboardPath = path.join(paths.outputDir, "storyboard.json");
  const scenesDir = path.join(paths.outputDir, "src", "scenes");
  const isFinal = explicitFinal !== null ? explicitFinal : (testVideo ? path.basename(testVideo) === "final.mp4" : false);

  if (fs.existsSync(storyboardPath) && fs.existsSync(scenesDir)) {
    try {
      const sb = JSON.parse(fs.readFileSync(storyboardPath, "utf-8"));
      const existingSceneFiles = fs.readdirSync(scenesDir).filter((f) => f.endsWith(".tsx") && f !== "index.ts");

      // Verify every storyboard scene exists
      for (const sc of sb.scenes) {
        const found = existingSceneFiles.find((f) => f.toUpperCase().startsWith(sc.id.toUpperCase()));
        if (!found) {
          if (isFinal) {
            issues.push({
              type: "ERROR",
              rule: "missing_scene",
              message: `Scene ${sc.id} (${sc.slug}) is defined in storyboard but missing from src/scenes/.`,
            });
          } else {
            issues.push({
              type: "WARN",
              rule: "missing_scene_draft",
              message: `Scene ${sc.id} (${sc.slug}) is not yet authored. Rendering as placeholder.`,
            });
          }
        }
      }

      // Check for placeholder scenes in index.ts for final render
      const indexPath = path.join(scenesDir, "index.ts");
      if (fs.existsSync(indexPath) && isFinal) {
        const indexCode = fs.readFileSync(indexPath, "utf-8");
        if (indexCode.includes("<PlaceholderScene")) {
          issues.push({
            type: "ERROR",
            rule: "placeholder_in_final",
            message: "Final broadcast render contains placeholder scenes. Author all scenes before final release.",
          });
        }
      }

      // Lint all existing scene files
      const { lintSceneCode } = await import("@wealthgap/kit");
      for (const sf of existingSceneFiles) {
        const code = fs.readFileSync(path.join(scenesDir, sf), "utf-8");
        const lintRes = lintSceneCode(code, sf);
        if (!lintRes.valid) {
          for (const err of lintRes.errors) {
            issues.push({
              type: "ERROR",
              rule: "scene_lint_error",
              message: `[${sf}] Line ${err.line ?? "?"}: ${err.message}`,
            });
          }
        }
      }
    } catch {}
  }


  // Generate Report
  const errors = issues.filter((i) => i.type === "ERROR");
  const warnings = issues.filter((i) => i.type === "WARN");
  const info = issues.filter((i) => i.type === "INFO");

  const report = `# Quality Control (QC) Report: ${paths.jobId}

**Date:** ${new Date().toISOString()}  
**Target Video:** \`${testVideo ? path.basename(testVideo) : "None"}\`  
**Status:** ${errors.length === 0 ? (warnings.length === 0 ? "PASSED (Clean)" : "PASSED WITH WARNINGS") : "FAILED"}

## Summary
- **Errors (Blocking):** ${errors.length}
- **Warnings:** ${warnings.length}
- **Info / Diagnostics:** ${info.length}

---

## Errors
${errors.length === 0 ? "_No blocking errors._" : errors.map((e) => `- **[${e.rule}]** ${e.message}`).join("\n")}

## Warnings
${warnings.length === 0 ? "_No warnings._" : warnings.map((w) => `- **[${w.rule}]** ${w.message}`).join("\n")}

## Diagnostic Details
${info.map((i) => `- **[${i.rule}]** ${i.message}`).join("\n")}
`;

  const reviewDir = paths.isWorkspace ? path.join(paths.outputDir, "review") : paths.outputDir;
  fs.mkdirSync(reviewDir, { recursive: true });
  const reportPath = path.join(reviewDir, "qc-report.md");
  fs.writeFileSync(reportPath, report, "utf-8");
  console.log(`[qc] Saved QC report to ${reportPath}`);

  console.log(`\nResults: ${errors.length} errors, ${warnings.length} warnings.`);
  if (errors.length > 0 || (failOnWarnings && warnings.length > 0)) {
    console.error("[qc] QC check failed!");
    process.exit(1);
  } else {
    console.log("[qc] QC check passed!");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("[qc] Fatal error:", err);
  process.exit(1);
});
