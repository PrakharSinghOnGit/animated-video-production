/**
 * Captions stage: normalizes the workspace transcript (04-transcription/full_transcript.json)
 * into word-level `captions.json` in the video's 05-video dir.
 * storyboard, storyboard:check, timeline and assemble all read this file.
 *
 * Usage: bun run workflow/05-video/scripts/captions.ts --video <ID>
 */
import fs from "node:fs";
import path from "node:path";
import { resolveJobPaths } from "../src/lib/workspaceBridge";
import { probeAudio } from "../src/lib/audioProbe";
import { normalizeTranscript } from "../src/lib/normalizeTranscript";
import { planCaptionsPath } from "../src/lib/replan";

async function main() {
  const args = process.argv.slice(2);
  let target: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--video" || args[i] === "-v") {
      target = args[++i];
    } else if (!args[i].startsWith("-") && !target) {
      target = args[i];
    }
  }
  if (!target) {
    console.error("Usage: bun run captions --video <ID>");
    process.exit(1);
  }

  const paths = resolveJobPaths(target);
  if (!paths.transcriptFile || !fs.existsSync(paths.transcriptFile)) {
    console.error(`❌ Missing transcript for ${paths.jobId} (expected 04-transcription/full_transcript.json). Run "bun run transcribe" first.`);
    process.exit(1);
  }

  let durationSec: number | undefined;
  if (paths.audioFile && fs.existsSync(paths.audioFile)) {
    durationSec = (await probeAudio(paths.audioFile)).durationSec;
  } else {
    console.warn(`⚠️  No voiceover audio found for ${paths.jobId}; normalizing without audio duration.`);
  }

  const raw = fs.readFileSync(paths.transcriptFile, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = raw; // raw SRT/VTT
  }

  const result = normalizeTranscript(parsed, durationSec);
  console.log(
    `Transcript normalized: ${result.stats.wordCount} words, format "${result.formatDetected}", ${result.stats.durationMs}ms`
  );
  for (const w of result.warnings) console.warn(`  - ${w}`);

  fs.mkdirSync(paths.outputDir, { recursive: true });
  const out = path.join(paths.outputDir, "captions.json");
  // a plan made before plan_captions.json existed is timed against the captions about to be replaced: keep them, so
  // replan can move the plan to the new voice (only when the plan is newer than them, i.e. made from them)
  const acts = path.join(paths.outputDir, "acts.json");
  if (fs.existsSync(out) && fs.existsSync(acts) && !fs.existsSync(planCaptionsPath(paths.outputDir)) && fs.statSync(acts).mtimeMs >= fs.statSync(out).mtimeMs)
    fs.copyFileSync(out, planCaptionsPath(paths.outputDir));
  fs.writeFileSync(out, JSON.stringify(result.captions, null, 2), "utf-8");
  console.log(`✓ Saved ${out}`);
  await writeChapters(paths.outputDir, parsed);
  // the .srt is made from captions.json: rebuild it now so it never keeps timings from an earlier voice (speed change, re-voice)
  const srt = Bun.spawnSync(["bun", "run", "srt", "--video", paths.jobId], { stdout: "inherit", stderr: "inherit" });
  if (srt.exitCode !== 0) console.warn("⚠️  .srt export failed (run: bun run srt)");
}

/**
 * Chapters come from "### CHAPTER n: Title" headers in the script (sections carry chapterTitle).
 * chapters.json: [{ n, title, pauseStartMs, startMs }]: the narration is silent from pauseStartMs
 * (end of the previous sentence) to startMs (first word of the chapter) while the title card shows.
 * Also writes chapters.txt in YouTube's description format.
 */
async function writeChapters(outputDir: string, transcript: any): Promise<void> {
  const wsDir = path.dirname(outputDir);
  const sectionsIndex = path.join(wsDir, "03-voiceover", "sections", "index.ts");
  const clips: any[] = transcript?.clips ?? [];
  if (!fs.existsSync(sectionsIndex) || clips.length === 0) return;
  const { allSections } = await import(sectionsIndex);
  const chapterStarts = new Map<string, string>((allSections as any[]).filter((s) => s.chapterTitle).map((s) => [s.id, s.chapterTitle]));
  if (chapterStarts.size === 0) return;

  const chapters: { n: number; title: string; pauseStartMs: number; startMs: number }[] = [];
  let t = 0;
  let prevLastWordEnd = 0;
  for (const c of clips) {
    const id = String(c.sectionId ?? "").replace(/^\d+_/, "");
    const words: any[] = c.words ?? [];
    const firstStart = words.length ? Number(words[0].start ?? 0) : 0;
    const lastEnd = words.length ? Number(words[words.length - 1].end ?? 0) : 0;
    if (chapterStarts.has(id)) {
      chapters.push({
        n: chapters.length + 1,
        title: chapterStarts.get(id)!,
        pauseStartMs: Math.round(prevLastWordEnd * 1000),
        startMs: Math.round((t + firstStart) * 1000),
      });
    }
    prevLastWordEnd = t + lastEnd;
    t += Number(c.duration ?? 0);
  }
  fs.writeFileSync(path.join(outputDir, "chapters.json"), JSON.stringify(chapters, null, 2), "utf-8");
  const stamp = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;
  const intro = chapters.length > 0 && chapters[0].pauseStartMs > 0;   // YouTube wants the first chapter at 0:00: an Intro, else the first chapter itself
  const lines = chapters.map((c, i) => `${stamp(i === 0 && !intro ? 0 : c.pauseStartMs)} ${c.title}`);
  if (intro) lines.unshift("0:00 Intro");
  fs.writeFileSync(path.join(outputDir, "chapters.txt"), lines.join("\n") + "\n", "utf-8");
  console.log(`✓ ${chapters.length} chapters → chapters.json, chapters.txt (YouTube description format)`);
}

main().catch((err) => {
  console.error(`❌ Captions failed: ${err.message}`);
  process.exit(1);
});
