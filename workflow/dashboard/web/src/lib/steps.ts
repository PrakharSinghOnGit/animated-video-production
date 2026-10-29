import type { Details, St, StepKey } from "./types";

export const STEPS: { key: StepKey; label: string; hint: string }[] = [
  { key: "script", label: "Script", hint: "Draft → script → approval" },
  { key: "voice", label: "Voice", hint: "Local voice clone" },
  { key: "align", label: "Align", hint: "Timings, master, captions" },
  { key: "plan", label: "Plan", hint: "Acts and beats" },
  { key: "acts", label: "Acts", hint: "Draw, preview, review" },
  { key: "sound", label: "Sound", hint: "Foley and mix" },
  { key: "render", label: "Render", hint: "Draft, final, QC" },
  { key: "publish", label: "Publish", hint: "Titles, thumbnails, description" },
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
    case "voice": return st === "done" ? "Full voiceover generated." : pre + `Generate the voiceover (${d.voice.sectionCount || "no"} sections).`;
    case "align": return st === "done" ? "Timings, master and captions exist." : pre + "Run Align all: transcribe, master, captions, .srt.";
    case "plan": return st === "done" ? `${d.plan.acts.length} acts planned.` : pre + "Run the director to split the narration into acts.";
    case "acts": {
      const n = d.acts.length, done = d.acts.filter((a) => a.scene).length;
      return st === "done" ? `All ${n} acts drawn.` : pre + (n ? `${done}/${n} acts drawn: author the rest, then preview and review.` : "Plan the video first.");
    }
    case "sound": return st === "done" ? "Foley, music stem and mix are ready." : pre + "Build sound: cues, music stem, mix.";
    case "render": return st === "done" ? "Rendered." : pre + "Assemble and render a draft, then the final.";
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
