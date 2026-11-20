import { useApp } from "@/hooks/app";
import { Flow, withKids } from "@/components/Flow";
import { stepSpec } from "@/lib/pipeline";
import { MediaPlayer } from "@/components/MediaPlayer";
import { Prose } from "@/components/FileLine";
import { SeamsPanel } from "./SeamsPanel";
import { ActTimeline } from "@/components/ActTimeline";

export function RenderStep() {
  const { d } = useApp();
  if (!d) return null;
  const r = d.render;
  const draft = r.videos.find((v) => v.path.endsWith("draft.mp4")), fin = r.videos.find((v) => v.path.endsWith("final.mp4"));
  const spec = stepSpec("render", d);
  const kids: Record<string, React.ReactNode> = {
    seams: <SeamsPanel />,
    pieces: r.pieces ? <ActTimeline p={r.pieces} /> : <div className="text-xs text-muted-foreground">No timeline yet: run Assemble.</div>,
    draft: draft ? <MediaPlayer f={draft} kind="video" className="max-h-[60vh]" /> : undefined,
    final: fin ? <MediaPlayer f={fin} kind="video" className="max-h-[60vh]" /> : undefined,
    qc: r.qc ? <Prose>{r.qc.text}</Prose> : undefined,
  };
  return <Flow loops={spec.loops} blocks={withKids(spec.blocks, kids)} />;
}
