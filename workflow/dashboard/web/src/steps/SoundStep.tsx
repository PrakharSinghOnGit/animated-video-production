import { useApp } from "@/hooks/app";
import { ActionCard } from "@/components/ActionCard";
import { ActionGrid, Cols } from "@/components/Layout";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { MediaPlayer } from "@/components/MediaPlayer";
import { Empty, Prose } from "@/components/FileLine";

export function SoundStep() {
  const { d } = useApp();
  if (!d) return null;
  const s = d.sound, files = [...s.files, ...s.stems];
  return (
    <>
      <ActionGrid>{["sound.all", "sound.cues", "sound.music", "sound.mix"].map((k) => <ActionCard key={k} id={k} />)}</ActionGrid>
      <Cols>
        <Card><CardHeader><CardTitle>Files</CardTitle></CardHeader><CardBody>{files.length ? files.map((f) => <MediaPlayer key={f.path} f={f} kind="audio" label={f.path.replace("06-audio/", "")} />) : <Empty>Nothing yet.</Empty>}</CardBody></Card>
        <Card><CardHeader><CardTitle>Credits for the description</CardTitle></CardHeader><CardBody><Prose>{s.credits || "Appears after the mix."}</Prose></CardBody></Card>
      </Cols>
    </>
  );
}
