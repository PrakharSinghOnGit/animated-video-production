/** Voice step: generate, re-voice changed or reviewed lines, scan for pauses. */
import { readJson, voiceReviewPath } from "../core";
import { B, args, ENGINE_OPTS, GEMINI_ONLY, type Action } from "./base";

export const voiceActions: Record<string, Action> = {
  "voice.run": {
    step: "voice", label: "Generate voice", help: "Reads every script block in one call (Gemini with its tone note as direction, or the local Qwen clone); a take is kept once speech recognition finds every word. Speed, gaps and the combined file are set afterwards in Align → Speed & gaps.", long: "Gemini ~2–4 min · Qwen ~1–2 min per min of audio",
    opts: [
      { key: "force", label: "Regenerate existing sections", type: "bool", def: true, flag: "--force" },
      ...ENGINE_OPTS,
      { key: "style", label: "Gemini style", help: "short channel direction (empty = conversational explainer talking to one friend); each section's [VO: tone] note is added. Keep it short: long directions make the voice drift", type: "text", flag: "--style", when: GEMINI_ONLY },
      { key: "temperature", label: "Temperature", help: "lower = steadier, higher = livelier (model default when empty)", type: "number", min: 0.3, max: 1.3, step: 0.05, flag: "--temperature", when: { key: "engine", in: ["qwen"] } },
      { key: "takes", label: "Takes per passage", type: "number", min: 1, max: 6, step: 1, flag: "--takes" },
      { key: "acceptWer", label: "Accept WER", help: "stop early when a take is this accurate", type: "number", min: 0, max: 0.5, step: 0.01, flag: "--accept-wer" },
      { key: "sentenceGap", label: "Passage gap (s)", help: "only between passages of one long block; inside a passage the voice paces itself", type: "number", min: 0, max: 2, step: 0.05, flag: "--sentence-gap" },
      { key: "part", label: "Only part", type: "number", min: 1, max: 30, step: 1, flag: "--part" },
      { key: "section", label: "Only section id", help: "e.g. part2_03_beat", type: "text", flag: "--section" },
    ],
    build: (ws, o) => [B("tts", "--video", ws, ...args(o, "voice.run"))],
  },
  "voice.sync": {
    step: "voice", label: "Voice changed lines only", help: "After the script changed and was split again: keeps every take whose words are unchanged (renamed if lines were added or removed before it), moves takes of deleted lines to audio/stale/, and voices only the new or changed lines. Then run Align.", paid: "the changed lines only", long: "~30 s per line",
    opts: [...ENGINE_OPTS.filter((x) => x.key !== "parallel"), { key: "takes", label: "Takes per passage", type: "number", min: 1, max: 6, step: 1, flag: "--takes" }],
    build: (ws, o) => [B("voice:sync", "--video", ws, "--generate", ...args(o, "voice.sync"))],
  },
  "voice.redo": {
    step: "voice", label: "Regenerate reviewed", help: "Reads the sections in Review again: Gemini gets each section's direction plus your note (\"Fix from the previous take: …\"); the old take is kept to compare. Qwen takes no direction, so a note only buys a fresh take there. Then run Align → Merge so the full voiceover picks it up.", long: "~10–40 s per section",
    opts: [
      ...ENGINE_OPTS.filter((o) => o.key !== "parallel"),
      { key: "takes", label: "Takes per passage", help: "the take whose words best match the script is kept", type: "number", min: 1, max: 6, step: 1, flag: "--takes" },
      { key: "section", label: "Only section id", help: "empty = every section in Review that is waiting for a new take", type: "text", flag: "--section" },
    ],
    build: (ws, o) => {
      const rv = readJson<Record<string, any>>(voiceReviewPath(ws)) ?? {};
      const ids = o.section ? [String(o.section)] : Object.entries(rv).filter(([, r]) => r?.status === "open").map(([id]) => id);
      if (!ids.length) return "nothing to regenerate: add sections to Review (and write what to change)";
      if (ids.some((id) => !/^[\w-]+$/.test(id))) return "bad section id";
      return [B("tts", "--video", ws, "--review", "--force", ...args({ ...o, section: undefined }, "voice.redo"), "--section", ids.join(","))];
    },
  },
  "voice.scan": { step: "voice", label: "Scan for long pauses", help: "Lists every section with its exact TTS direction and finds pauses over 0.9 s inside each take (generation does this too; run it for voices made before).", long: "seconds",
    build: (ws) => [B("voice:scan", "--video", ws)] },
};
