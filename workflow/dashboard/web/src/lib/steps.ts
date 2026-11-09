import type { Details, St, StepKey } from "./types";

/** The long-video flow (the Video section). Shorts and Packaging are sections of their own. */
export const STEPS: { key: Exclude<StepKey, "publish" | "shorts">; label: string; hint: string }[] = [
  { key: "script", label: "Script", hint: "Draft → script → approval" },
  { key: "voice", label: "Voice", hint: "Narration (Gemini or local)" },
  { key: "align", label: "Align", hint: "Speed, gaps, timings, captions" },
  { key: "plan", label: "Plan", hint: "Acts and beats" },
  { key: "acts", label: "Acts", hint: "Draw, preview, review" },
  { key: "sound", label: "Sound", hint: "Foley and mix" },
  { key: "render", label: "Render", hint: "Draft, final, QC" },
];

/** The two other sections of a project, listed after the video steps where a whole project is summarised. */
export const SECTIONS: { key: "shorts" | "publish"; label: string; hint: string }[] = [
  { key: "shorts", label: "Shorts", hint: "9:16 shorts from this video" },
  { key: "publish", label: "Packaging", hint: "Thumbnails, titles, description" },
];

/** done: finished. next: the first step that is not done. blocked: later step with nothing yet. todo: later step with stale or partial output. */
export type StepState = "done" | "running" | "next" | "todo" | "blocked";

export function stepStates(statuses: Record<string, St> | undefined): Record<StepKey, StepState> {
  const out = {} as Record<StepKey, StepState>;
  let nextFound = false;
  for (const { key } of STEPS) {
    const st = statuses?.[key] ?? "none";
    if (st === "running") { out[key] = "running"; nextFound = true; continue; }
    if (st === "done") { out[key] = "done"; continue; }
    if (!nextFound) { out[key] = "next"; nextFound = true; continue; }
    out[key] = st === "none" ? "blocked" : "todo";
  }
  return out;
}

export const STATE_LABEL: Record<StepState, string> = { done: "Done", running: "Running", next: "Next", todo: "To do", blocked: "Blocked" };

/** One line saying what this step still needs, from the video's current state. */
export function todoText(key: StepKey, st: St, d: Details): string {
  const failed = st === "failed" ? "Last run failed: read the log, then run again. " : "";
  const stale = st === "stale" ? "Its inputs changed after it was made: run again. " : "";
  const pre = failed + stale;
  switch (key) {
    case "script": {
      const a = d.script.approval;
      if (st === "done") return "Script approved and split into voice sections.";
      if (!d.script.idea && !d.script.file) return pre + "Write your draft (idea.md), then write the script.";
      if (!d.script.file) return pre + "Run Write script to turn the draft into a script.";
      if (a === "approved") return pre + "Approved: split it into voice sections.";
      if (a === "changed since approval") return pre + "Edited after approval: review it and approve again.";
      return pre + "Review and edit the script, then approve it.";
    }
    case "voice": {
      const open = d.voice.sections.filter((s) => s.review?.status === "open").length;
      return st !== "done" ? pre + `Generate the voiceover (${d.voice.sectionCount || "no"} sections).` : open ? `${open} section${open > 1 ? "s" : ""} in Review: write what to change, then regenerate.` : "Voiceover generated: listen, and add any bad section to Review.";
    }
    case "align": return st === "done" ? "Merged voice, timings, master and captions exist." : pre + "Run Align all: merge (speed & gaps), transcribe, master, captions.";
    case "plan": return st === "done" ? `${d.plan.acts.length} acts planned.` : pre + "Run the director to split the narration into acts.";
    case "acts": {
      const n = d.acts.length, done = d.acts.filter((a) => a.scene).length;
      return st === "done" ? `All ${n} acts drawn.` : pre + (n ? `${done}/${n} acts drawn: author the rest, then preview and review.` : "Plan the video first.");
    }
    case "sound": return st === "done" ? "Foley, music stem and mix are ready." : pre + "Build sound: cues, music stem, mix.";
    case "render": return st === "done" ? "Rendered." : pre + "Assemble and render a draft, then the final.";
    case "shorts": {
      const it = d.shorts.items, ex = it.filter((s) => s.progress.exported).length;
      if (!it.length) return pre + (d.kind === "shorts" ? "Write the brief, then Write shorts (one short or a series of parts)." : "Run Write shorts: 2–3 standalone 9:16 scripts from this video's script and data.");
      if (st === "done") return `All ${it.length} shorts exported: upload them from shorts/export.`;
      const todo = it.find((s) => !s.progress.exported);
      const where = !todo ? "" : todo.approval !== "approved" ? `${todo.id}: review and approve the script.` : !todo.progress.render ? `${todo.id}: run it to the draft, review, then render the final.` : !todo.progress.qc ? `${todo.id}: QC has not passed on the final.` : `${todo.id}: export it.`;
      return pre + `${ex}/${it.length} exported. ${where}`;
    }
    case "publish": {
      const p = d.publish, n = p.thumbs.filter((t) => t.file).length;
      if (st === "done") return "Packages approved: export them and run Test & Compare.";
      if (st === "stale") return pre + (p.stale[0] ? `${p.stale[0]}: ` : "") + "check it, then approve again.";
      if (!p.metadata && !n) return pre + "Run Publish all: titles + description, three thumbnails, review.";
      if (!p.metadata) return pre + "Write the titles and description.";
      if (n < 3) return pre + `${n}/3 thumbnails: design the rest.`;
      return pre + "Review the three packages (thumbnail + title), fix with notes if needed, then approve.";
    }
  }
}

/** Ask the workspace page to open and scroll to a step (step bar, "open act"). */
export const GOTO = "wg:goto";
export const gotoStep = (k: string) => window.dispatchEvent(new CustomEvent(GOTO, { detail: k }));

/** The Video section's one status, from its steps (shorts and packaging have their own: statuses.shorts / statuses.publish). */
export function videoStatus(statuses: Record<string, St> | undefined): St {
  const v = STEPS.map((s) => statuses?.[s.key] ?? "none");
  if (v.includes("running")) return "running";
  if (v.every((s) => s === "done")) return "done";
  if (v.includes("failed")) return "failed";
  if (v.includes("stale")) return "stale";
  return v.some((s) => s !== "none") ? "partial" : "none";
}
