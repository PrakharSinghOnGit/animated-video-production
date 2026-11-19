/** Sound step: cues, music stem, mix, foley edits, clip previews. */
import * as sh from "../../../08-shorts/lib";
import { B, args, SOUND_MIX_OPTS, type Action } from "./base";

export const soundActions: Record<string, Action> = {
  "sound.all": { step: "sound", label: "Build sound", help: "Cues → music stem → mix.", long: "~2 min",
    chain: [{ label: "Cues", action: "sound.cues" }, { label: "Music stem", action: "sound.music" }, { label: "Mix", action: "sound.mix" }], build: (ws, o) => [B("cues", "--video", ws), B("audio:music", "--video", ws), B("audio:mix", "--video", ws, ...args(o, "sound.mix"))] },
  "sound.cues": { step: "sound", label: "Cues", help: "Foley events from the acts + the music cue plan.", build: (ws) => [B("cues", "--video", ws)] },
  "sound.music": {
    step: "sound", label: "Music stem", help: "The per-chapter music bed as a separate file. A new music.json takes one track per chapter from your music library (assets/music), else the built-in synth.",
    opts: [
      { key: "reset", label: "Reset music.json", help: "rebuild it (picks tracks from the library again)", type: "bool", def: false, flag: "--reset" },
      { key: "synth", label: "Synth only (ignore the library)", type: "bool", def: false, flag: "--synth" },
      { key: "audition", label: "Render 20 s auditions", type: "bool", def: false, flag: "--audition" },
    ],
    build: (ws, o) => [B("audio:music", "--video", ws, ...args(o, "sound.music"))],
  },
  "sound.library": { step: "sound", label: "Scan music library", help: "Adds new tracks in assets/music/<mood>/ to the library (measures length, BPM and energy) and drops missing ones. Then Music stem with Reset picks from them.", long: "seconds",
    opts: [{ key: "remeasure", label: "Measure every track again", type: "bool", def: false, flag: "--remeasure" }],
    build: (_ws, o) => [B("music:lib", ...args(o, "sound.library"))] },
  "sound.mix": {
    step: "sound", label: "Mix", help: "Voice + foley at −14 LUFS (music is added in post).",
    opts: SOUND_MIX_OPTS,
    build: (ws, o) => [B("audio:mix", "--video", ws, ...args(o, "sound.mix"))],
  },
  "sound.apply": {
    step: "sound", label: "Apply SFX edits", help: "Re-reads the foley edits (sfx_edits.json): cues, then the mix, then a new draft render so you can watch it.", long: "~2–4 min",
    opts: SOUND_MIX_OPTS,
    build: (ws, o) => [B("cues", "--video", ws), B("audio:mix", "--video", ws, ...args(o, "sound.apply")), B("draft", "--video", ws)],
  },
  "sfx.clips": { step: "sound", label: "Build clip previews", help: "One short WAV per foley event (including removed ones) in 06-audio/sfx_clips, so each can be played in the review table.", long: "seconds", build: (ws) => [B("sfx:clips", "--video", ws)] },
  "sfx.clips.short": { step: "shorts", perShort: true, label: "Build clip previews", help: "One short WAV per foley event (including removed ones) of this short, to play in the review table.", long: "seconds", build: (ws, _o, s) => [B("sfx:clips", "--video", sh.shortVideoId(ws, s!))] },
};
