import { useApp } from "@/hooks/app";
import { Flow } from "@/components/Flow";
import { MediaPlayer } from "@/components/MediaPlayer";
import { DataTable, Td } from "@/components/DataTable";
import { dur } from "@/lib/utils";
import { ok } from "./useStep";

export function AlignStep() {
  const { d, ws } = useApp();
  if (!d || !ws) return null;
  const a = d.align;
  const srt = `/api/ws/${encodeURIComponent(ws)}/file?path=${encodeURIComponent(`07-assembly/export/${ws}.srt`)}`;
  return (
    <Flow blocks={[
      { id: "tr", title: "Transcribe", action: "align.transcribe", label: "Transcribe", done: a.words != null, costRe: /^transcribe\b/i,
        children: a.words != null ? <div className="text-xs text-muted-foreground">{a.words} words{a.durationMs ? ` · ${dur(a.durationMs)} of narration` : ""}</div> : undefined },
      { id: "ma", title: "Master voice", action: "align.master", label: "Master voice", done: !!a.master, outAt: a.master?.mtime, costRe: /^master\b/i,
        children: a.master ? <MediaPlayer f={a.master} kind="audio" /> : undefined },
      { id: "ca", title: "Build captions", action: "align.captions", label: "Build captions", done: a.words != null, costRe: /^captions\b/i,
        children: a.chapters.length ? (
          <DataTable head={[{ label: "#" }, { label: "Chapter" }, { label: "Starts", right: true }]}>
            {a.chapters.map((c) => <tr key={c.n}><Td>{c.n}</Td><Td>{c.title}</Td><Td right>{dur(c.startMs)}</Td></tr>)}
          </DataTable>) : undefined },
      { id: "srt", title: "Export .srt", action: "align.srt", label: "Export .srt", done: ok(d, "Export .srt") || ok(d, "Align all"),
        children: <a className="inline-flex min-h-9 items-center text-brand hover:underline" href={srt} target="_blank" rel="noreferrer">Open .srt</a> },
    ]} />
  );
}
