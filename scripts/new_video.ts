#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

import { nextUntitled } from "../workflow/lib/rename";

// "VID" or "SH" alone: the next number, untitled (bun run rename --video <id>, or the dashboard, names it later)
const videoId = process.argv[2] === "VID" || process.argv[2] === "SH" ? nextUntitled(process.argv[2]) : process.argv[2];
const youtubeUrl = process.argv[3];

if (!videoId) {
  console.log(`
🎬 The Wealth Gap — Video Workspace Scaffolder

Usage:
  bun run new-video <VIDEO_ID> [YOUTUBE_REFERENCE_URL]
  bun run new-video VID                   the next number, untitled (VID07_Untitled); name it later with bun run rename
  bun run new-video SH<n>_<Name>          a shorts project: shorts only, written from your brief (no long video)
  bun run scripts/new_video.ts <VIDEO_ID> [YOUTUBE_REFERENCE_URL]

Examples:
  # Standard new video workspace:
  bun run new-video VID02_Stock_Market_Bubble

  # New video from YouTube inspiration reference:
  bun run new-video VID02_Stock_Market_Bubble "https://www.youtube.com/watch?v=..."
`);
  process.exit(1);
}

const workspaceRoot = path.resolve(process.cwd(), "workspace");
const targetDir = path.join(workspaceRoot, videoId);

if (fs.existsSync(targetDir)) {
  console.error(`❌ Workspace folder already exists at: ${targetDir}`);
  process.exit(1);
}

// A shorts project (SH<n>_<Name>): shorts only, no long video. The shorts start from the brief (02-scripting/idea.md);
// each short gets its own nested workspace (shorts/S1, …) when shorts:write creates it, as in a long video's Shorts.
if (/^SH\d+_/.test(videoId)) {
  for (const sub of ["02-scripting", "shorts"]) fs.mkdirSync(path.join(targetDir, sub), { recursive: true });
  fs.writeFileSync(path.join(targetDir, "config.json"), JSON.stringify({ kind: "shorts" }, null, 2) + "\n", "utf-8");
  // no digits in the template: every number in the brief becomes a number the shorts may say
  fs.writeFileSync(path.join(targetDir, "02-scripting", "idea.md"), `# ${videoId.replace(/^SH\d+_/, "").replace(/_/g, " ")}

## What happened
(The news, the market move or the idea, in your own words.)

## Facts and sources
(Every number a short may say, each with its source on the same line: what, value, who said it, date or link.
The writer may use only these; the check flags any other number.)

## Angle
(What the viewer should take away; why it matters to them.)

## Shorts
(One short, or a series: how many parts and what each covers. Optional.)
`, "utf-8");
  console.log(`✅ Shorts project created: ${path.relative(process.cwd(), targetDir)}`);
  console.log(`Next: write the brief in 02-scripting/idea.md, then: bun run shorts:write --video ${videoId} --count 1   (add --series for parts)`);
  process.exit(0);
}

function copyDirRecursive(src: string, dest: string, videoId: string) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath, videoId);
    } else {
      if (!fs.existsSync(destPath)) {
        let content = fs.readFileSync(srcPath, "utf-8");
        if (entry.name === "package.json") {
          const pkgSlug = videoId.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
          content = content.replace("{{VIDEO_ID}}", pkgSlug);
        }
        fs.writeFileSync(destPath, content, "utf-8");
      }
    }
  }
}

// Scaffolding directories (Step 1 ideation does not use separate bank folders)
const subdirectories = [
  "01-ideation",
  "02-scripting",
  "03-voiceover/sections",
  "03-voiceover/audio",
  "04-transcription/words",
  "05-video/assets",
  "05-video/chunks",
  "05-video/review",
  "05-video/src/scenes",
  "06-audio/sfx",
  "06-audio/music",
  "07-assembly/export",
];

console.log(`\n======================================================`);
console.log(`📁 Scaffolding New Video Workspace: ${videoId}`);
console.log(`======================================================`);

for (const sub of subdirectories) {
  fs.mkdirSync(path.join(targetDir, sub), { recursive: true });
}

// Scaffold 05-video Remotion project template
const templateDir = path.resolve(process.cwd(), "workflow/05-video/template");
if (fs.existsSync(templateDir)) {
  console.log(`📦 Scaffolding 05-video Remotion project template...`);
  copyDirRecursive(templateDir, path.join(targetDir, "05-video"), videoId);
  console.log(`✅ Scaffolding complete for 05-video.`);
}

let refMetadata: any = null;

if (youtubeUrl) {
  console.log(`\n📥 Detected YouTube Reference Link:`);
  console.log(`   ${youtubeUrl}\n`);

  const ideationDir = path.join(targetDir, "01-ideation");

  // 1. Extract metadata via yt-dlp
  try {
    console.log(`⏳ Fetching YouTube metadata via yt-dlp...`);
    const jsonOutput = execSync(
      `yt-dlp --dump-json --no-playlist "${youtubeUrl}"`,
      { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 }
    );
    const rawMeta = JSON.parse(jsonOutput);

    refMetadata = {
      id: rawMeta.id,
      title: rawMeta.title,
      channel: rawMeta.channel || rawMeta.uploader,
      channel_url: rawMeta.uploader_url || rawMeta.channel_url,
      view_count: rawMeta.view_count,
      like_count: rawMeta.like_count,
      duration: rawMeta.duration,
      duration_string: rawMeta.duration_string,
      upload_date: rawMeta.upload_date,
      webpage_url: rawMeta.webpage_url || youtubeUrl,
      thumbnail_url: rawMeta.thumbnail,
      description: rawMeta.description ? rawMeta.description.slice(0, 2000) : "",
    };

    const metaPath = path.join(ideationDir, "metadata.json");
    fs.writeFileSync(metaPath, JSON.stringify(refMetadata, null, 2), "utf-8");
    console.log(`✅ Saved metadata to 01-ideation/metadata.json:`);
    console.log(`   Title:    "${refMetadata.title}"`);
    console.log(`   Channel:  ${refMetadata.channel}`);
    console.log(`   Views:    ${(refMetadata.view_count ?? 0).toLocaleString()}`);
    console.log(`   Duration: ${refMetadata.duration_string || `${refMetadata.duration}s`}`);
  } catch (err: any) {
    console.warn(`⚠️ Warning: Could not fetch video metadata: ${err.message}`);
  }

  // 2. Download thumbnail
  try {
    console.log(`\n⏳ Downloading reference thumbnail...`);
    execSync(
      `yt-dlp --write-thumbnail --skip-download --convert-thumbnails png -o "${path.join(ideationDir, "thumbnail")}" "${youtubeUrl}"`,
      { stdio: "ignore" }
    );
    console.log(`✅ Reference thumbnail saved to 01-ideation/`);
  } catch {
    // Non-fatal if thumbnail fails
  }

  // 3. Download audio
  try {
    console.log(`\n⏳ Extracting reference audio (MP3)...`);
    const audioOut = path.join(ideationDir, "reference_audio.%(ext)s");
    execSync(
      `yt-dlp -x --audio-format mp3 --audio-quality 0 -o "${audioOut}" "${youtubeUrl}"`,
      { stdio: "inherit" }
    );
    console.log(`✅ Reference audio saved to 01-ideation/reference_audio.mp3`);
  } catch (err: any) {
    console.error(`❌ Failed to download audio via yt-dlp: ${err.message}`);
  }

  // 4. Generate pre-populated notes.md
  const formattedViews = refMetadata?.view_count
    ? (refMetadata.view_count as number).toLocaleString()
    : "N/A";
  const formattedLikes = refMetadata?.like_count
    ? (refMetadata.like_count as number).toLocaleString()
    : "N/A";

  const notesContent = `# Ideation & Reference Notes: ${videoId}

## 📺 Reference YouTube Video
- **Title:** ${refMetadata?.title || "Unknown"}
- **Channel:** ${refMetadata?.channel || "Unknown"}
- **URL:** ${youtubeUrl}
- **Views:** ${formattedViews} | **Likes:** ${formattedLikes} | **Duration:** ${refMetadata?.duration_string || "N/A"}
- **Audio File:** \`01-ideation/reference_audio.mp3\`
- **Metadata File:** \`01-ideation/metadata.json\`

---

## 🎯 The Wealth Gap Angle & Counter-Narrative
*(How do we take this topic and make it 10x more compelling with institutional depth, visual pacing, and financial revelations?)*

- **Core Premise:** 
- **The Controversy / Hidden Cost:** 
- **The Institutional Actor (Who wins / Who loses):** 

---

## 💡 5 Original Title Candidates
1. 
2. 
3. 
4. 
5. 

---

## 🖼️ 3 High-CTR Thumbnail Angles
- **Angle 1 (Shocking Scale / Multiple):** 
- **Angle 2 (Hidden Mechanism / Secret Arena):** 
- **Angle 3 (Visceral Loss / Winner vs Loser):** 

---

## 📊 Core Data Points to Verify
- [ ] Metric 1:
- [ ] Metric 2:
- [ ] Primary Source / Institutional Citation:

---

## 📝 Original Video Description Snippet
\`\`\`
${refMetadata?.description ? refMetadata.description.slice(0, 1000) : "No description."}
\`\`\`
`;
  fs.writeFileSync(path.join(ideationDir, "notes.md"), notesContent, "utf-8");
} else {
  // Clean empty notes.md
  fs.writeFileSync(
    path.join(targetDir, "01-ideation", "notes.md"),
    `# Ideation Notes: ${videoId}\n\n## Core Concept\n\n## 5 Title Candidates\n1. \n2. \n3. \n4. \n5. \n\n## 3 Thumbnail Angles\n- Angle 1:\n- Angle 2:\n- Angle 3:\n\n## Core Data Points\n- \n`
  );
}

// Initial script_raw placeholder
fs.writeFileSync(
  path.join(targetDir, "02-scripting", "script_raw.md"),
  `# ${videoId} Raw Script\n\n*(Write 02-scripting/idea.md, then run 'bun run write --video ${videoId}' to draft this script, or write it by hand)*\n\n### PART 1: THE HOOK\n**[CLIP 1 - 0:00–0:05]:** [Describe opening visual]\n**VO:** \`[VO: Intense, dramatic tone]\` [Opening hook script text]\n`
);

console.log(`\n======================================================`);
console.log(`✅ Video Workspace Created: ${path.relative(process.cwd(), targetDir)}`);
console.log(`======================================================\n`);

console.log(`⏳ Linking workspace dependencies (bun install)...`);
try {
  execSync("bun install", { stdio: "inherit" });
  console.log(`✅ Workspace dependencies linked.\n`);
} catch (err: any) {
  console.warn(`⚠️ Warning: bun install had issues: ${err.message}\n`);
}

console.log(`Next Steps:`);
console.log(`  1. Write your draft/idea in workspace/${videoId}/02-scripting/idea.md (plain text; [brackets] = instructions)`);
console.log(`  2. Draft the script (paid): bun run write --video ${videoId}   then approve: bun run write --video ${videoId} --approve`);
console.log(`  3. Format into VO sections: bun run tts:format --video ${videoId}`);
console.log(``);
