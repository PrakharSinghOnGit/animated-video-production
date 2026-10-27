import { useApp } from "@/hooks/app";
import { ActionCard } from "@/components/ActionCard";
import { ActionGrid } from "@/components/Layout";
import { Card, CardBody, CardHeader, CardSub, CardTitle } from "@/components/ui/card";
import { MediaPlayer } from "@/components/MediaPlayer";
import { Prose } from "@/components/FileLine";
import { ago, basename, mb } from "@/lib/utils";

export function RenderStep() {
  const { d } = useApp();
  if (!d) return null;
  const r = d.render;
  return (
    <>
      <ActionGrid>{["render.draft", "render.final", "render.qc", "render.assemble"].map((k) => <ActionCard key={k} id={k} />)}</ActionGrid>
      {r.videos.length === 0 && (
        <Card><CardBody className="place-items-center py-8 text-center text-muted-foreground"><img className="w-full max-w-md rounded-lg border" src="/brand/Banner.png" alt="The Wealth Gap" />No render yet.</CardBody></Card>
      )}
      {r.videos.map((v) => (
        <Card key={v.path}>
          <CardHeader><CardTitle>{basename(v.path)}</CardTitle><CardSub>{mb(v.size)} · {ago(v.mtime)}</CardSub></CardHeader>
          <CardBody><MediaPlayer f={v} kind="video" className="max-h-[62vh]" /></CardBody>
        </Card>
      ))}
      {r.qc && <Card><CardHeader><CardTitle>QC report</CardTitle><CardSub>{ago(r.qc.mtime)}</CardSub></CardHeader><CardBody><Prose>{r.qc.text}</Prose></CardBody></Card>}
    </>
  );
}
