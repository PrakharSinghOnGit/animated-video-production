#!/usr/bin/env bun
/**
 * Voices: workflow/03-voiceover/voices/<name>/ holds a designed voice (bun run voice:design): takes, design.json and,
 * once picked, reference.wav + reference.txt, the clip Qwen clones for every sentence. voices/ACTIVE names the
 * channel's voice, used by every video and short unless --voice-profile says otherwise, so the narrator stays the
 * same across videos. "legacy" is the old clone in voice_profile/ (voice_to_clone.wav).
 *
 *   bun run voice:list            designed voices, which are picked, which is active
 *   bun run voice:use <name>      make <name> the channel voice
 */
import fs from "node:fs";
import path from "node:path";

export const VOICES_DIR = path.resolve(process.cwd(), "workflow/03-voiceover/voices");
const ACTIVE_FILE = path.join(VOICES_DIR, "ACTIVE");
const LEGACY_DIR = path.resolve(process.cwd(), "workflow/03-voiceover/voice_profile");

/** The repo Python (.venv: mlx-audio + faster-whisper), or WG_PYTHON. */
export function findPython(): string {
  if (process.env.WG_PYTHON) return process.env.WG_PYTHON;
  const repoVenv = path.resolve(process.cwd(), ".venv/bin/python");
  return fs.existsSync(repoVenv) ? repoVenv : "python3";
}

export interface Voice { name: string; dir: string; refWav: string; refTxt: string; describe?: string }

const voiceAt = (name: string, dir: string): Voice | null => {
  const refWav = path.join(dir, "reference.wav"), refTxt = path.join(dir, "reference.txt");
  if (!fs.existsSync(refWav) || !fs.existsSync(refTxt)) return null;
  let describe: string | undefined;
  try { describe = JSON.parse(fs.readFileSync(path.join(dir, "design.json"), "utf-8")).describe; } catch {}
  return { name, dir, refWav, refTxt, describe };
};

/** Voices that can be cloned (have a picked reference), designed ones first. */
export function listVoices(): Voice[] {
  const designed = fs.existsSync(VOICES_DIR)
    ? fs.readdirSync(VOICES_DIR).filter((d) => fs.statSync(path.join(VOICES_DIR, d)).isDirectory()).map((d) => voiceAt(d, path.join(VOICES_DIR, d))).filter((v): v is Voice => !!v)
    : [];
  const legacy = voiceAt("legacy", LEGACY_DIR);
  return legacy ? [...designed, legacy] : designed;
}

export function activeVoiceName(): string | undefined {
  try { return fs.readFileSync(ACTIVE_FILE, "utf-8").trim() || undefined; } catch { return undefined; }
}

/** The voice to clone: the named one, else the channel's active voice, else legacy. Exits with a hint when missing. */
export function resolveVoice(name?: string): Voice {
  const want = name || activeVoiceName() || "legacy";
  const v = listVoices().find((x) => x.name === want);
  if (!v) {
    const designed = path.join(VOICES_DIR, want, "design.json");
    console.error(fs.existsSync(designed)
      ? `❌ voices/${want} has no picked take yet: bun run voice:design --name ${want} --pick <n>`
      : `❌ No voice '${want}'. Available: ${listVoices().map((x) => x.name).join(", ") || "none (bun run voice:design)"}`);
    process.exit(1);
  }
  return v;
}

function main() {
  const [cmd, name] = process.argv.slice(2);
  if (cmd === "use") {
    if (!name) { console.error("usage: bun run voice:use <name>"); process.exit(1); }
    const v = resolveVoice(name);
    fs.mkdirSync(VOICES_DIR, { recursive: true });
    fs.writeFileSync(ACTIVE_FILE, v.name + "\n");
    console.log(`✓ Channel voice: ${v.name}${v.describe ? `\n  ${v.describe}` : ""}`);
    return;
  }
  const active = activeVoiceName() || "legacy";
  const picked = new Set(listVoices().map((v) => v.name));
  const all = fs.existsSync(VOICES_DIR) ? fs.readdirSync(VOICES_DIR).filter((d) => fs.statSync(path.join(VOICES_DIR, d)).isDirectory()) : [];
  console.log("Voices (★ = channel voice):");
  for (const d of [...all, ...(picked.has("legacy") ? ["legacy"] : [])]) {
    console.log(`  ${d === active ? "★" : " "} ${d.padEnd(20)} ${picked.has(d) ? "ready" : "not picked (voice:design --pick <n>)"}`);
  }
}

if (import.meta.main) main();
