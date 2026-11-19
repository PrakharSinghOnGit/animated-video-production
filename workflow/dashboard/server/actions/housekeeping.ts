/** Workspace housekeeping: compact a finished video, the time & cost report. */
import { B, args, type Action } from "./base";

export const housekeepingActions: Record<string, Action> = {
  "history.compact": {
    step: "history", label: "Compact workspace", help: "Frees disk space of a finished video (and its shorts): caches, review frames, previews, draft, TTS takes. Scripts, plans, act code, notes, metadata and final.mp4 are kept. DRY RUN unless you tick \"Delete for real\": it only lists what would go.", long: "seconds",
    opts: [
      { key: "deep", label: "Deep: also the regenerable audio", help: "combined voice, master, mix, music, sfx (re-run voice/align/sound to rebuild)", type: "bool", def: false, flag: "--deep" },
      { key: "fcp", label: "Also the Final Cut Pro project media", help: "silent video, foley clips and music stem in 08-deliver (bun run fcp rebuilds them)", type: "bool", def: false, flag: "--fcp" },
      { key: "final", label: "Also final.mp4", help: "only once it is uploaded or backed up", type: "bool", def: false, flag: "--final" },
      { key: "noShorts", label: "Leave the shorts alone", type: "bool", def: false, flag: "--no-shorts" },
      { key: "yes", label: "DELETE FOR REAL (off = dry run)", help: "maps to --yes; deleted files cannot be restored", type: "bool", def: false, flag: "--yes", volatile: true },
    ],
    build: (ws, o) => [B("compact", "--video", ws, ...args(o, "history.compact"))],
  },
  "timings.run": { step: "timings", label: "Time & cost report", help: "Prints timings.json.", build: (ws) => [B("timings", "--video", ws)] },
};
