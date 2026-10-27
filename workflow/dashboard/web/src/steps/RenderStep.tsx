import { useApp } from "@/hooks/app";
import { Flow } from "@/components/Flow";
import { MediaPlayer } from "@/components/MediaPlayer";
import { Prose } from "@/components/FileLine";
import { ok, reruns } from "./useStep";

export function RenderStep() {
  const { d } = useApp();
  if (!d) return null;
  const r = d.render;
  const draft = r.videos.find((v) => v.path.endsWith("draft.mp4")), fin = r.videos.find((v) => v.path.endsWith("final.mp4"));
  return (
    <Flow
      loops={[
        { from: "watch", to: "draft", label: "changes → re-draft", ran: reruns(d, "Draft render") },
        { from: "qc", to: "final", label: "QC failed → re-render", ran: reruns(d, "Final render") },
      ]}
      blocks={[
        { id: "asm", title: "Assemble", action: "render.assemble", label: "Assemble", done: ok(d, "Assemble") || !!draft },
        { id: "draft", title: "Draft render", desc: "Assemble, draft render, QC.", action: "render.draft", label: "Draft render", done: !!draft, outAt: draft?.mtime, costRe: /^render draft/i },
        { id: "watch", title: "Watch & approve draft", desc: "Gate G3: watch the draft, then go on or loop back and re-render.", done: !!draft,
          children: draft ? <MediaPlayer f={draft} kind="video" className="max-h-[60vh]" /> : <div className="text-xs text-muted-foreground">No draft yet.</div> },
        { id: "final", title: "Final render", desc: "1080p H.264 with grain, then QC.", action: "render.final", label: "Final render", done: !!fin, outAt: fin?.mtime, costRe: /^render final/i,
          children: fin ? <MediaPlayer f={fin} kind="video" className="max-h-[60vh]" /> : undefined },
        { id: "qc", title: "QC", action: "render.qc", label: "QC", done: !!r.qc, outAt: r.qc?.mtime, costRe: /^qc\b/i,
          children: r.qc ? <Prose>{r.qc.text}</Prose> : undefined },
      ]}
    />
  );
}
