/** Render step: assemble, seams, draft, final, QC. */
import { B, args, TABS_OPT, FINAL_OPTS, tabs, seamAfter, type Action } from "./base";

export const renderActions: Record<string, Action> = {
  "render.assemble": { step: "render", label: "Assemble", help: "Registers every act in the video project.", build: (ws) => [B("assemble", "--video", ws)] },
  "render.seamplan": { step: "render", label: "Plan seams", help: "Plans every act-to-act transition (one owner per seam, the neighbours' real frames). The renders need it; it takes seconds.", long: "~1 min",
    build: (ws) => [B("seams", "--video", ws, "--plan-only")] },
  "render.seams": { step: "render", label: "Seams", help: "Plans every transition, then renders the frames and a short clip around each cut and checks them for flicker, jumps and empty screens, so you can watch each one and mark it fine or not fine. Seams whose two acts did not change are reused. The AI review is optional (slow: agy reviews one at a time, ~30–120 s each).", long: "~2–8 min (less when reused)",
    opts: [
      { key: "review", label: "Also an AI review of each cut", help: "slow; off = you watch the clips and mark them", type: "bool", def: false, flag: "--review" },
      { key: "force", label: "Redo every seam", help: "renders all seams again, even unchanged ones", type: "bool", def: false, flag: "--force" },
    ],
    build: (ws, o) => [B("seams", "--video", ws, ...args(o, "render.seams"))] },
  "render.seamfixmarked": { step: "render", label: "Fix marked transitions", help: "One fix round for every cut you marked not fine (your note, the side you picked), each checked again after: watch and mark them again.", paid: "~$2–4 per side", long: "~5–20 min per seam",
    build: (ws) => [B("seams", "--video", ws, "--fix-marked")] },
  "render.seamcheck": { step: "render", perAct: true, label: "Re-check transition", help: "Re-plans the seams, then renders the frames and clip around this act's cut into the next act again.", long: "~1–2 min",
    build: (ws, _o, act) => { const s = seamAfter(ws, act!); return s ? [B("seams", "--video", ws, "--only", s)] : "this act has no next act"; } },
  "render.seamfix": { step: "render", perAct: true, label: "Fix transition", help: "One fix round on the end of this act and/or the start of the next (fresh author session with your note, the review's issues if any, and the frames around the cut), then the transition is checked again.", paid: "~$2–4 per side", long: "~5–20 min",
    opts: [
      { key: "notes", label: "Your note", type: "text", flag: "--notes" },
      { key: "side", label: "Which side", type: "select", choices: ["auto", "a", "b", "both"], def: "auto", flag: "--side" },
    ],
    build: (ws, o, act) => { const s = seamAfter(ws, act!); return s ? [B("seams", "--video", ws, "--fix", s, ...args(o, "render.seamfix"))] : "this act has no next act"; } },
  "render.draft": { step: "render", label: "Draft render", help: "Full video + QC, rendered one act at a time and joined: an act whose code, timing, transitions and the kit did not change since its last render (here or as a full-size act preview) is reused, so after a change only that act (and a neighbour whose transition shows it) renders again. No grain.", long: "only the changed acts (~1–3 min each at full size) + ~1 min to join",
    opts: [TABS_OPT, { key: "scale", label: "Scale", type: "select", choices: ["1", "0.5", "0.25"], def: "1", flag: "--scale", help: "1 = 1920×1080: shares its act renders with the act previews and the final. 0.5 = 960×540, 0.25 = 480×270 (faster, for checking timing; their own act renders)" }],
    chain: [{ label: "Assemble", action: "render.assemble" }, { label: "Plan seams", action: "render.seamplan" }, { label: "Render draft" }, { label: "QC", action: "render.qc" }], build: (ws, o) => [B("assemble", "--video", ws), B("seams", "--video", ws, "--plan-only"), B("draft", "--video", ws, ...tabs(o), "--scale", ["0.5", "0.25", "1"].includes(String(o.scale)) ? String(o.scale) : "1"), B("qc", "--video", ws, "--draft")] },
  "render.final": { step: "render", label: "Final render", help: "H.264 with grain + QC, joined from the full-size act renders (acts already rendered for the current state, by a draft or an act preview, are reused). Acts are drawn at 1080p: 1440p and 4K are a sharp upscale (YouTube streams 4K uploads at a higher bitrate).", long: "only the changed acts + ~3–6 min for grain (4K: longer)",
    opts: FINAL_OPTS,
    chain: [{ label: "Assemble", action: "render.assemble" }, { label: "Plan seams", action: "render.seamplan" }, { label: "Render final" }, { label: "QC", action: "render.qc" }], build: (ws, o) => [B("assemble", "--video", ws), B("seams", "--video", ws, "--plan-only"), B("render", "--video", ws, ...args(o, "render.final")), ...(o.audio === "none" ? [] : [B("qc", "--video", ws, "--final")])] },
  "render.all": { step: "render", label: "Render all", help: "Assemble, draft render, final render, QC.", long: "~8–15 min",
    chain: [{ label: "Assemble", action: "render.assemble" }, { label: "Plan seams", action: "render.seamplan" }, { label: "Render draft" }, { label: "Render final" }, { label: "QC", action: "render.qc" }],
    opts: FINAL_OPTS,
    build: (ws, o) => [B("assemble", "--video", ws), B("seams", "--video", ws, "--plan-only"), B("draft", "--video", ws, ...tabs(o)), B("render", "--video", ws, ...args(o, "render.all")), ...(o.audio === "none" ? [] : [B("qc", "--video", ws, "--final")])] },
  "render.qc": { step: "render", label: "QC", help: "Hard checks: placeholders, loudness, duration.", build: (ws) => [B("qc", "--video", ws)] },
};
