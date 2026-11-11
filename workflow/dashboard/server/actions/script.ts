/** Script step: research, write, approve, split into voice sections. */
import path from "node:path";
import * as sh from "../../../08-shorts/lib";
import { exists, wsDir } from "../core";
import { B, args, modelOpt, ENGINE_OPTS, alignAll, type Action } from "./base";

export const scriptActions: Record<string, Action> = {
  "script.research": {
    step: "script", label: "Research", help: "Optional, before Write script (or Write shorts in a shorts project): the researcher picks the claims and figures in your idea that need a source, searches the web for each (no shell commands, web only), and returns facts with their link and a sentence quoted from the page, plus a check of your idea's claims. Then the program opens every page and marks a fact ✓ only if that sentence is really there. Saved to 02-scripting/research.md (edit it freely); the script writer, the director and the shorts writer use the ✓ facts as sources.",
    paid: "free with agy (Claude: ~$0.5–2)", long: "~5–20 min",
    opts: [
      { key: "focus", label: "Focus", help: "optional: what to dig into, e.g. the latest Nvidia earnings and hyperscaler capex", type: "text", flag: "--focus" },
      { key: "max", label: "Questions", help: "how many claims and figures to research (one web search each, ~1–2 min each on agy)", type: "number", min: 1, max: 15, step: 1, def: 8, flag: "--max" },
      modelOpt("researcher", "Model", "--model"),
    ],
    build: (ws, o) => (sh.briefWritten(ws) ? [B("research", "--video", ws, ...args(o, "script.research"))] : sh.isShortsProject(ws) ? "write the brief first" : "write your draft (idea.md) first"),
  },
  "script.research.verify": { step: "script", label: "Re-check sources", help: "Opens every source page again and re-marks each fact (✓ quote found, ~ numbers only, ✗ not there, ? page unreadable). Free, no model.", long: "seconds",
    build: (ws) => (exists(path.join(wsDir(ws), "02-scripting/research.json")) ? [B("research", "--video", ws, "--verify")] : "run Research first") },
  "script.write": {
    step: "script", label: "Write script", help: "Turns your draft (idea.md) into a chunked, hook-scored script with on-screen hints. With feedback.md newer than the script, it revises instead.",
    paid: "~$1–2", long: "3–6 min",
    opts: [
      modelOpt("writer", "Writer model", "--model"),
      { key: "minutes", label: "Target length (min)", type: "number", min: 3, max: 15, step: 0.5, def: 9, flag: "--minutes" },
      { key: "parts", label: "Only revise parts", help: "e.g. 2,4 = rewrite just those parts with your feedback (numbers as in the clean script); every other part stays exactly as it is, so after approval only their lines are voiced again (Apply script changes). Empty = the whole script", type: "text", flag: "--parts" },
    ],
    build: (ws, o) => [B("write", "--video", ws, ...args(o, "script.write"))],
  },
  "script.apply": {
    step: "script", label: "Apply script changes", help: "After you changed an approved script (edited it or revised some parts) and approved it again: split it → voice only the lines that are new or changed (every other take is kept) → Align → move the plan to the new voice. Then Acts → Update changed acts redraws only the acts whose narration changed.", paid: "voice for the changed lines only", long: "~5 min + ~30 s per changed line",
    opts: [...ENGINE_OPTS.filter((x) => x.key !== "parallel"), { key: "takes", label: "Takes per passage", type: "number", min: 1, max: 6, step: 1, flag: "--takes" }],
    chain: [{ label: "Split into sections", action: "script.format" }, { label: "Voice changed lines", action: "voice.sync" }, { label: "Align all", action: "align.all" }, { label: "Update plan", action: "plan.replan" }],
    build: (ws, o) => [B("tts:format", "--video", ws), B("voice:sync", "--video", ws, "--generate", ...args(o, "script.apply")), ...alignAll(ws)],
  },
  "script.approve": { step: "script", label: "Approve script", help: "Locks this exact script for voice generation (any edit afterwards needs a new approval).", build: (ws) => [B("write", "--video", ws, "--approve")] },
  "script.format": {
    step: "script", label: "Split into voice sections", help: "Parses the approved script into voice sections (03-voiceover/sections).", long: "seconds",
    opts: [{ key: "unapproved", label: "Skip approval check", type: "bool", def: false, flag: "--unapproved" }],
    build: (ws, o) => [B("tts:format", "--video", ws, ...args(o, "script.format"))],
  },
};
