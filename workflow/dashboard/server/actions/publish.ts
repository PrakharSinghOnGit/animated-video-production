/** Packaging: titles and description, thumbnails, their review, export. */
import * as pub from "../../../07-publish/lib";
import { B, args, modelOpt, type Action } from "./base";

export const publishActions: Record<string, Action> = {
  "publish.all": {
    step: "publish", label: "Publish all", help: "Titles + description, the three thumbnails, then the thumbnail review. Titles you edited are kept (the metadata step skips them); thumbnails that exist are kept.", paid: "~$1–3", long: "~8–15 min",
    chain: [{ label: "Titles & description", action: "publish.meta" }, { label: "Thumbnails", action: "publish.thumbs" }, { label: "Review", action: "publish.review" }],
    opts: [modelOpt("thumbs", "Model (titles + thumbnails)", "--model"), modelOpt("thumbsReview", "Reviewer", "--agent", "agent")],
    build: (ws, o) => {
      const m = args(o, "publish.all"), pick = (k: string) => (m.includes(k) ? [k, m[m.indexOf(k) + 1]] : []);
      return [B("meta", "--video", ws, ...pick("--model")), B("thumbs", "--video", ws, ...pick("--model")), B("thumbs:review", "--video", ws, ...pick("--agent"), "--to-notes")];
    },
  },
  "publish.meta": {
    step: "publish", label: "Titles & description", help: "Three titles (one per package A/B/C, each with the brief of its thumbnail), the description opening, tags and hashtags. Chapters, sources, credits and limits are computed in code.", paid: "~$0.2–0.5", long: "~30 s",
    opts: [
      modelOpt("meta", "Model", "--model"),
      { key: "notes", label: "Revise with my notes", help: "uses notes/meta.md and keeps what you did not mention", type: "bool", def: false, flag: "--notes" },
      { key: "force", label: "Overwrite my edits", help: "otherwise metadata you edited in the dashboard is kept", type: "bool", def: false, flag: "--force" },
    ],
    build: (ws, o) => [B("meta", "--video", ws, ...args(o, "publish.meta"))],
  },
  "publish.thumbs": {
    step: "publish", label: "Thumbnails", help: "The author designs the three thumbnails as Briefing-kit stills, looks at its own renders, and the images and preview sheets are rendered.", paid: "~$1–3", long: "~5–10 min",
    opts: [
      modelOpt("thumbs", "Model", "--model"),
      { key: "variant", label: "Variant", type: "select", choices: ["all", "A", "B", "C"], def: "all", map: (v) => (v === "all" ? [] : ["--variant", v]) },
      { key: "force", label: "Redo variants that exist", type: "bool", def: true, flag: "--force" },
    ],
    build: (ws, o) => [B("thumbs", "--video", ws, ...args(o, "publish.thumbs"))],
  },
  "publish.render": {
    step: "publish", label: "Render thumbnails", help: "Renders the images and the preview sheets from the thumbnail files (after you edited one by hand). No model.", long: "~1 min",
    opts: [{ key: "variant", label: "Variant", type: "select", choices: ["all", "A", "B", "C"], def: "all", map: (v) => (v === "all" ? [] : ["--variant", v]) }],
    build: (ws, o) => [B("thumbs:render", "--video", ws, ...args(o, "publish.render"))],
  },
  "publish.review": {
    step: "publish", label: "Review thumbnails", help: "A vision critic checks each thumbnail and the preview sheets against the guide's checklist (168 px legibility, words, focal point, contrast, badge zone, truth, distinctness).", paid: "~$0.1–0.3", long: "~1–3 min",
    opts: [
      modelOpt("thumbsReview", "Reviewer", "--agent", "agent"),
      { key: "toNotes", label: "Append findings to each variant's notes", type: "bool", def: true, flag: "--to-notes" },
    ],
    build: (ws, o) => [B("thumbs:review", "--video", ws, ...args(o, "publish.review"))],
  },
  "publish.fix": {
    step: "publish", variant: true, label: "Fix with notes", help: "Sends this variant's notes to the thumbnail author for one revision (resumes its session).", paid: "~$0.5–2", long: "~3–6 min",
    opts: [modelOpt("thumbs", "Model", "--model")],
    build: (ws, o, v) => {
      if (!pub.readText(pub.pubFile(ws, `notes/${v}.md`)).trim()) return "save notes for this variant first";
      return [B("thumbs", "--video", ws, "--variant", v!, "--notes", ...args(o, "publish.fix"))];
    },
  },
  "publish.export": { step: "publish", label: "Export", help: "Copies the thumbnails, titles.txt (A: ...), description, tags and the .srt into 07-publish/export/.", long: "seconds", build: (ws) => [B("publish:export", "--video", ws)] },
};
