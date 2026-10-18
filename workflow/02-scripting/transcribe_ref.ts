#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { Client } from "@gradio/client";

// Resolve Python with faster_whisper
function findLocalWhisperPython(): string | null {
  const possiblePaths = [
    path.resolve(process.cwd(), "../DancingDuck/.venv/bin/python"),
    path.resolve(process.cwd(), ".venv/bin/python"),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function transcribeViaHF(audioPath: string): Promise<string> {
  const hfToken = process.env.HF_TOKEN || process.env.HUGGING_FACE_HUB_TOKEN;
  console.log(`🌐 Connecting to Hugging Face Space: openai/whisper...`);
  if (hfToken) {
    console.log(`🔑 Using HF_TOKEN from environment for ZeroGPU priority.`);
  } else {
    console.log(`ℹ️ No HF_TOKEN detected. Requests enter public ZeroGPU queue.`);
  }

  const audioBuffer = fs.readFileSync(audioPath);
  const ext = path.extname(audioPath).toLowerCase();
  const mimeType = ext === ".wav" ? "audio/wav" : "audio/mpeg";
  const audioBlob = new Blob([audioBuffer], { type: mimeType });

  const client = await Client.connect("openai/whisper", hfToken ? { hf_token: hfToken as any } : undefined);

  console.log(`⏳ Sending audio to HF Space for transcription...`);
  const result = await client.predict("/predict", {
    inputs: audioBlob,
    task: "transcribe",
  });

  if (Array.isArray(result.data) && result.data[0]) {
    return String(result.data[0]).trim();
  }
  throw new Error(`Unexpected HF Space response: ${JSON.stringify(result.data)}`);
}

function transcribeViaLocal(audioPath: string, pythonPath: string): string {
  console.log(`⚡ Running local Whisper engine (faster-whisper int8)...`);
  const pythonScript = `
from faster_whisper import WhisperModel
import sys

model = WhisperModel("base", device="cpu", compute_type="int8")
segments, info = model.transcribe("${audioPath.replace(/\\/g, "/")}", beam_size=5)
text = " ".join(s.text.strip() for s in segments)
print("__RESULT_START__" + text + "__RESULT_END__")
`;

  const output = execSync(pythonPath, {
    input: pythonScript,
    encoding: "utf-8",
    maxBuffer: 20 * 1024 * 1024,
  });

  const match = output.match(/__RESULT_START__([\s\S]*?)__RESULT_END__/);
  if (match) {
    return match[1].trim();
  }
  return output.trim();
}

async function main() {
  const args = process.argv.slice(2);
  const targetId = args.find((a) => !a.startsWith("-"));

  const workspaceRoot = path.resolve(process.cwd(), "workspace");
  if (!fs.existsSync(workspaceRoot)) {
    console.error(`❌ workspace directory not found at: ${workspaceRoot}`);
    process.exit(1);
  }

  let videoId = targetId;
  if (!videoId) {
    // Look for workspaces with reference audio
    const candidates = fs.readdirSync(workspaceRoot).filter((d) => {
      const p = path.join(workspaceRoot, d, "01-ideation");
      return fs.existsSync(p) && fs.readdirSync(p).some((f) => f.startsWith("reference_audio"));
    });

    if (candidates.length === 0) {
      console.log(`
Usage:
  bun run script:transcribe <VIDEO_ID> [--cloud]
  bun run workflow/02-scripting/transcribe_ref.ts <VIDEO_ID> [--cloud]

Options:
  [default]   Ultra-fast local faster-whisper (CTranslate2 int8)
  --cloud     Use Hugging Face Space (openai/whisper via @gradio/client)

Example:
  bun run script:transcribe VID02_Stock_Market_Bubble
`);
      process.exit(1);
    }
    videoId = candidates[candidates.length - 1];
    console.log(`ℹ️ Auto-selected workspace with reference audio: ${videoId}`);
  }

  const videoDir = path.join(workspaceRoot, videoId);
  const ideationDir = path.join(videoDir, "01-ideation");
  const scriptingDir = path.join(videoDir, "02-scripting");
  fs.mkdirSync(scriptingDir, { recursive: true });

  // Locate reference audio file
  const files = fs.existsSync(ideationDir) ? fs.readdirSync(ideationDir) : [];
  const audioFile = files.find((f) => f.startsWith("reference_audio"));

  if (!audioFile) {
    console.error(`❌ No reference audio found in: ${ideationDir}`);
    console.log(`Run 'bun run new-video ${videoId} <YOUTUBE_URL>' first, or place reference_audio.mp3 in 01-ideation/.`);
    process.exit(1);
  }

  const audioPath = path.join(ideationDir, audioFile);
  const stats = fs.statSync(audioPath);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

  console.log(`\n======================================================`);
  console.log(`🎙️ TRANSCRIBING REFERENCE AUDIO: ${videoId}`);
  console.log(`======================================================`);
  console.log(`File: ${audioPath} (${sizeMB} MB)\n`);

  let transcript = "";
  const localPython = findLocalWhisperPython();
  const useCloud = args.includes("--cloud") || args.includes("--hf");

  if (!useCloud && localPython) {
    // Default mode: ultra-fast local faster-whisper
    transcript = transcribeViaLocal(audioPath, localPython);
  } else {
    // Cloud mode (or fallback if local python missing)
    try {
      transcript = await transcribeViaHF(audioPath);
      console.log(`✅ Transcription received from Hugging Face Space!`);
    } catch (hfErr: any) {
      console.warn(`\n⚠️ HF Space error / ZeroGPU queue: ${hfErr.message}`);
      if (localPython) {
        console.log(`🔄 Switching seamlessly to local faster-whisper engine...`);
        transcript = transcribeViaLocal(audioPath, localPython);
      } else {
        console.error(`❌ Failed to transcribe: ${hfErr.message}`);
        console.log(`Tip: Create a free Hugging Face account, get a token at https://huggingface.co/settings/tokens, and add HF_TOKEN=hf_... to your .env file.`);
        process.exit(1);
      }
    }
  }

  // Save to Transcribe_Raw.md
  const outPath = path.join(scriptingDir, "Transcribe_Raw.md");
  const wordCount = transcript.split(/\s+/).filter(Boolean).length;

  // Read metadata if available
  let metaHeader = "";
  const metaPath = path.join(ideationDir, "metadata.json");
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
      metaHeader = `> **Source Video:** [${meta.title || "Reference Video"}](${meta.webpage_url || ""})\n> **Channel:** ${meta.channel || "Unknown"} | **Duration:** ${meta.duration_string || "N/A"}\n\n`;
    } catch {}
  }

  const fileContent = `# Reference Video Raw Transcript: ${videoId}\n\n${metaHeader}**Total Words:** ${wordCount}  \n**Generated:** ${new Date().toISOString()}  \n\n---\n\n${transcript}\n`;

  fs.writeFileSync(outPath, fileContent, "utf-8");

  console.log(`\n======================================================`);
  console.log(`✅ Raw Transcript Saved:`);
  console.log(`   ${path.relative(process.cwd(), outPath)}`);
  console.log(`   Words: ${wordCount}`);
  console.log(`======================================================\n`);

  console.log(`Next Steps:`);
  console.log(`  Option 1 (Automated): Remake into original script with Ollama Gemma 3:`);
  console.log(`     bun run script:remake ${videoId}`);
  console.log(`  Option 2 (Manual): Review Transcribe_Raw.md and draft script_raw.md manually:`);
  console.log(`     bun run script:remake ${videoId} --manual`);
  console.log(``);
}

main().catch((err) => {
  console.error("Transcribe ref error:", err);
  process.exit(1);
});
