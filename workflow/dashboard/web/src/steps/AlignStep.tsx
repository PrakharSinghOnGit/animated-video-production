import { useApp } from "@/hooks/app";
import { ActionCard } from "@/components/ActionCard";
import { ActionGrid, Cols } from "@/components/Layout";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { MediaPlayer } from "@/components/MediaPlayer";
import { DataTable, Td } from "@/components/DataTable";
import { Empty } from "@/components/FileLine";
import { dur } from "@/lib/utils";

export function AlignStep() {
  const { d, ws } = useApp();
  if (!d || !ws) return null;
  const a = d.align;
  return (
    <>
      <ActionGrid>{["align.all", "align.transcribe", "align.master", "align.captions", "align.srt"].map((k) => <ActionCard key={k} id={k} />)}</ActionGrid>
      <Cols>
        <Card>
          <CardHeader><CardTitle>Mastered voice</CardTitle></CardHeader>
          <CardBody>
            {a.master ? <MediaPlayer f={a.master} kind="audio" /> : <Empty>Not mastered yet.</Empty>}
            <a className="inline-flex min-h-9 items-center text-brand hover:underline" href={`/api/ws/${encodeURIComponent(ws)}/file?path=${encodeURIComponent(`07-assembly/export/${ws}.srt`)}`} target="_blank" rel="noreferrer">Open .srt</a>
          </CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>Chapters</CardTitle></CardHeader>
          {a.chapters.length ? (
            <DataTable head={[{ label: "#" }, { label: "Title" }, { label: "Starts", right: true }]}>
              {a.chapters.map((c) => <tr key={c.n}><Td>{c.n}</Td><Td>{c.title}</Td><Td right>{dur(c.startMs)}</Td></tr>)}
            </DataTable>
          ) : <CardBody><Empty>No chapters in this script.</Empty></CardBody>}
        </Card>
      </Cols>
    </>
  );
}
