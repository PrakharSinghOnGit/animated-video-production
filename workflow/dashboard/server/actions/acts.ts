/** Acts step: author, update, fix, frames, preview and review (batch and per act). */
import path from "node:path";
import { REPO, exists, notesRel, actIds } from "../core";
import { sceneFiles } from "../status";
import { B, args, modelOpt, CRITIC_OPT, type Action } from "./base";

export const actsActions: Record<string, Action> = {
  "acts.all": {
    step: "acts", label: "Author acts", help: "Writes every act (or the selected ones) that has no file yet.", paid: "~$3 per act", long: "~17 min per act",
    chain: [{ label: "Author each act", action: "acts.act" }],
    opts: [
      { key: "acts", label: "Acts", help: "empty = all missing", type: "multi", choices: [], flag: "--act", map: (v: string[]) => (v.length ? ["--act", v.join(",")] : []) },
      { key: "parallel", label: "In parallel", type: "number", min: 1, max: 4, step: 1, def: 2, flag: "--parallel" },
      modelOpt("actAuthor", "Author model", "--model"),
      CRITIC_OPT,
      { key: "force", label: "Redo acts that exist", type: "bool", def: false, flag: "--force" },
      { key: "autoFix", label: "Automatic fix round", help: "Off: the critic's notes are saved and you fix the acts that need it (Fix with notes). On: a paid fix round runs by itself when the free layout check flags an act (~$1–5 per act)", type: "bool", def: false, flag: "--auto-fix" },
      { key: "strict", label: "…also when the critic fails it", help: "Implies the automatic fix round", type: "bool", def: false, flag: "--strict" },
      { key: "stopAt", label: "Start no new act at 5-h usage (%)", help: "Claude (default profile) only, read from the status line; empty = never. Running acts always finish", type: "number", min: 10, max: 100, step: 5, def: 90, flag: "--stop-at" },
      { ...modelOpt("actAuthor", "On a usage limit, switch to", "--on-limit", "onLimit"), help: "default = stop: start no new acts. A model here redoes the stopped act and the rest with it (e.g. the other Claude profile)" },
      { key: "models", label: "Per-act models", help: "set in the act list above (A01=claude:sonnet,…)", type: "text", flag: "--models" },
    ],
    build: (ws, o) => [B("act", "--video", ws, ...args(o, "acts.all"))],
  },
  "acts.reviewAll": {
    step: "acts", label: "Review acts", help: "For each picked act: renders its preview (to watch) and runs the reviewer, one act after another. Runs beside authoring: only the picked acts are locked.", long: "~3–8 min per act",
    opts: [
      { key: "acts", label: "Acts", help: "empty = every act that has a file", type: "multi", choices: [], flag: "--act" },
      { key: "preview", label: "Also render previews", type: "bool", def: true, flag: "--preview" },
      modelOpt("actReview", "Reviewer", "--agent", "agent"),
      { key: "give", label: "Give it", type: "multi", choices: ["transcript", "plan", "script", "code"], def: ["transcript", "plan"], map: (v: string[]) => (v.length ? ["--give", v.join(",")] : ["--give", "none"]) },
      { key: "toNotes", label: "Append findings to review notes", type: "bool", def: true, flag: "--to-notes" },
    ],
    build: (ws, o) => {
      const scenes = sceneFiles(ws);
      const picked: string[] = Array.isArray(o.acts) && o.acts.length ? o.acts.map(String) : actIds(ws).filter((id) => scenes[id]);
      const bad = picked.filter((id) => !actIds(ws).includes(id) || !scenes[id]);
      if (bad.length) return `${bad.join(", ")}: no act file to review`;
      if (!picked.length) return "no act has a file yet";
      const rv = args({ ...o, acts: [], preview: false }, "acts.reviewAll");   // reviewer options only
      return picked.flatMap((id) => [...(o.preview !== false ? [B("preview", "--video", ws, "--act", id)] : []), B("review", "--video", ws, "--act", id, ...rv)]);
    },
  },
  "acts.act": {
    step: "acts", perAct: true, label: "Author", help: "Writes this act.", paid: "~$3", long: "~17 min",
    opts: [
      modelOpt("actAuthor", "Author model", "--model"),
      CRITIC_OPT,
      { key: "force", label: "Redo if it exists", type: "bool", def: true, flag: "--force" },
    ],
    build: (ws, o, act) => [B("act", "--video", ws, "--act", act!, ...args(o, "acts.act"))],
  },
  "acts.changed": {
    step: "acts", label: "Update changed acts", help: "Only the acts whose narration a script change rewrote: a drawn act gets one update round (old lines → new lines, keep the rest); an act not drawn yet is authored. Each one leaves the list once done.", paid: "~$2–5 per act", long: "~5–15 min per act",
    opts: [modelOpt("actAuthor", "Author model", "--model"), { key: "parallel", label: "Acts at once", type: "number", min: 1, max: 4, step: 1, def: 2, flag: "--parallel" }],
    build: (ws, o) => [B("act", "--video", ws, "--changed", ...args(o, "acts.changed"))],
  },
  "acts.fix": {
    step: "acts", perAct: true, label: "Fix with notes", help: "Sends the review notes to a fresh author session for one revision: it reads the act file, makes targeted edits and checks the changed times. Put every note for the act in one round. Afterwards the general rules in your notes are learned (a rule that comes up on 2 acts is proposed as a lesson: Analytics → Lessons).", paid: "~$2–4", long: "~3–15 min",
    opts: [modelOpt("actAuthor", "Author model", "--model")],
    build: (ws, o, act) => {
      const rel = path.join("workspace", ws, notesRel(act!));
      if (!exists(path.join(REPO, rel))) return "save review notes first";
      return [B("act", "--video", ws, "--act", act!, "--fix", rel, ...args(o, "acts.fix"))];
    },
  },
  "acts.frames": {
    step: "acts", perAct: true, label: "Render frames", help: "Stills every N s + at each hit word, a contact sheet and a layout report.", long: "~1 min",
    opts: [
      { key: "every", label: "Every (s)", type: "number", min: 0.5, max: 10, step: 0.5, def: 4, flag: "--every" },
      { key: "words", label: "Also at hit words", type: "bool", def: true, flag: "--words" },
      { key: "scale", label: "Scale", type: "number", min: 0.25, max: 1, step: 0.25, def: 0.5, flag: "--scale" },
      { key: "at", label: "Extra times (s)", help: "comma-separated, e.g. 12.3,20", type: "text", flag: "--at" },
      { key: "only", label: "Only these times (keep the other frames)", help: "renders just the extra times and adds them to the frames already there", type: "bool", def: false, flag: "--only" },
    ],
    build: (ws, o, act) => [B("frames", "--video", ws, "--scene", act!, ...args(o, "acts.frames"))],
  },
  "acts.preview": {
    step: "acts", perAct: true, label: "Render preview", help: "The act as a video with voice + effects, to watch and annotate.", long: "~30 s–2 min",
    opts: [{ key: "scale", label: "Scale", type: "select", choices: ["1", "0.5", "0.25"], def: "1", flag: "--scale", help: "0.5 = 960×540, 0.25 = 480×270: faster renders for checking timing" }],
    build: (ws, o, act) => [B("preview", "--video", ws, "--act", act!, ...args(o, "acts.preview"))],
  },
  "acts.review": {
    step: "acts", perAct: true, label: "Review", help: "An agent checks that the visuals match the voice at each moment and lists fixes.", long: "2–6 min",
    opts: [
      modelOpt("actReview", "Reviewer", "--agent", "agent"),
      { key: "give", label: "Give it", type: "multi", choices: ["transcript", "plan", "script", "code"], def: ["transcript", "plan"], map: (v: string[]) => (v.length ? ["--give", v.join(",")] : ["--give", "none"]) },
      { key: "every", label: "Frame every (s)", type: "number", min: 0.5, max: 6, step: 0.5, def: 2, flag: "--every" },
      { key: "focus", label: "Look hardest at", type: "text", flag: "--focus" },
      { key: "toNotes", label: "Append findings to review notes", type: "bool", def: true, flag: "--to-notes" },
      { key: "noFrames", label: "Reuse existing frames", type: "bool", def: false, flag: "--no-frames" },
    ],
    build: (ws, o, act) => [B("review", "--video", ws, "--act", act!, ...args(o, "acts.review"))],
  },
};
