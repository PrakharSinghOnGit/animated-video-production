#!/usr/bin/env bun
import fs from "fs";
import path from "path";

const videoId = process.argv[2];

if (!videoId) {
  console.log(`
Usage:
  bun run new-video <VIDEO_ID>
  bun run scripts/new_video.ts <VIDEO_ID>

Example:
  bun run new-video VID02_Stock_Market_Bubble
`);
  process.exit(1);
}

const workspaceRoot = path.resolve(process.cwd(), "workspace");
const targetDir = path.join(workspaceRoot, videoId);

if (fs.existsSync(targetDir)) {
  console.error(`❌ Workspace folder already exists at: ${targetDir}`);
  process.exit(1);
}

const subdirectories = [
  "01-ideation/video-bank",
  "01-ideation/audio-bank",
  "02-scripting",
  "03-voiceover/sections",
  "03-voiceover/audio",
  "04-transcription/words",
  "05-video/assets",
  "05-video/chunks",
  "06-audio/sfx",
  "06-audio/music",
  "07-assembly/export",
];

console.log(`📁 Scaffolding new video workspace: ${videoId}...`);

for (const sub of subdirectories) {
  fs.mkdirSync(path.join(targetDir, sub), { recursive: true });
}

// Create placeholder notes.md
fs.writeFileSync(
  path.join(targetDir, "01-ideation", "notes.md"),
  `# Ideation Notes: ${videoId}\n\n## Core Concept\n\n## 5 Title Candidates\n1. \n2. \n3. \n4. \n5. \n\n## 3 Thumbnail Angles\n- Angle 1:\n- Angle 2:\n- Angle 3:\n`
);

// Create placeholder script_raw.md
fs.writeFileSync(
  path.join(targetDir, "02-scripting", "script_raw.md"),
  `# ${videoId} Raw Script\n\n### PART 1: THE HOOK\n\n**[CLIP 1 - 0:00–0:05]:** [Describe opening visual]\n**VO:** \`[VO: Intense, dramatic tone]\` [Opening hook script text]\n`
);

console.log(`✅ Video workspace created successfully at:\n   ${path.relative(process.cwd(), targetDir)}\n`);
console.log(`Next Steps:`);
console.log(`  1. Add research notes and reference media to 01-ideation/`);
console.log(`  2. Draft script in 02-scripting/script_raw.md`);
console.log(`  3. Run TTS: bun run tts --video ${videoId}`);
