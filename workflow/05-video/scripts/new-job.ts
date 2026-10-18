import fs from "node:fs";
import path from "node:path";

const jobId = process.argv[2];

if (!jobId) {
  console.error("Usage: npm run job:new <job-id>");
  process.exit(1);
}

const jobDir = path.resolve(process.cwd(), "jobs", jobId);
const inputDir = path.join(jobDir, "input");
const outputDir = path.join(jobDir, "output");
const planDir = path.join(jobDir, "plan");

if (fs.existsSync(jobDir)) {
  console.error(`Error: Job "${jobId}" already exists at ${jobDir}`);
  process.exit(1);
}

fs.mkdirSync(inputDir, { recursive: true });
fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(planDir, { recursive: true });
fs.mkdirSync(path.join(inputDir, "data"), { recursive: true });
fs.mkdirSync(path.join(inputDir, "assets"), { recursive: true });

// Template brief.md
const briefTemplate = `---
title: "Working title of the video"
topic: "One-line topic"
language: en
audience: "Finance and wealth curious viewers"
tone: "calm, authoritative, a little dramatic"
aspect: "16:9"
accent: "#F5B83D"
must_show:
  - { value: "$9.6T", label: "traded every day", source: "BIS Triennial Survey 2025", year: 2025 }
avoid:
  - "real company logos"
  - "investment advice or predictions"
chapters:
  - "The Hook"
  - "How It Works"
  - "The Big Picture"
outputs: [video, captions, chapters, thumbnails, metadata]
---

## What this video explains
Explain the narrative logic and core financial mechanisms here.

## What the visuals should emphasise
Key visual metaphors, comparative scales, or charts to highlight.

## Extra requests
Any specific requirements (e.g. data files, proportional shapes).
`;

// Template config.json
const configTemplate = {
  fps: 30,
  width: 1920,
  height: 1080,
  aspects: ["16:9"],
  audioOffsetMs: 0,
  tailPaddingMs: 1200,
  captions: {
    mode: "sidecar",
    style: "clean-bottom",
    wordsPerPage: 5,
  },
  music: {
    file: null,
    volume: 0.08,
    duckTo: 0.03,
  },
  sfx: {
    enabled: true,
    volume: 0.25,
    set: ["whoosh", "whip", "switch", "ding", "mouse-click", "page-turn"],
  },
  render: {
    draft: { scale: 0.5, crf: 28 },
    final: { codec: "h264", crf: 16 },
  },
  qc: {
    failOnWarnings: false,
  },
};

fs.writeFileSync(path.join(inputDir, "brief.md"), briefTemplate, "utf-8");
fs.writeFileSync(path.join(inputDir, "config.json"), JSON.stringify(configTemplate, null, 2), "utf-8");

console.log(`✓ Job skeleton created at jobs/${jobId}/`);
console.log(`  Next steps:`);
console.log(`  1. Place audio file at: jobs/${jobId}/input/audio.mp3`);
console.log(`  2. Place transcript at: jobs/${jobId}/input/transcript.json`);
console.log(`  3. Edit brief at:       jobs/${jobId}/input/brief.md`);
console.log(`  4. Run ingest:          npm run ingest ${jobId}`);
