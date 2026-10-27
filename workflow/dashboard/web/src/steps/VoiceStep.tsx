import { useApp } from "@/hooks/app";
import { ActionCard } from "@/components/ActionCard";
import { ActionGrid } from "@/components/Layout";
import { Card, CardBody, CardHeader, CardSub, CardTitle } from "@/components/ui/card";
import { Fold } from "@/components/ui/collapsible";
import { MediaPlayer } from "@/components/MediaPlayer";
import { Empty } from "@/components/FileLine";

export function VoiceStep() {
  const { d } = useApp();
  if (!d) return null;
  const v = d.voice;
  return (
    <>
      <ActionGrid><ActionCard id="voice.run" /></ActionGrid>
      <Card>
        <CardHeader><CardTitle>Full voiceover</CardTitle></CardHeader>
        <CardBody>{v.combined.length ? v.combined.map((f) => <MediaPlayer key={f.path} f={f} kind="audio" />) : <Empty>Not generated yet.</Empty>}</CardBody>
      </Card>
      <Card>
        <CardHeader><CardTitle>Sections</CardTitle><CardSub>{v.parts.reduce((a, p) => a + p.files.length, 0)} files</CardSub></CardHeader>
        <CardBody className="gap-0">
          {v.parts.length === 0 && <Empty>No sections yet.</Empty>}
          {v.parts.map((p) => (
            <Fold key={p.part} title={`${p.part.replace("part-", "Part ")} · ${p.files.length} sections`} className="border-b border-border/60 last:border-0">
              <div className="grid gap-2 pb-3">{p.files.map((f) => <MediaPlayer key={f.path} f={f} kind="audio" />)}</div>
            </Fold>
          ))}
        </CardBody>
      </Card>
    </>
  );
}
