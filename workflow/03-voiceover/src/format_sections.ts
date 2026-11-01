#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { CONFIG } from "./config";
import type { VOSection } from "./types";

interface ParsedBeat {
  clips: string;
  rawInstruction: string;
  text: string;
}

interface ParsedPart {
  partNum: number;
  partTitle: string;
  /** set when the header is "### CHAPTER n: Title": the narration pauses and the title card shows */
  chapterTitle?: string;
  beats: ParsedBeat[];
}

// Calibrated rule-based mapping from VO tone tags to prosody fields (legacy, unused by Qwen)
function deriveProsodyFromInstruction(instruction: string): {
  pace: number;
  pitch: number;
  loudness: number;
  speed: number;
} {
  const lower = instruction.toLowerCase();

  // Fast / Urgent / Accelerating
  if (lower.includes("urgency") || lower.includes("speed") || lower.includes("accelerat") || lower.includes("rapid")) {
    return { pace: 1.16, pitch: 0.04, loudness: 1.15, speed: 1.15 };
  }

  // Intense / Movie-trailer / Hushed / Dramatic Hook
  if (lower.includes("trailer") || lower.includes("hushed") || lower.includes("dramatic") || lower.includes("intense")) {
    return { pace: 0.88, pitch: -0.12, loudness: 0.92, speed: 0.90 };
  }

  // Heavy landing on number / Staggering stat
  if (lower.includes("number") || lower.includes("emphasis") || lower.includes("staggering") || lower.includes("shock")) {
    return { pace: 0.92, pitch: 0.00, loudness: 1.25, speed: 0.92 };
  }

  // Intrigue / Conspiratorial / Secret
  if (lower.includes("conspiratorial") || lower.includes("intrigue") || lower.includes("secret") || lower.includes("whisper")) {
    return { pace: 0.92, pitch: -0.10, loudness: 0.90, speed: 0.92 };
  }

  // Cold / Cynical reality / Winner vs Loser
  if (lower.includes("cynical") || lower.includes("reality") || lower.includes("cold") || lower.includes("verdict")) {
    return { pace: 0.95, pitch: -0.06, loudness: 1.05, speed: 0.95 };
  }

  // Building tension
  if (lower.includes("tension") || lower.includes("mounting")) {
    return { pace: 1.08, pitch: 0.02, loudness: 1.10, speed: 1.08 };
  }

  // Default natural conversational narration
  return { pace: 1.00, pitch: 0.00, loudness: 1.00, speed: 1.00 };
}

function parseScriptRaw(content: string): ParsedPart[] {
  const lines = content.split("\n");
  const parts: ParsedPart[] = [];
  let currentPart: ParsedPart | null = null;

  let currentClip = "";
  let currentInstruction = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Part headers (### PART 1: THE HOOK) or chapter headers (### CHAPTER 2: Who owns the basket).
    // A chapter is a part that opens with a pause and a chapter title card.
    const partMatch = line.match(/^###\s+(PART|CHAPTER)\s+(\d+)\s*:\s*(.*)/i);
    if (partMatch) {
      if (currentPart && currentPart.beats.length > 0) {
        parts.push(currentPart);
      }
      const isChapter = partMatch[1].toUpperCase() === "CHAPTER";
      currentPart = {
        partNum: parseInt(partMatch[2], 10),
        partTitle: `${partMatch[1].toUpperCase()} ${partMatch[2]}: ${partMatch[3].trim()}`,
        ...(isChapter ? { chapterTitle: partMatch[3].trim() } : {}),
        beats: [],
      };
      currentClip = "";
      currentInstruction = "";
      continue;
    }

    // Check for Clip markers (e.g. **[CLIP 1 - 0:00–0:05]:** or **[CLIP 1]:**)
    const clipMatch = line.match(/^\*\*\[?(CLIP[\s\S]*?)\]?\*\*:\s*(.*)/i);
    if (clipMatch) {
      currentClip = clipMatch[1].replace(/[\[\]]/g, "").trim();
      continue;
    }

    // Check for VO line (e.g. **VO:** `[VO: Tone]` Spoken line)
    const voMatch = line.match(/^\*\*VO:\*\*\s*(?:`?\[(?:VO:\s*)?(.*?)\]`?)?\s*(.*)/i);
    if (voMatch) {
      const instruction = voMatch[1]?.trim() || currentInstruction || "Natural, clear institutional tone";
      let text = voMatch[2]?.trim() || "";

      // Clean extra backticks or brackets
      text = text.replace(/^[`"]+|[`"]+$/g, "").trim();

      if (text && currentPart) {
        currentPart.beats.push({
          clips: currentClip || `CLIP ${currentPart.beats.length + 1}`,
          rawInstruction: instruction,
          text,
        });
      }
      currentClip = "";
      currentInstruction = "";
    }
  }

  if (currentPart && currentPart.beats.length > 0) {
    parts.push(currentPart);
  }

  return parts;
}

async function main() {
  const args = process.argv.slice(2);
  const vi = args.findIndex((a) => a === "--video" || a === "-v");
  const targetId = vi >= 0 ? args[vi + 1] : args.find((a) => !a.startsWith("-"));

  const workspaceRoot = path.resolve(process.cwd(), "workspace");
  let videoId = targetId;

  if (!videoId) {
    const candidates = fs.readdirSync(workspaceRoot).filter((d) => {
      const p = path.join(workspaceRoot, d, "02-scripting", "script_raw.md");
      return fs.existsSync(p);
    });
    if (candidates.length === 0) {
      console.log(`
Usage:
  bun run tts:format <VIDEO_ID>
  bun run workflow/03-voiceover/src/format_sections.ts <VIDEO_ID>

Example:
  bun run tts:format VID02_Stock_Market_Bubble
`);
      process.exit(1);
    }
    videoId = candidates[candidates.length - 1];
    console.log(`ℹ️ Auto-selected workspace with script_raw.md: ${videoId}`);
  }

  const videoDir = path.join(workspaceRoot, videoId);
  const scriptRawPath = path.join(videoDir, "02-scripting", "script_raw.md");
  const sectionsDir = path.join(videoDir, "03-voiceover", "sections");

  if (!fs.existsSync(scriptRawPath)) {
    console.error(`❌ script_raw.md not found at: ${scriptRawPath}`);
    console.log(`Run 'bun run write --video ${videoId}' first (needs 02-scripting/idea.md).`);
    process.exit(1);
  }

  // Approval gate for scripts written by `bun run write`: no voice until the creator approved this exact text
  const approvedPath = path.join(videoDir, "02-scripting", "approved.json");
  // (shorts carry short.json instead of idea.md: same gate)
  const gated = ["idea.md", "short.json"].some((f) => fs.existsSync(path.join(videoDir, "02-scripting", f)));
  if (gated && !args.includes("--unapproved")) {
    const hash = createHash("sha256").update(fs.readFileSync(scriptRawPath)).digest("hex");
    let ok = false;
    try { ok = JSON.parse(fs.readFileSync(approvedPath, "utf-8")).sha256 === hash; } catch {}
    if (!ok) {
      console.error(`❌ The script is not approved${fs.existsSync(approvedPath) ? " (it changed since approval)" : ""}. Review it, then: bun run write --video ${videoId} --approve`);
      process.exit(1);
    }
  }

  const scriptContent = fs.readFileSync(scriptRawPath, "utf-8");
  const parsedParts = parseScriptRaw(scriptContent);

  if (parsedParts.length === 0) {
    console.error(`❌ No valid PART sections or VO lines found in ${scriptRawPath}.`);
    console.log(`Ensure lines follow:`);
    console.log(`  ### PART 1: TITLE`);
    console.log(`  **[CLIP 1]:** [Visual direction]`);
    console.log(`  **VO:** \`[VO: Tone]\` Spoken script narration`);
    process.exit(1);
  }

  fs.mkdirSync(sectionsDir, { recursive: true });

  console.log(`\n======================================================`);
  console.log(`🎙️ FORMATTING VOICEOVER SECTIONS: ${videoId}`);
  console.log(`======================================================`);
  console.log(`Source Script: ${path.relative(process.cwd(), scriptRawPath)}`);
  console.log(`Detected Parts: ${parsedParts.length}\n`);

  const partNames: string[] = [];

  for (const part of parsedParts) {
    const partFilename = `part${part.partNum}.ts`;
    const partFilePath = path.join(sectionsDir, partFilename);
    partNames.push(`part${part.partNum}`);

    const sectionsCode = part.beats.map((b, idx) => {
      const id = `part${part.partNum}_${String(idx + 1).padStart(2, "0")}_beat`;
      const { pace, pitch, loudness, speed } = deriveProsodyFromInstruction(b.rawInstruction);

      return `  {
    id: "${id}",
    part: ${part.partNum},
    partTitle: "${part.partTitle}",${part.chapterTitle && idx === 0 ? `\n    chapterTitle: ${JSON.stringify(part.chapterTitle)},` : ""}
    clips: "${b.clips}",
    rawInstruction: ${JSON.stringify(b.rawInstruction)},
    speed: ${speed.toFixed(2)},
    pace: ${pace.toFixed(2)},
    pitch: ${pitch.toFixed(2)},
    loudness: ${loudness.toFixed(2)},
    text: ${JSON.stringify(b.text)},
    notes: ${JSON.stringify(b.rawInstruction)}
  }`;
    });

    const fileContent = `import type { VOSection } from "../types";

export const part${part.partNum}Sections: VOSection[] = [
${sectionsCode.join(",\n")}
];
`;
    fs.writeFileSync(partFilePath, fileContent, "utf-8");
    console.log(`  ✓ Written ${partFilename} (${part.beats.length} beats)`);
  }

  // Generate index.ts
  const importLines = partNames
    .map((name, i) => `import { ${name}Sections } from "./${name}";`)
    .join("\n");

  const spreadLines = partNames.map((name) => `  ...${name}Sections,`).join("\n");

  const exportList = partNames.map((name) => `  ${name}Sections,`).join("\n");

  const indexContent = `import type { VOSection } from "../types";
${importLines}

export const allSections: VOSection[] = [
${spreadLines}
];

export function getAllSections(): VOSection[] {
  return allSections;
}

export function getSectionsByPart(part: number): VOSection[] {
  return allSections.filter((s) => s.part === part);
}

export function getSectionById(id: string): VOSection | undefined {
  return allSections.find((s) => s.id.toLowerCase() === id.toLowerCase());
}

export function getAvailableParts(): number[] {
  const parts = new Set(allSections.map((s) => s.part));
  return Array.from(parts).sort((a, b) => a - b);
}

export {
${exportList}
};
`;

  fs.writeFileSync(path.join(sectionsDir, "index.ts"), indexContent, "utf-8");
  console.log(`  ✓ Generated sections/index.ts aggregator`);

  console.log(`\n======================================================`);
  console.log(`✅ Voiceover Sections Ready in:`);
  console.log(`   ${path.relative(process.cwd(), sectionsDir)}`);
  console.log(`======================================================\n`);

  console.log(`Next Steps:`);
  console.log(`  1. Generate the voiceover (Qwen3-TTS, channel voice):`);
  console.log(`     bun run tts --video ${videoId}`);
  console.log(`  2. Check character count:`);
  console.log(`     bun run tts:cost --video ${videoId}`);
  console.log(`  3. Voices: bun run voice:list / voice:use <name>`);
  console.log(``);
}

main().catch((err) => {
  console.error("Format sections error:", err);
  process.exit(1);
});
