/** Align step: speed & gaps, transcription, mastering, captions, pauses. */
import { B, args, masterOpts, type Action } from "./base";

export const alignActions: Record<string, Action> = {
  "align.post": {
    step: "align", label: "Speed & gaps", help: "Speeds the whole voiceover up or down without changing its pitch (rubberband, best quality) and sets the silence between sections and before chapters, then builds the combined voiceover. Always starts from the untouched voice files, so you can re-run with other settings. Empty = the last used setting. Run the rest of Align after it.", long: "~10–30 s",
    opts: [
      { key: "speed", label: "Speed", help: "1 = as generated, 1.1 = 10% faster, 0.95 = 5% slower (pitch unchanged)", type: "number", min: 0.7, max: 1.5, step: 0.01, flag: "--speed" },
      { key: "gap", label: "Gap between sections (s)", help: "silence after each script block", type: "number", min: 0, max: 3, step: 0.05, flag: "--gap" },
      { key: "chapterGap", label: "Chapter pause (s)", help: "silence before a chapter, while its title card shows", type: "number", min: 0, max: 8, step: 0.1, flag: "--chapter-gap" },
      { key: "maxPause", label: "Longest pause inside a section (s)", help: "shortens any silence inside a take to this (a stalled TTS take); 0 = off; empty = last used", type: "number", min: 0, max: 3, step: 0.05, flag: "--max-pause" },
    ],
    build: (ws, o) => [B("tts:post", "--video", ws, ...args(o, "align.post"))],
  },
  "align.all": { step: "align", label: "Align all", help: "Merge (speed & gaps and pauses, last used settings) → transcribe → master → captions (which also writes the .srt) → move the plan's times to the new voice (pauses, speed, or re-voiced lines: acts whose words changed are listed for Update changed acts) → find pause points.", long: "~3 min",
    chain: [{ label: "Merge", action: "align.post" }, { label: "Transcribe", action: "align.transcribe" }, { label: "Master voice", action: "align.master" }, { label: "Build captions", action: "align.captions" }, { label: "Move plan times", action: "plan.replan" }, { label: "Find pause points", action: "align.holdsScan" }],
    build: (ws, o) => [B("tts:post", "--video", ws), B("transcribe", "--video", ws), B("audio:master", "--video", ws, ...args(masterOpts(ws, o), "align.master")), B("captions", "--video", ws), B("voice:holds", "--video", ws, "--shift-plan"), B("replan", "--video", ws, "--auto"), B("voice:holds", "--video", ws, "--scan")] },
  "align.holdsImport": { step: "align", label: "Collect pause requests", help: "Reads the pauses the director asked for (plan) and the ones act authors asked for, places each at the nearest clean pause point (or refuses it) and adds it to the list. Your on/off and lengths are kept.", long: "seconds",
    build: (ws) => [B("voice:holds", "--video", ws, "--scan"), B("voice:holds", "--video", ws, "--import")] },
  "align.holdsScan": { step: "align", label: "Find pause points", help: "Marks every place a pause can go: a sentence or phrase end, or around a joining word, where the take is truly silent (no breath, no word tail).", long: "seconds",
    build: (ws) => [B("voice:holds", "--video", ws, "--scan")] },
  "align.holds": { step: "align", label: "Apply pauses", help: "Merge with the pauses → transcribe → master → captions, then move the plan's act and beat times by the pauses added (your plan approval is kept). Acts time their hits from words, so their code still fits.", long: "~3–4 min",
    chain: [{ label: "Merge with pauses", action: "align.post" }, { label: "Transcribe", action: "align.transcribe" }, { label: "Master voice", action: "align.master" }, { label: "Build captions", action: "align.captions" }, { label: "Move plan times", action: "plan.replan" }, { label: "Find pause points", action: "align.holdsScan" }],
    build: (ws, o) => [B("tts:post", "--video", ws), B("transcribe", "--video", ws), B("audio:master", "--video", ws, ...args(masterOpts(ws, o), "align.master")), B("captions", "--video", ws), B("voice:holds", "--video", ws, "--shift-plan"), B("replan", "--video", ws, "--auto"), B("voice:holds", "--video", ws, "--scan")] },
  "align.transcribe": { step: "align", label: "Transcribe", help: "Word timings from the voiceover (faster-whisper, aligned to the script).", build: (ws) => [B("transcribe", "--video", ws)] },
  "align.master": { step: "align", label: "Master voice", help: "High-pass EQ → de-esser → compressor → room tone → loudness to the YouTube target. Empty = the last used setting. Writes 06-audio/master.json (what it did, loudness before/after).",
    opts: [
      { key: "targetLufs", label: "Loudness target (LUFS)", help: "YouTube normalises to −14", type: "number", min: -24, max: -9, step: 0.5, flag: "--target-lufs" },
      { key: "highpass", label: "High-pass (Hz)", help: "0 = off", type: "number", min: 0, max: 200, step: 5, flag: "--highpass" },
      { key: "deess", label: "De-esser intensity", help: "0 = off", type: "number", min: 0, max: 1, step: 0.05, flag: "--deess" },
      { key: "ratio", label: "Compression ratio", help: "1 = off", type: "number", min: 1, max: 8, step: 0.5, flag: "--ratio" },
      { key: "threshold", label: "Compression threshold (dB)", type: "number", min: -40, max: 0, step: 1, flag: "--threshold" },
      { key: "noRoomTone", label: "No room tone", type: "bool", def: false, flag: "--no-room-tone" },
    ],
    build: (ws, o) => [B("audio:master", "--video", ws, ...args(masterOpts(ws, o), "align.master"))] },
  "align.captions": { step: "align", label: "Build captions", help: "captions.json + chapters.json for the planner; also re-exports the .srt so it always matches the voice.", build: (ws) => [B("captions", "--video", ws)] },
};
