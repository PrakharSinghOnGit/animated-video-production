import { useApp } from "@/hooks/app";
import { Flow, BlockFold, withKids } from "@/components/Flow";
import { stepSpec } from "@/lib/pipeline";
import { MediaPlayer } from "@/components/MediaPlayer";
import { Empty } from "@/components/FileLine";

export function VoiceStep() {
  const { d } = useApp();
  if (!d) return null;
  const v = d.voice;
  const spec = stepSpec("voice", d);
  const kids: Record<string, React.ReactNode> = {
    sections: <div className="text-xs text-muted-foreground">{v.sectionCount ? `${v.sectionCount} sections` : "No sections yet: finish the Script step."}</div>,
    gen: v.running ? <div className="text-xs text-warning">{v.freshWavs}/{v.sectionCount} sections done this run</div> : undefined,
    listen: (
      <>
        {v.combined.length ? v.combined.map((f) => <MediaPlayer key={f.path} f={f} kind="audio" />) : <Empty>Not generated yet.</Empty>}
        {v.parts.map((p) => (
          <BlockFold key={p.part} title={`${p.part.replace("part-", "Part ")} · ${p.files.length} sections`}>
            <div className="grid gap-2 pb-3">{p.files.map((f) => <MediaPlayer key={f.path} f={f} kind="audio" />)}</div>
          </BlockFold>
        ))}
      </>),
  };
  return <Flow loops={spec.loops} blocks={withKids(spec.blocks, kids)} />;
}
