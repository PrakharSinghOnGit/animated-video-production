/** Shorts: 2–3 standalone 9:16 shorts per video (workspace/<ID>/shorts/S1.., CLI in workflow/08-shorts). */
import path from "node:path";
import * as sh from "../../../08-shorts/lib";
import { REPO, readText, notesRel } from "../core";
import { B, args, modelOpt, ENGINE_OPTS, SHORT_STAGES, type Action } from "./base";

export const shortsActions: Record<string, Action> = {
  "shorts.write": {
    step: "shorts", label: "Write shorts", help: "Writes standalone short scripts (60 s each by default, up to 3 min with Max length; one nested workspace per short) from the approved long script and its sourced figures, or in a shorts project from your brief. Existing shorts are kept unless you tick Overwrite. shorts/feedback.md is read on a full rewrite. Each script still needs your approval before any voice.",
    paid: "~$0.5–1.5", long: "~2–5 min",
    opts: [
      { key: "count", label: "How many", type: "number", min: 1, max: 5, step: 1, def: 3, flag: "--count" },
      modelOpt("shortsWriter", "Writer model", "--model"),
      { key: "length", label: "Max length", help: "the longest each short may run: 60 s is the classic short; YouTube Shorts and Reels allow up to 3 min (160 = 2:40). A ceiling, not a target. Longer shorts mean a longer act to draw (more cost)", type: "select", choices: ["60", "90", "120", "160", "180"], def: "60", flag: "--length" },
      { key: "series", label: "A series (parts in order)", help: "S1 = Part 1 …: each part works alone, ends on the question the next part answers, the last loops back to Part 1. Add short then writes the next part", type: "bool", def: false, flag: "--series" },
      { key: "force", label: "Overwrite existing shorts", help: "rewrites every short script, including ones you edited", type: "bool", def: false, flag: "--force" },
    ],
    build: (ws, o) => {
      if (sh.isShortsProject(ws) && !sh.briefWritten(ws)) return "write the brief first (what happened, the angle, every fact with its source)";
      return [B("shorts:write", "--video", ws, ...args(o, "shorts.write"))];
    },
  },
  "shorts.add": {
    step: "shorts", label: "Add short", help: "Adds one short. With the writer, it reads the shorts that exist and writes a new one that repeats none of them (another kind, hook, number and payoff), following your idea if you give one. Blank: an empty short you write yourself (free).",
    paid: "~$0.3–0.8 (blank: free)", long: "~1–2 min",
    opts: [
      { key: "idea", label: "Idea for this short", help: "optional: an angle, a number, an example from the video or the brief", type: "text", flag: "--idea" },
      { key: "blank", label: "Blank (I write it)", type: "bool", def: false, flag: "--blank" },
      { ...{ key: "length", label: "Max length", help: "the longest each short may run: 60 s is the classic short; YouTube Shorts and Reels allow up to 3 min (160 = 2:40). A ceiling, not a target. Longer shorts mean a longer act to draw (more cost)", type: "select", choices: ["60", "90", "120", "160", "180"], def: "60", flag: "--length" }, def: "set", choices: ["set", "60", "90", "120", "160", "180"], help: "set = the same as the shorts written with Write shorts (60 s if none); YouTube Shorts and Reels allow up to 3 min (160 = 2:40)" },
      modelOpt("shortsWriter", "Writer model", "--model"),
    ],
    build: (ws, o) => [B("shorts:write", "--video", ws, "--add", ...args(o, "shorts.add"))],
  },
  "shorts.remove": { step: "shorts", perShort: true, label: "Remove", help: "Deletes this short (its folder moves to shorts/.removed/, so it can be restored by hand).", long: "seconds", build: (ws, _o, s) => [B("shorts:write", "--video", ws, "--remove", s!)] },
  "shorts.check": { step: "shorts", label: "Check scripts", help: "Re-runs the checks (word count, numbers against the plan's data, banned phrases) after a hand edit. No model.", long: "seconds", build: (ws) => [B("shorts:write", "--video", ws, "--check")] },
  "shorts.revise": {
    step: "shorts", perShort: true, label: "Revise", help: "Rewrites this one short from its feedback (shorts/<S>/02-scripting/feedback.md). Save the feedback first; the new script needs approval again.", paid: "~$0.3–0.8", long: "~1–2 min",
    opts: [modelOpt("shortsWriter", "Writer model", "--model"), { ...{ key: "length", label: "Max length", help: "the longest each short may run: 60 s is the classic short; YouTube Shorts and Reels allow up to 3 min (160 = 2:40). A ceiling, not a target. Longer shorts mean a longer act to draw (more cost)", type: "select", choices: ["60", "90", "120", "160", "180"], def: "60", flag: "--length" }, def: "keep", choices: ["keep", "60", "90", "120", "160", "180"], help: "keep = this short's current limit; or give it a new one (YouTube Shorts and Reels allow up to 3 min; 160 = 2:40)" }],
    build: (ws, o, s) => {
      if (!readText(path.join(sh.shortWs(ws, s!), "02-scripting/feedback.md")).trim()) return "save feedback for this short first";
      return [B("shorts:write", "--video", ws, "--short", s!, ...args(o, "shorts.revise"))];
    },
  },
  "shorts.approve": { step: "shorts", perShort: true, label: "Approve", help: "Locks this exact script for voice generation (any edit afterwards needs a new approval).", build: (ws, _o, s) => [B("shorts:write", "--video", ws, "--approve", s!)] },
  "shorts.run": {
    step: "shorts", perShort: true, label: "Run", help: "Runs the short through the stages from → to (default: voice to draft, which stops for your review). Plan and act call Claude (~$0.2–0.5 and ~$2–4); the rest is free.",
    paid: "plan ~$0.2–0.5, act ~$2–4", long: "~10–30 min",
    opts: [
      { key: "from", label: "From stage", type: "select", choices: [...SHORT_STAGES], def: "voice", flag: "--from" },
      { key: "to", label: "To stage", help: "draft stops for review; render makes the final + QC", type: "select", choices: [...SHORT_STAGES], def: "draft", flag: "--to" },
      modelOpt("shortsDirector", "Director model", "--director-model", "directorModel"),
      modelOpt("shortsAct", "Act author model", "--act-model", "actModel"),
      { key: "force", label: "Redo stages that exist", type: "bool", def: false, flag: "--force" },
      { key: "noMusic", label: "No music bed", help: "sound stage: voice + foley only (to add a sound in the YouTube app instead)", type: "bool", def: false, flag: "--no-music" },
    ],
    build: (ws, o, s) => {
      const from = String(o.from ?? "voice"), to = String(o.to ?? "draft");
      if (SHORT_STAGES.includes(from as any) && SHORT_STAGES.includes(to as any) && SHORT_STAGES.indexOf(from as any) > SHORT_STAGES.indexOf(to as any)) return "From stage comes after To stage";
      if (from === "voice" && sh.approvalState(sh.shortWs(ws, s!)) !== "approved") return "approve this short's script first (the voice reads the approved script)";
      return [B("shorts", "--video", ws, "--short", s!, ...args(o, "shorts.run"))];
    },
  },
  "shorts.frames": {
    step: "shorts", perShort: true, label: "Render frames", help: "Stills every N s + at each hit word, a contact sheet and a layout report for the short's act A01.", long: "~1 min",
    opts: [
      { key: "every", label: "Every (s)", type: "number", min: 0.5, max: 10, step: 0.5, def: 2, flag: "--every" },
      { key: "words", label: "Also at hit words", type: "bool", def: true, flag: "--words" },
    ],
    build: (ws, o, s) => [B("frames", "--video", sh.shortVideoId(ws, s!), "--scene", "A01", ...args(o, "shorts.frames"))],
  },
  "shorts.review": {
    step: "shorts", perShort: true, label: "Review", help: "An agent checks that the visuals match the voice at each moment and appends fixes to the short's review notes.", long: "2–6 min",
    opts: [
      modelOpt("actReview", "Reviewer", "--agent", "agent"),
      { key: "toNotes", label: "Append findings to review notes", type: "bool", def: true, flag: "--to-notes" },
    ],
    build: (ws, o, s) => [B("review", "--video", sh.shortVideoId(ws, s!), "--act", "A01", ...args(o, "shorts.review"))],
  },
  "shorts.fix": {
    step: "shorts", perShort: true, label: "Fix act with notes", help: "Sends the review notes to the act's author for one revision (resumes its session). Save the notes first.", paid: "~$3–6", long: "~3–15 min",
    opts: [modelOpt("shortsAct", "Author model", "--model")],
    build: (ws, o, s) => {
      const rel = path.join("workspace", ws, "shorts", s!, notesRel("A01"));
      if (!readText(path.join(REPO, rel)).trim()) return "save review notes for this short first";
      return [B("act", "--video", sh.shortVideoId(ws, s!), "--act", "A01", "--fix", rel, ...args(o, "shorts.fix"))];
    },
  },
  "shorts.export": {
    step: "shorts", label: "Export shorts", help: "Copies each QC-passed short into shorts/export/: S1.mp4, S1.txt (title, description, hashtags), S1.srt and upload.md.", long: "seconds",
    opts: [{ key: "force", label: "Export even if QC has not passed", type: "bool", def: false, flag: "--force" }],
    build: (ws, o) => [B("shorts:export", "--video", ws, ...args(o, "shorts.export"))],
  },
};

/** Registered after the deliver actions (the order the schema lists them in). */
export const shortsReviewActions: Record<string, Action> = {
  "shorts.qc": { step: "shorts", perShort: true, label: "QC", help: "Hard checks on this short: placeholders, loudness, duration (within its length limit), 9:16.", long: "seconds", build: (ws, _o, s) => [B("qc", "--video", sh.shortVideoId(ws, s!))] },
  "shorts.sound.apply": {
    step: "shorts", perShort: true, label: "Apply SFX edits", help: "Re-reads this short's foley edits: sound stage (cues + mix), then a new draft render.", long: "~2–3 min",
    opts: [{ key: "noMusic", label: "No music bed", help: "voice + foley only (to add a sound in the YouTube app instead)", type: "bool", def: false, flag: "--no-music" }],
    build: (ws, o, s) => [B("shorts", "--video", ws, "--short", s!, "--step", "sound", ...args(o, "shorts.sound.apply")), B("shorts", "--video", ws, "--short", s!, "--step", "draft")],
  },
};

/** One button per short stage (bun run shorts --step <stage>): the Shorts page runs them one at a time or "from here". */
const SHORT_STAGE_ACTIONS: Record<string, Partial<Action> & { label: string; help: string }> = {
  voice: {
    label: "Voice", help: "tts:format + the channel voice with the shorts settings (reads the approved script).", long: "~3–5 min",
    opts: ENGINE_OPTS.map((o) => {
      // shorts run.ts forwards one --tts "<flags>" string to the voice step
      const inner = o.map ?? ((v: any) => [o.flag!, String(v)]);
      return { ...o, flag: undefined, map: (v: any) => ["--tts", inner(v).join(" ")] };
    }),
  },
  align: { label: "Align", help: "Transcribe, master the voice, captions and the .srt.", long: "~1 min" },
  beat: {
    label: "Music & beat", help: "The track the short is cut to: finds its tempo, beats, bars and big accents, so the plan and the act move on the music (pulses on beats, moves on bars, thumps on drops); Sound mixes the same track. Optional: no track = cut to the words.", long: "seconds",
    opts: [
      { key: "beatTrack", label: "Track", help: "from the music library (Sound → Music stem → Music library: put files in assets/music/<mood>/ and Scan); keep = the one already chosen", type: "select", def: "keep",
        map: (v: string) => (v === "keep" ? [] : v === "none" ? ["--beat-clear"] : ["--beat-track", v]) },
      { key: "beatStart", label: "Start in the track (s)", help: "skip an intro or start on the drop; empty = from the top (or the last start)", type: "number", min: 0, max: 900, flag: "--beat-start" },
      { key: "beatAuto", label: "Start on the first downbeat", help: "skips a silent or soft intro so the short opens on the one", type: "bool", def: false, flag: "--beat-auto" },
    ],
  },
  plan: { label: "Plan", help: "The director splits the short into its one act (Claude).", paid: "~$0.2–0.5", long: "~1 min", opts: [modelOpt("shortsDirector", "Director model", "--director-model", "directorModel")] },
  act: {
    label: "Act", help: "The act author draws the short in code, then renders its frames (Claude).", paid: "~$2–4", long: "~5–15 min",
    opts: [modelOpt("shortsAct", "Act author model", "--act-model", "actModel"), { key: "force", label: "Redo the act if it exists", type: "bool", def: false, flag: "--force" }],
  },
  sound: {
    label: "Sound", help: "Cues, the music bed and the mix (voice + foley + bed). Foley edits from the review table are read here.", long: "~1 min",
    opts: [{ key: "noMusic", label: "No music bed", help: "voice + foley only (to add a sound in the YouTube app instead)", type: "bool", def: false, flag: "--no-music" }],
  },
  draft: { label: "Draft", help: "Renders the draft 1080x1920 to watch.", long: "~1–2 min" },
  render: { label: "Render final", help: "Final 1080x1920 render, then QC (within its length limit, 9:16, loudness).", long: "~2–4 min" },
};
export const shortStageActions: Record<string, Action> = {};
for (const [stage, def] of Object.entries(SHORT_STAGE_ACTIONS)) {
  const key = `shorts.${stage}`;
  shortStageActions[key] = {
    step: "shorts", perShort: true, ...def,
    build: (ws, o, s) => {
      if (stage === "voice" && sh.approvalState(sh.shortWs(ws, s!)) !== "approved") return "approve this short's script first (the voice reads the approved script)";
      return [B("shorts", "--video", ws, "--short", s!, "--step", stage, ...args(o, key))];
    },
  };
}
