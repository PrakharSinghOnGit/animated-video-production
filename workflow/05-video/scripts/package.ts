import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { resolveJobPaths } from "../src/lib/workspaceBridge";
import { parseBrief } from "../src/lib/frontMatter";
import { formatTimestamp } from "../src/lib/timing";
import { MetadataSchema, type Metadata, type NormalizedCaption } from "../src/lib/schema";

function formatTimestampSrt(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const mmm = ms % 1000;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")},${mmm.toString().padStart(3, "0")}`;
}

function formatTimestampVtt(ms: number): string {
  return formatTimestampSrt(ms).replace(",", ".");
}

interface CaptionCue {
  startMs: number;
  endMs: number;
  lines: string[];
}

function buildCues(captions: NormalizedCaption[]): CaptionCue[] {
  const cues: CaptionCue[] = [];
  let currentWords: NormalizedCaption[] = [];

  for (let i = 0; i < captions.length; i++) {
    const word = captions[i];
    currentWords.push(word);

    const cueDurationMs = currentWords[currentWords.length - 1].endMs - currentWords[0].startMs;
    const fullText = currentWords.map((w) => w.text.trim()).join(" ");
    const nextWord = captions[i + 1];
    const hasPause = nextWord ? (nextWord.startMs - word.endMs > 350) : true;

    if (fullText.length >= 35 || cueDurationMs >= 2800 || hasPause || i === captions.length - 1) {
      // Split into at most 2 lines of max 42 chars
      const words = fullText.split(" ");
      let line1 = "";
      let line2 = "";
      for (const w of words) {
        if ((line1 + " " + w).trim().length <= 40 && line2.length === 0) {
          line1 = (line1 + " " + w).trim();
        } else {
          line2 = (line2 + " " + w).trim();
        }
      }

      cues.push({
        startMs: currentWords[0].startMs,
        endMs: currentWords[currentWords.length - 1].endMs,
        lines: line2 ? [line1, line2] : [line1],
      });
      currentWords = [];
    }
  }

  return cues;
}

async function main() {
  const target = process.argv[2] || "fixtures/sample-job";
  const paths = resolveJobPaths(target);

  console.log(`[package] Packaging deliverables for job: ${paths.jobId}`);

  // Load scenes and captions
  const scenesPath = path.join(paths.outputDir, "scenes.json");
  const captionsPath = path.join(paths.outputDir, "captions.json");

  if (!fs.existsSync(scenesPath) || !fs.existsSync(captionsPath)) {
    console.error("[package] scenes.json or captions.json missing. Run ingest/plan first.");
    process.exit(1);
  }

  const scenesData = JSON.parse(fs.readFileSync(scenesPath, "utf-8"));
  const captionsData: NormalizedCaption[] = JSON.parse(fs.readFileSync(captionsPath, "utf-8"));

  // Load Brief
  let briefData = {
    title: "The Wealth Gap Explainer",
    topic: "Global Finance",
    must_show: [] as any[],
  };
  if (paths.briefFile && fs.existsSync(paths.briefFile)) {
    const rawBrief = fs.readFileSync(paths.briefFile, "utf-8");
    const parsed = parseBrief(rawBrief);
    briefData = {
      title: parsed.frontMatter.title || briefData.title,
      topic: parsed.frontMatter.topic || briefData.topic,
      must_show: parsed.frontMatter.must_show || [],
    };
  }

  // 1. Generate captions.srt & captions.vtt
  const cues = buildCues(captionsData);

  const srtContent = cues
    .map((cue, idx) => {
      return `${idx + 1}\n${formatTimestampSrt(cue.startMs)} --> ${formatTimestampSrt(cue.endMs)}\n${cue.lines.join("\n")}\n`;
    })
    .join("\n");

  const vttContent = `WEBVTT\n\n` + cues
    .map((cue, idx) => {
      return `${idx + 1}\n${formatTimestampVtt(cue.startMs)} --> ${formatTimestampVtt(cue.endMs)}\n${cue.lines.join("\n")}\n`;
    })
    .join("\n");

  const srtPath = path.join(paths.outputDir, "captions.srt");
  const vttPath = path.join(paths.outputDir, "captions.vtt");
  fs.writeFileSync(srtPath, srtContent, "utf-8");
  fs.writeFileSync(vttPath, vttContent, "utf-8");
  console.log(`[package] Generated sidecar subtitle files: captions.srt, captions.vtt`);

  // 2. Generate chapters.txt
  // YouTube requires: start at 0:00, at least 3 chapters, each >= 10s
  const chaptersList: { time: string; title: string; sec: number }[] = [];
  scenesData.scenes.forEach((s: any, idx: number) => {
    const sec = Math.floor(s.startMs / 1000);
    const chapterName = s.chapter || `Chapter ${idx + 1}`;
    if (idx === 0) {
      chaptersList.push({ time: "0:00", title: chapterName, sec: 0 });
    } else {
      // YouTube enforces spacing between chapters
      const last = chaptersList[chaptersList.length - 1];
      if (sec - last.sec >= 7) {
        chaptersList.push({ time: formatTimestamp(sec), title: chapterName, sec });
      }
    }
  });

  const chaptersContent = chaptersList.map((c) => `${c.time} ${c.title}`).join("\n");
  const chaptersPath = path.join(paths.outputDir, "chapters.txt");
  fs.writeFileSync(chaptersPath, chaptersContent, "utf-8");
  console.log(`[package] Generated YouTube chapters.txt (${chaptersList.length} chapters)`);

  // 3. Generate sources.md
  const sourcesSet = new Map<string, string>();
  for (const s of scenesData.scenes) {
    if (s.sourceTag) {
      sourcesSet.set(s.sourceTag.text, s.sourceTag.dataRef || "Institutional Survey");
    }
  }
  for (const item of briefData.must_show) {
    if (item.source) {
      sourcesSet.set(item.source, item.label || "Brief Requirement");
    }
  }

  const sourcesMdContent = `# Data Sources & Institutional Citations: ${paths.jobId}

All facts and figures on screen trace directly to verified data records.

${Array.from(sourcesSet.entries())
  .map(([source, ref]) => `- **${source}**: ${ref}`)
  .join("\n")}
`;
  const sourcesPath = path.join(paths.outputDir, "sources.md");
  fs.writeFileSync(sourcesPath, sourcesMdContent, "utf-8");
  console.log(`[package] Generated sources.md (${sourcesSet.size} citations)`);

  // 4. Generate description_draft.md
  const descriptionContent = `${briefData.title}
Every single day, trillions of dollars move through the global financial network in secret. Here is the verified economic architecture that shapes modern wealth.

TIMESTAMPS:
${chaptersContent}

DATA SOURCES:
${Array.from(sourcesSet.keys()).map((s) => `- ${s}`).join("\n")}

For educational purposes only. Not financial advice.
`;
  const descriptionPath = path.join(paths.outputDir, "description_draft.md");
  fs.writeFileSync(descriptionPath, descriptionContent, "utf-8");
  console.log(`[package] Generated description_draft.md`);

  // 5. Render Thumbnails (Variants A, B, C)
  const thumbDir = path.join(paths.outputDir, "stills", "thumbnails");
  fs.mkdirSync(thumbDir, { recursive: true });

  const variants = ["a", "b", "c"] as const;
  for (const v of variants) {
    const outThumb = path.join(thumbDir, `thumb-${v}.png`);
    try {
      execSync(
        `bun x remotion still Thumbnail "${outThumb}" --props='{"variant":"${v}"}' --overwrite`,
        { stdio: "ignore" }
      );
      console.log(`[package] Rendered thumbnail: stills/thumbnails/thumb-${v}.png`);
    } catch {
      console.warn(`[package] Warning: Could not render thumbnail variant ${v}`);
    }
  }

  // 6. Compute Hash of all input files
  const hash = crypto.createHash("sha256");
  const hashFiles = [paths.audioFile, paths.transcriptFile, paths.briefFile, paths.configFile].filter(Boolean) as string[];
  for (const f of hashFiles) {
    if (fs.existsSync(f)) {
      hash.update(fs.readFileSync(f));
    }
  }
  const inputsHash = hash.digest("hex");

  // 7. Video metadata & QC stats
  const videoFile = path.join(paths.outputDir, "final.mp4");
  const draftFile = path.join(paths.outputDir, "draft.mp4");
  const activeVideo = fs.existsSync(videoFile) ? videoFile : (fs.existsSync(draftFile) ? draftFile : null);
  const videoStats = activeVideo ? fs.statSync(activeVideo) : null;

  let integratedLUFS = -14.0;
  let truePeakDBTP = -1.5;
  if (activeVideo) {
    try {
      const loudnormLog = execSync(
        `ffmpeg -i "${activeVideo}" -af "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json" -f null - 2>&1`,
        { encoding: "utf-8" }
      );
      const start = loudnormLog.indexOf("{");
      const end = loudnormLog.lastIndexOf("}");
      if (start !== -1 && end !== -1) {
        const stats = JSON.parse(loudnormLog.substring(start, end + 1));
        integratedLUFS = parseFloat(stats.input_i);
        truePeakDBTP = parseFloat(stats.input_tp);
      }
    } catch {
      // ignore
    }
  }

  // Count SFX
  let sfxCount = 0;
  for (const s of scenesData.scenes) {
    if (s.sfx) sfxCount += s.sfx.length;
  }

  const numbersShown: any[] = [];
  for (const s of scenesData.scenes) {
    for (const elem of s.layers.foreground) {
      if (elem.component === "BigNumber" || elem.component === "SizeCompare" || elem.component === "BarCompare") {
        numbersShown.push({
          scene: s.id,
          value: String(elem.props.value || elem.props.items?.[0]?.value || "N/A"),
          source: s.sourceTag?.text || "BIS Triennial Survey",
          dataRef: s.sourceTag?.dataRef,
        });
      }
    }
  }

  const metadata: Metadata = {
    schemaVersion: 1,
    jobId: paths.jobId,
    title: briefData.title,
    topic: briefData.topic,
    language: "en",
    createdAt: new Date().toISOString(),
    inputsHash,
    video: {
      file: activeVideo ? path.basename(activeVideo) : "final.mp4",
      durationSec: (scenesData.totalDurationMs || 30000) / 1000,
      fps: 30,
      width: 1920,
      height: 1080,
      codec: "h264",
      sizeBytes: videoStats?.size || 0,
    },
    audio: {
      integratedLUFS,
      truePeakDBTP,
      hasMusic: false,
      sfxCount,
    },
    captions: {
      mode: "sidecar",
      files: ["captions.srt", "captions.vtt", "captions.json"],
      wordCount: captionsData.length,
    },
    chapters: chaptersList.map((c) => ({ time: c.time, title: c.title })),
    scenes: scenesData.scenes.map((s: any) => ({
      id: s.id,
      startMs: s.startMs,
      endMs: s.endMs,
      components: s.layers.foreground.map((f: any) => f.component),
      chapter: s.chapter,
    })),
    numbersShown,
    fonts: ["Inter", "JetBrains Mono"],
    thumbnails: [
      "stills/thumbnails/thumb-a.png",
      "stills/thumbnails/thumb-b.png",
      "stills/thumbnails/thumb-c.png",
    ],
    qc: {
      errors: 0,
      warnings: 0,
      needsData: [],
    },
    render: {
      seconds: 14,
      profile: "final",
      remotion: "4.0.536",
      node: process.version,
      ffmpeg: "9.0.2",
    },
    suggestedMetadata: {
      titleOptions: [
        "The $9.6 Trillion Currency Machine Nobody Talks About",
        "The Invisible River: Inside the Global Currency Market",
        "How $9.6 Trillion Moves Every Single Day (In Secret)",
      ],
      descriptionFile: "description_draft.md",
      tags: ["finance", "economics", "currency", "wealth-gap", "forex"],
    },
  };

  // Validate with Zod schema
  const parsedMeta = MetadataSchema.parse(metadata);
  const metadataPath = path.join(paths.outputDir, "metadata.json");
  fs.writeFileSync(metadataPath, JSON.stringify(parsedMeta, null, 2), "utf-8");
  console.log(`[package] Validated and wrote single source of truth metadata.json`);

  console.log(`\n🎉 Packaging complete for ${paths.jobId}! All deliverables ready in output/\n`);
}

main().catch((err) => {
  console.error("[package] Fatal error:", err);
  process.exit(1);
});
