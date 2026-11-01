/**
 * Is each step's input newer than its output? Used before paid or slow steps so they never run on an old voice:
 * voice (sections + voice.json) → Speed & gaps (combined/full_voiceover.wav) → Align (captions.json, voiceover_master.wav)
 * → Plan (acts.json) → acts; and to pick a sound mix only when it was built from the current voice.
 */
import fs from "node:fs";
import path from "node:path";

const mt = (f: string) => { try { return fs.statSync(f).mtimeMs; } catch { return 0; } };

/** Newest voice section written by the voice step (part-N/*.wav), or voice.json. */
// (sections rewritten by Speed & gaps are newer than voice.json but older than the combined file, so voice.json is the mark)
const voiceTime = (ws: string) => mt(path.join(ws, "03-voiceover", "audio", "voice.json"));

/**
 * Problems that make `step` run on stale inputs (empty = fine). "plan" needs the captions from the current voice;
 * "acts" also needs a plan made from those captions. Files that don't exist are skipped (older workspaces).
 */
export function staleInputs(ws: string, step: "plan" | "acts"): string[] {
  const p = (r: string) => path.join(ws, r);
  const voice = voiceTime(ws), combined = mt(p("03-voiceover/audio/combined/full_voiceover.wav"));
  const captions = mt(p("05-video/captions.json")), master = mt(p("06-audio/voiceover_master.wav")), plan = mt(p("05-video/acts.json"));
  const out: string[] = [];
  if (voice && combined && combined < voice) out.push("the voice was regenerated after Speed & gaps: run Align → Speed & gaps, then the rest of Align");
  else if (combined && captions && captions < combined) out.push("the voiceover changed after the captions were built: run Align (transcribe → master → captions)");
  if (combined && master && master < combined && !out.length) out.push("the voiceover changed after mastering: run Align → Master voice");
  if (step === "acts" && captions && plan && plan < captions) out.push("the captions are newer than the plan: re-run Plan so acts use the current timings");
  return out;
}

/** Exit with the problems unless --allow-stale was passed. */
export function requireFresh(ws: string, step: "plan" | "acts"): void {
  const bad = staleInputs(ws, step);
  if (!bad.length || process.argv.includes("--allow-stale")) return;
  console.error(`❌ Not starting ${step === "plan" ? "the plan" : "act authoring"}: it would use an old voice.\n${bad.map((b) => "   - " + b).join("\n")}\n   (--allow-stale runs it anyway)`);
  process.exit(1);
}

/**
 * The sound mix to play with the picture, only if it was built from the current voice: the openDAW export when it is
 * the newer mix, else the auto mix; null (with the reason) when it predates the mastered voice.
 */
export function currentMix(ws: string): { file: string | null; note?: string } {
  const a = path.join(ws, "06-audio");
  const auto = path.join(a, "mix.wav"), daw = path.join(a, "mix_daw.wav"), master = mt(path.join(a, "voiceover_master.wav"));
  const file = mt(daw) && mt(daw) >= mt(auto) ? daw : mt(auto) ? auto : null;
  if (!file) return { file: null, note: "no sound mix yet" };
  if (master && mt(file) < master) return { file: null, note: `${path.basename(file)} was built from an older voice (re-run Sound → Mix)` };
  return { file };
}
