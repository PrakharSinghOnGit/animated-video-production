/** Render step: assemble, seams, draft, final, QC. */
import { B, args, TABS_OPT, FINAL_OPTS, tabs, seamAfter, type Action } from "./base";

export const renderActions: Record<string, Action> = {
  "render.assemble": { step: "render", label: "Assemble", help: "Registers every act in the video project.", build: (ws) => [B("assemble", "--video", ws)] },
  "render.seams": { step: "render", label: "Seams", help: "Plans every act-to-act transition (one owner per seam, the neighbours' real frames), renders the frames and a clip around each cut, checks them for flicker, jumps and empty screens, and has the critic review each one. Seams whose two acts did not change are reused, and only seams without a review are reviewed, so a stopped run picks up where it was. Reviews on agy run one at a time (~30–120 s each); the log shows each one.", long: "~2–25 min (less when reused)",
    opts: [{ key: "force", label: "Redo every seam", help: "renders and reviews all seams again, even unchanged ones", type: "bool", def: false, flag: "--force" }],
    build: (ws, o) => [B("seams", "--video", ws, ...args(o, "render.seams"))] },
  "render.seamcheck": { step: "render", perAct: true, label: "Re-check transition", help: "Re-plans the seams, then renders the frames and clip around this act's cut into the next act again and reviews it afresh (free with the default critic).", long: "~1–3 min",
    build: (ws, _o, act) => { const s = seamAfter(ws, act!); return s ? [B("seams", "--video", ws, "--only", s)] : "this act has no next act"; } },
  "render.seamfix": { step: "render", perAct: true, label: "Fix transition", help: "One fix round on the end of this act and/or the start of the next (fresh author session with the review's issues, your note and the frames around the cut), then the transition is checked again.", paid: "~$2–4 per side", long: "~5–20 min",
    opts: [
      { key: "notes", label: "Your note", type: "text", flag: "--notes" },
      { key: "side", label: "Which side", type: "select", choices: ["auto", "a", "b", "both"], def: "auto", flag: "--side" },
    ],
    build: (ws, o, act) => { const s = seamAfter(ws, act!); return s ? [B("seams", "--video", ws, "--fix", s, ...args(o, "render.seamfix"))] : "this act has no next act"; } },
  "render.draft": { step: "render", label: "Draft render", help: "Full video + QC.", long: "~3–5 min",
    opts: [TABS_OPT],
    chain: [{ label: "Assemble", action: "render.assemble" }, { label: "Seams", action: "render.seams" }, { label: "Render draft" }, { label: "QC", action: "render.qc" }], build: (ws, o) => [B("assemble", "--video", ws), B("seams", "--video", ws), B("draft", "--video", ws, ...tabs(o)), B("qc", "--video", ws, "--draft")] },
  "render.final": { step: "render", label: "Final render", help: "H.264 with grain + QC. Acts are drawn at 1080p: 1440p and 4K are a sharp upscale (YouTube streams 4K uploads at a higher bitrate).", long: "~5–10 min (4K: longer)",
    opts: FINAL_OPTS,
    chain: [{ label: "Assemble", action: "render.assemble" }, { label: "Seams", action: "render.seams" }, { label: "Render final" }, { label: "QC", action: "render.qc" }], build: (ws, o) => [B("assemble", "--video", ws), B("seams", "--video", ws), B("render", "--video", ws, ...args(o, "render.final")), ...(o.audio === "none" ? [] : [B("qc", "--video", ws, "--final")])] },
  "render.all": { step: "render", label: "Render all", help: "Assemble, draft render, final render, QC.", long: "~8–15 min",
    chain: [{ label: "Assemble", action: "render.assemble" }, { label: "Seams", action: "render.seams" }, { label: "Render draft" }, { label: "Render final" }, { label: "QC", action: "render.qc" }],
    opts: FINAL_OPTS,
    build: (ws, o) => [B("assemble", "--video", ws), B("seams", "--video", ws), B("draft", "--video", ws, ...tabs(o)), B("render", "--video", ws, ...args(o, "render.all")), ...(o.audio === "none" ? [] : [B("qc", "--video", ws, "--final")])] },
  "render.qc": { step: "render", label: "QC", help: "Hard checks: placeholders, loudness, duration.", build: (ws) => [B("qc", "--video", ws)] },
};
