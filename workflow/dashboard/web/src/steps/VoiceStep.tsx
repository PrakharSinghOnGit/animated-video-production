import { useApp } from "@/hooks/app";
import { Flow, BlockFold } from "@/components/Flow";
import { MediaPlayer } from "@/components/MediaPlayer";
import { Empty } from "@/components/FileLine";
import { reruns } from "./useStep";

export function VoiceStep() {
  const { d } = useApp();
  if (!d) return null;
  const v = d.voice;
  return (
    <Flow
      loops={[{ from: "listen", to: "gen", label: "not right → regenerate", ran: reruns(d, "Generate voice") }]}
      blocks={[
        { id: "sections", title: "Voice sections ready", desc: "Produced by “Split into sections” on the Script page.", done: v.sectionCount > 0,
          children: <div className="text-xs text-muted-foreground">{v.sectionCount ? `${v.sectionCount} sections` : "No sections yet: finish the Script step."}</div> },
        { id: "gen", title: "Generate voice", action: "voice.run", label: "Generate voice", done: v.combined.length > 0, outAt: v.combined[0]?.mtime, costRe: /^voice\b/i,
          children: v.running ? <div className="text-xs text-warning">{v.freshWavs}/{v.sectionCount} sections done this run</div> : undefined },
        { id: "listen", title: "Listen & approve", desc: "Play the full voiceover and a few sections. If something is off, adjust pace or exaggeration and regenerate.", done: v.combined.length > 0,
          children: (
            <>
              {v.combined.length ? v.combined.map((f) => <MediaPlayer key={f.path} f={f} kind="audio" />) : <Empty>Not generated yet.</Empty>}
              {v.parts.map((p) => (
                <BlockFold key={p.part} title={`${p.part.replace("part-", "Part ")} · ${p.files.length} sections`}>
                  <div className="grid gap-2 pb-3">{p.files.map((f) => <MediaPlayer key={f.path} f={f} kind="audio" />)}</div>
                </BlockFold>
              ))}
            </>) },
      ]}
    />
  );
}
