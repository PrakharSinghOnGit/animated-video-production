import { useApp } from "@/hooks/app";
import { Flow, withKids } from "@/components/Flow";
import { stepSpec } from "@/lib/pipeline";
import { MediaPlayer } from "@/components/MediaPlayer";
import { DataTable, Td } from "@/components/DataTable";
import { dur } from "@/lib/utils";

export function AlignStep() {
  const { d, ws } = useApp();
  if (!d || !ws) return null;
  const a = d.align;
  const srt = `/api/ws/${encodeURIComponent(ws)}/file?path=${encodeURIComponent(`07-assembly/export/${ws}.srt`)}`;
  const spec = stepSpec("align", d);
  const kids: Record<string, React.ReactNode> = {
    tr: a.words != null ? <div className="text-xs text-muted-foreground">{a.words} words{a.durationMs ? ` · ${dur(a.durationMs)} of narration` : ""}</div> : undefined,
    ma: a.master ? <MediaPlayer f={a.master} kind="audio" /> : undefined,
    ca: a.chapters.length ? (
      <DataTable head={[{ label: "#" }, { label: "Chapter" }, { label: "Starts", right: true }]}>
        {a.chapters.map((c) => <tr key={c.n}><Td>{c.n}</Td><Td>{c.title}</Td><Td right>{dur(c.startMs)}</Td></tr>)}
      </DataTable>) : undefined,
    srt: <a className="inline-flex min-h-9 items-center text-brand hover:underline" href={srt} target="_blank" rel="noreferrer">Open .srt</a>,
  };
  return <Flow loops={spec.loops} blocks={withKids(spec.blocks, kids)} />;
}
