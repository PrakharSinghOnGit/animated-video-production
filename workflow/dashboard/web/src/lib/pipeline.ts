import type { ActRow, Details, Job, PubThumb, ShortItem, StepKey } from "./types";
import { lastRun, ok, reruns, runsFor, type BlockStatus } from "./flow";

/** One sub-step of a step: everything but what it shows inside (the list view adds `children`). */
export interface BlockSpec {
  id: string;
  title: string;
  desc?: string;
  /** schema action key whose Run button this block carries */
  action?: string;
  act?: string;
  /** job label the dashboard records for this action ("Write script", "Author A01") */
  label?: string;
  done: boolean;
  /** mtime of the block's output: a failed run older than it is not shown as failed */
  outAt?: number;
  costRe?: RegExp | null;
  /** extra note shown under the title (e.g. what is missing) */
  note?: string;
  hint?: string;
  /** options of the action (collapsed) */
  options?: boolean;
}
/** A loop-back arrow `from` -> `to`; `ran` = how often the history shows it was taken. */
export interface LoopDef { from: string; to: string; label: string; ran: number }
export interface Spec { blocks: BlockSpec[]; loops: LoopDef[] }

/** running if its job is on, failed if its last run did not finish (and is newer than its output), else done / todo. */
export function blockStatus(d: Details | null, busy: Job | null, b: BlockSpec): BlockStatus {
  const last = d && b.label ? lastRun(d, b.label) : null;
  const running = !!b.label && busy?.label === b.label;
  const failed = !!last && last.status !== "done" && (!b.outAt || last.end > b.outAt);
  return running ? "running" : failed ? "failed" : b.done ? "done" : "todo";
}

/** Script approval counts as given for approved and legacy videos. */
export const scriptApproved = (d: Details) => d.script.approval === "approved" || d.script.approval === "legacy";

/** Blocks and loops of the single-flow steps (script ... render, and the Packaging section as "publish"; Shorts: `shortSpec`) (the Acts step has one flow per act: `actSpec`). */
export function stepSpec(k: Exclude<StepKey, "acts" | "shorts">, d: Details): Spec {
  switch (k) {
    case "script": {
      const s = d.script, approved = scriptApproved(d);
      return {
        loops: [{ from: "approve", to: "write", label: "feedback → rewrite", ran: reruns(d, "Write script") }],
        blocks: [
          { id: "draft", title: "Draft", desc: "Your idea in plain text. [Square brackets] are instructions to the writer, never narration.", done: !!s.idea.trim() },
          { id: "write", title: "Script written", action: "script.write", label: "Write script", done: !!s.file, outAt: s.file?.mtime, costRe: /^write script/i },
          { id: "approve", title: "Reviewed & approved", desc: "Gate G1a: read it, edit it, or write feedback and rewrite. Approving locks this exact script for voicing.", action: "script.approve", label: "Approve script", done: approved,
            note: s.file ? undefined : "Write or paste a script first." },
          { id: "format", title: "Split into sections", action: "script.format", label: "Split into voice sections", done: s.sections > 0 && approved },
        ],
      };
    }
    case "voice": {
      const v = d.voice;
      return {
        loops: [{ from: "listen", to: "gen", label: "not right → regenerate", ran: reruns(d, "Generate voice") }],
        blocks: [
          { id: "sections", title: "Voice sections ready", desc: "Produced by “Split into sections” on the Script page.", done: v.sectionCount > 0 },
          { id: "gen", title: "Generate voice", action: "voice.run", label: "Generate voice", done: v.parts.some((p) => p.files.length > 0), outAt: Math.max(0, ...v.parts.flatMap((p) => p.files.map((f) => f.mtime))) || undefined, costRe: /^voice\b/i },
          { id: "listen", title: "Listen & approve", desc: "Play a few sections. Wrong words or delivery: regenerate that part or section, or try another voice. Speed and the gaps between sections are set in Align → Speed & gaps.", done: v.parts.some((p) => p.files.length > 0) },
        ],
      };
    }
    case "align": {
      const a = d.align;
      return {
        loops: [],
        blocks: [
          { id: "post", title: "Speed & gaps", desc: "Speed (pitch unchanged), the gap between sections and the chapter pause; builds the full voiceover.", action: "align.post", label: "Speed & gaps", done: !!a.voice, outAt: a.voice?.mtime, costRe: /^post\b/i },
          { id: "tr", title: "Transcribe", action: "align.transcribe", label: "Transcribe", done: a.words != null, costRe: /^transcribe\b/i },
          { id: "ma", title: "Master voice", action: "align.master", label: "Master voice", done: !!a.master, outAt: a.master?.mtime, costRe: /^master\b/i },
          { id: "ca", title: "Build captions", action: "align.captions", label: "Build captions", done: a.words != null, costRe: /^captions\b/i },
          { id: "srt", title: "Export .srt", action: "align.srt", label: "Export .srt", done: ok(d, "Export .srt") || ok(d, "Align all") },
        ],
      };
    }
    case "plan": {
      const p = d.plan, checked = ok(d, "Validate plan");
      return {
        loops: [
          { from: "check", to: "plan", label: "invalid → re-plan", ran: reruns(d, "Plan acts") },
          { from: "review", to: "plan", label: "changes → re-plan", ran: reruns(d, "Plan acts") },
        ],
        blocks: [
          { id: "plan", title: "Plan acts", action: "plan.run", label: "Plan acts", done: p.acts.length > 0, outAt: p.file?.mtime, costRe: /^direct\b/i },
          { id: "check", title: "Validate plan", action: "plan.check", label: "Validate plan", done: checked && p.acts.length > 0 },
          { id: "review", title: "Review & approve plan", desc: "Gate G1: read the acts and the figures that come only from the narration.", done: p.acts.length > 0 && checked },
        ],
      };
    }
    case "sound": {
      const s = d.sound, has = (n: string) => s.files.find((f) => f.path.endsWith(n));
      const music = has("music.wav"), mix = has("mix.wav"), daw = d.sound.daw;
      return {
        loops: [],
        blocks: [
          { id: "cues", title: "Cues", action: "sound.cues", label: "Cues", done: s.events != null, costRe: /^cues\b/i },
          { id: "foley", title: "Review foley", desc: "Every foley event the acts declare: play it, switch it off, change its level, then apply (cues, mix, new draft).", done: s.events != null },
          { id: "music", title: "Music stem", action: "sound.music", label: "Music stem", done: !!music, outAt: music?.mtime, costRe: /^music\b/i },
          { id: "mix", title: "Mix", action: "sound.mix", label: "Mix", done: !!mix, outAt: mix?.mtime, costRe: /^mix\b/i },
          { id: "daw", title: "openDAW project", desc: "Voice, every foley event on its own clip, the music stem: one project to edit.", action: "daw.build", label: "Build openDAW project", done: !!daw.bundle, outAt: daw.bundle?.mtime, costRe: /^build opendaw\b/i,
            note: !daw.setUp ? "Needs `bun run daw:setup` once" : daw.bundleStale ? "The cues changed since this project was built" : undefined },
          { id: "edited", title: "Edited in openDAW", desc: "Top bar: openDAW. Edit, then File > Export > To video pipeline. The next render uses it.", done: !!daw.mix, outAt: daw.mix?.mtime },
        ],
      };
    }
    case "publish": {
      const p = d.publish, files = p.thumbs.flatMap((t) => (t.file ? [t.file] : []));
      const prevStale = !!p.preview && files.some((f) => f.mtime > p.preview!.mtime + 1000);
      const open = p.thumbs.some((t) => pubNotesOpen(t, d)) || (!!p.metaNotes.trim() && !pubMetaApplied(d, p.metaNotesMtime));
      return {
        loops: [{ from: "fix", to: "preview", label: "fix → re-render, re-review", ran: d.runs.filter((r) => /^Fix with notes [ABC]$/.test(r.label)).length }],
        blocks: [
          { id: "meta", title: "Titles & description", desc: "One title per package (A, B, C) with the brief of its thumbnail; chapters, sources, credits and limits are computed.", action: "publish.meta", label: "Titles & description", done: !!p.metadata, outAt: p.metaFile?.mtime, costRe: /^meta\b/i },
          { id: "thumbs", title: "Thumbnails", desc: "Three Briefing-kit stills that differ in concept, each paired with its title.", action: "publish.thumbs", label: "Thumbnails", done: files.length === 3, outAt: files[0]?.mtime, costRe: /^thumbs (?!review)/i },
          { id: "preview", title: "Preview", desc: "Renders the images and the preview sheets after a hand edit; a live mock of the home feed is below.", action: "publish.render", label: "Render thumbnails", done: !!p.preview && !prevStale, outAt: p.preview?.mtime },
          { id: "review", title: "Review", action: "publish.review", label: "Review thumbnails", done: p.reviews.length > 0, costRe: /^thumbs review/i },
          { id: "notes", title: "Notes", desc: "Your gate: one line per problem, per variant (and one box for the titles and description). Reviews can append findings here.", done: p.thumbs.some((t) => !!t.notes.trim()) || !!p.metaNotes.trim() },
          { id: "fix", title: "Fix with notes", desc: "Sends a variant's notes to the thumbnail author (resumes its session), or revises the titles with notes/meta.md.", done: (ok(d, "Fix with notes A") || ok(d, "Fix with notes B") || ok(d, "Fix with notes C") || ok(d, "Titles & description")) && !open },
          { id: "approved", title: "Approved", desc: "Gate: you approve these three thumbnails and this metadata. It goes stale if either changes afterwards.", done: !!p.approval?.valid, note: p.approval && !p.approval.valid ? "Changed since you approved: approve again." : undefined },
          { id: "export", title: "Export", desc: "Copies what you upload into 07-publish/export/.", action: "publish.export", label: "Export", done: p.exported.length > 0, outAt: p.exported[0]?.mtime },
        ],
      };
    }
    case "render": {
      const r = d.render;
      const draft = r.videos.find((v) => v.path.endsWith("draft.mp4")), fin = r.videos.find((v) => v.path.endsWith("final.mp4"));
      return {
        loops: [
          { from: "watch", to: "draft", label: "changes → re-draft", ran: reruns(d, "Draft render") },
          { from: "qc", to: "final", label: "QC failed → re-render", ran: reruns(d, "Final render") },
        ],
        blocks: [
          { id: "asm", title: "Assemble", action: "render.assemble", label: "Assemble", done: ok(d, "Assemble") || !!draft },
          { id: "draft", title: "Draft render", desc: "Assemble, draft render, QC.", action: "render.draft", label: "Draft render", done: !!draft, outAt: draft?.mtime, costRe: /^render draft/i },
          { id: "watch", title: "Watch & approve draft", desc: "Gate G3: watch the draft, then go on or loop back and re-render. Done once a current draft exists (the file is not older than the mix, timeline or scenes).", done: !!draft && r.draft === "done" },
          { id: "final", title: "Final render", desc: "1080p H.264 with grain, then QC.", action: "render.final", label: "Final render", done: !!fin && r.final === "done", outAt: fin?.mtime, costRe: /^render final/i },
          { id: "qc", title: "QC", desc: "Reads the final file, else the draft. Done when a report exists.", action: "render.qc", label: "QC", done: !!r.qc, outAt: r.qc?.mtime, costRe: /^qc\b/i },
        ],
      };
    }
  }
}

/** Variant notes are open only when written after the last successful "Fix with notes" run for that variant. */
export const pubNotesOpen = (t: PubThumb, d: Details) => {
  const fix = lastRun(d, `Fix with notes ${t.id}`);
  return !!t.notes.trim() && !(fix?.status === "done" && fix.end >= t.notesMtime);
};
/** The titles notes (notes/meta.md) are applied once a successful "Titles & description" run is newer than them. */
export const pubMetaApplied = (d: Details, notesMtime: number) => { const r = lastRun(d, "Titles & description"); return r?.status === "done" && r.end >= notesMtime; };

/** Notes are open only when written after the last successful "Fix with notes" run (a fix applies them; the file is kept). */
export const notesOpen = (a: ActRow, d: Details) => {
  const fix = lastRun(d, `Fix with notes ${a.id}`);
  return !!a.notes.trim() && !(fix?.status === "done" && fix.end >= a.notesMtime);
};

/**
 * One act: author -> frames -> preview -> review -> notes -> fix (loops back to preview) -> approved. */
export function actSpec(a: ActRow, d: Details): Spec {
  const pv = a.preview, pvStale = !!pv && !!a.scene && a.scene.mtime > pv.mtime;
  const fixLabel = `Fix with notes ${a.id}`;
  const open = notesOpen(a, d);
  // approved = you approved this exact scene file, or (automatic) a current preview and no open notes
  const approved = !!a.scene && (!!a.approval || (!!pv && !pvStale && !open));
  return {
    loops: [{ from: "fix", to: "preview", label: "fix → re-preview, re-review", ran: runsFor(d, fixLabel).length }],
    blocks: [
      { id: "author", title: "Author", action: "acts.act", act: a.id, label: `Author ${a.id}`, done: !!a.scene, outAt: a.scene?.mtime, costRe: new RegExp(`^act ${a.id}\\b`, "i") },
      { id: "frames", title: "Frames", action: "acts.frames", act: a.id, label: `Render frames ${a.id}`, done: a.thumbs.length > 0, costRe: new RegExp(`^frames ${a.id}\\b`, "i") },
      { id: "preview", title: "Preview", action: "acts.preview", act: a.id, label: `Render preview ${a.id}`, done: !!pv && !pvStale, outAt: pv?.mtime, costRe: new RegExp(`^preview ${a.id}\\b`, "i") },
      { id: "review", title: "Review", action: "acts.review", act: a.id, label: `Review ${a.id}`, done: a.reviews.length > 0, costRe: new RegExp(`^review ${a.id}\\b`, "i") },
      { id: "notes", title: "Notes for the author", desc: "Your gate: one line per problem, starting with the time in the act. Reviews can append findings here.", done: !!a.notes.trim() },
      { id: "fix", title: "Fix with notes", desc: "Sends the notes to the act's author for one revision (resumes the author's session: the biggest cost).", action: "acts.fix", act: a.id, label: fixLabel, done: ok(d, fixLabel) && !open },
      { id: "approved", title: "Approved", desc: "Done when you approve the act (valid while its file is unchanged), or its preview is current and no notes are open.", done: approved },
    ],
  };
}


/**
 * One short, stage by stage: script (gate) -> voice -> align -> plan -> act -> sound -> draft -> render -> export.
 * Review at the draft sends work back to the act (fix with notes) or to the sound stage (foley edits).
 */
export function shortSpec(s: ShortItem, d: Details): Spec {
  const p = s.progress, f = s.files, id = s.id, approved = s.approval === "approved";
  const draftStale = !!f.draft && !!f.mix && f.mix.mtime > f.draft.mtime + 1000;
  return {
    loops: [
      { from: "draft", to: "act", label: "review → fix act", ran: runsFor(d, `Fix act with notes ${id}`).length },
      { from: "draft", to: "sound", label: "foley edits → apply", ran: runsFor(d, `Apply SFX edits ${id}`).length },
    ],
    blocks: [
      { id: "script", title: "Script", desc: "Write, check, revise and approve: the voice reads the approved script only. Your gate, per short.", done: approved,
        note: s.approval === "changed since approval" ? "Edited after approval: approve again." : undefined },
      { id: "voice", title: "Voice", action: "shorts.voice", act: id, label: `Voice ${id}`, done: p.voice, outAt: f.voice?.mtime, note: approved ? undefined : "Approve the script first." },
      { id: "align", title: "Align", action: "shorts.align", act: id, label: `Align ${id}`, done: p.align },
      { id: "plan", title: "Plan", action: "shorts.plan", act: id, label: `Plan ${id}`, done: p.plan },
      { id: "act", title: "Act", desc: "The one act of the short, drawn in code; frames and a reviewer; notes go back to its author.", action: "shorts.act", act: id, label: `Act ${id}`, done: p.act },
      { id: "sound", title: "Sound", desc: "Foley review, the music bed on or off, the mix.", action: "shorts.sound", act: id, label: `Sound ${id}`, done: p.sound, outAt: f.mix?.mtime },
      { id: "draft", title: "Draft", desc: "Watch the draft; loop back to the act or to the sound stage until it is right.", action: "shorts.draft", act: id, label: `Draft ${id}`, done: !!f.draft && !draftStale, outAt: f.draft?.mtime,
        note: draftStale ? "The mix is newer than the draft: render the draft again." : undefined },
      { id: "render", title: "Render + QC", action: "shorts.render", act: id, label: `Render final ${id}`, done: p.render && p.qc, outAt: f.final?.mtime },
      { id: "export", title: "Export", desc: "shorts/export: mp4, title + description + hashtags, srt (all shorts at once).", action: "shorts.export", label: "Export shorts", done: p.exported },
    ],
  };
}
