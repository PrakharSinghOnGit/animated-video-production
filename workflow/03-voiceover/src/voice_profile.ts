#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

// Resolve Python with F5-TTS
export function findPython(): string {
  const possiblePaths = [
    path.resolve(process.cwd(), "../DancingDuck/.venv/bin/python"),
    path.resolve(process.cwd(), ".venv/bin/python"),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return "python3";
}

export function setupVoiceProfile(forceRemake = false) {
  const voiceoverDir = path.resolve(process.cwd(), "workflow/03-voiceover");
  const sourceWav = path.join(voiceoverDir, "voice_to_clone.wav");
  const sourcePrompt = path.join(voiceoverDir, "voice_to_clone_prompt.txt");
  const profileDir = path.join(voiceoverDir, "voice_profile");
  const refWav = path.join(profileDir, "reference.wav");
  const refTxt = path.join(profileDir, "reference.txt");
  const metaJson = path.join(profileDir, "profile.json");

  if (!fs.existsSync(sourceWav) || !fs.existsSync(sourcePrompt)) {
    console.error(`❌ Source voice cloning files not found in ${voiceoverDir}`);
    console.error(`Expected:`);
    console.error(`  - ${sourceWav}`);
    console.error(`  - ${sourcePrompt}`);
    process.exit(1);
  }

  const promptText = fs.readFileSync(sourcePrompt, "utf-8").trim();

  // If already set up and not forcing remake, check if profile exists
  if (!forceRemake && fs.existsSync(metaJson) && fs.existsSync(refWav) && fs.existsSync(refTxt)) {
    const existingMeta = JSON.parse(fs.readFileSync(metaJson, "utf-8"));
    return {
      profileDir,
      refWav,
      refTxt,
      meta: existingMeta,
    };
  }

  console.log(`\n======================================================`);
  console.log(`🎙️  F5-TTS: INITIALIZING CLONED VOICE PROFILE`);
  console.log(`======================================================`);
  console.log(`Source Audio:   ${sourceWav}`);
  console.log(`Reference Text: "${promptText.slice(0, 70)}..."\n`);

  fs.mkdirSync(profileDir, { recursive: true });
  fs.copyFileSync(sourceWav, refWav);
  fs.writeFileSync(refTxt, promptText, "utf-8");

  const pythonPath = findPython();
  console.log(`⏳ Verifying voice clone with local F5-TTS model...`);

  const testWavPath = path.join(profileDir, "test_sample.wav");
  const pyCode = `
from f5_tts.api import F5TTS
import os

f5 = F5TTS()
f5.infer(
    ref_file="${refWav.replace(/\\/g, "/")}",
    ref_text="""${promptText.replace(/"/g, '\\"')}""",
    gen_text="Voice profile cloned successfully. The Wealth Gap motion engine is ready.",
    file_wave="${testWavPath.replace(/\\/g, "/")}",
    seed=42
)
`;

  try {
    execSync(pythonPath, {
      input: pyCode,
      encoding: "utf-8",
      maxBuffer: 20 * 1024 * 1024,
      stdio: ["pipe", "ignore", "pipe"],
    });
    console.log(`✓ Voice synthesis test verified: ${path.relative(process.cwd(), testWavPath)}`);
  } catch (err: any) {
    console.warn(`⚠️ Warning during test synthesis: ${err.message}`);
  }

  const profileMeta = {
    name: "wealthgap_anchor_voice",
    engine: "F5-TTS",
    baseModel: "F5TTS_v1_Base",
    refAudio: "reference.wav",
    refPrompt: promptText,
    updatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(metaJson, JSON.stringify(profileMeta, null, 2), "utf-8");

  console.log(`======================================================`);
  console.log(`✅ Voice Profile Saved to:`);
  console.log(`   ${path.relative(process.cwd(), profileDir)}`);
  console.log(`======================================================\n`);

  return {
    profileDir,
    refWav,
    refTxt,
    meta: profileMeta,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const isRemake = args.includes("--remake") || args.includes("-r");
  setupVoiceProfile(isRemake);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error("Voice profile error:", err);
    process.exit(1);
  });
}
