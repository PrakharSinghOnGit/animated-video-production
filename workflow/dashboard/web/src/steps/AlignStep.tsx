import { useApp } from "@/hooks/app";
import { Flow, BlockFold, withKids } from "@/components/Flow";
import { stepSpec } from "@/lib/pipeline";
import { MediaPlayer } from "@/components/MediaPlayer";
import { DataTable, Td } from "@/components/DataTable";
import { Badge } from "@/components/ui/badge";
import { ago, cn, dur } from "@/lib/utils";
import type { Loudness } from "@/lib/types";

/** Same threshold transcribe.ts warns at: below it the take likely says something else than the script. */
const LOW_MATCH = 80;
const lufs = (l: Loudness) => [`${l.integrated.toFixed(1)} LUFS`, `${l.truePeak.toFixed(1)} dBTP`, `${l.lra.toFixed(1)} LU`];

export function AlignStep() {
  const { d, ws, file } = useApp();
  if (!d || !ws) return null;
  const a = d.align, tr = a.transcript, m = a.masterReport;
  const spec = stepSpec("align", d);
  const low = tr?.clips.filter((c) => c.matchedPct != null && c.matchedPct < LOW_MATCH) ?? [];
  const total = a.durationMs ?? 0;
  const kids: Record<string, React.ReactNode> = {
    post: a.voice ? (
      <>
        {a.post && <div className="text-xs text-muted-foreground">speed ×{a.post.speed} · {a.post.gap} s between sections · {a.post.chapterGap} s before chapters · {a.post.maxPause ? `pauses inside capped at ${a.post.maxPause} s` : "pauses inside left as they are"}</div>}
        <MediaPlayer f={a.voice} kind="audio" label="full voiceover (merged)" />
      </>) : undefined,
    tr: tr ? (
      <>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{tr.clips.length} sections · {tr.clips.reduce((n, c) => n + c.words, 0)} words{tr.model ? ` · ${tr.model}` : ""}{tr.at ? ` · ${ago(Date.parse(tr.at))}` : ""}</span>
          {low.length ? <Badge tone="warning">{low.length} below {LOW_MATCH}% script match: listen to them</Badge> : <Badge tone="success">every section matches the script</Badge>}
        </div>
        <BlockFold defaultOpen={low.length > 0} title="Timed script (start, length, how well the voice matches the script)">
          <DataTable maxH="420px" head={[{ label: "Start", right: true }, { label: "Length", right: true }, { label: "Match", right: true }, { label: "Section" }, { label: "What was said" }]}>
            {tr.clips.map((c) => (
              <tr key={c.id} className={cn(c.matchedPct != null && c.matchedPct < LOW_MATCH && "bg-warning/8")}>
                <Td right className="font-mono">{dur(c.startMs)}</Td><Td right className="font-mono">{(c.durationMs / 1000).toFixed(1)} s</Td>
                <Td right className={cn("font-mono", c.matchedPct != null && c.matchedPct < LOW_MATCH && "text-warning")}>{c.matchedPct != null ? `${c.matchedPct}%` : "—"}</Td>
                <Td className="font-mono text-[11.5px]">{c.id}</Td><Td className="min-w-[280px]">{c.text}</Td>
              </tr>
            ))}
          </DataTable>
        </BlockFold>
      </>) : undefined,
    ma: a.master ? (
      <>
        {m ? (
          <>
            <DataTable head={[{ label: "Stage" }, { label: "What it does" }, { label: "Setting" }]}>
              {m.chain.map((c) => <tr key={c.stage} className={cn(!c.on && "text-muted-foreground")}><Td className="whitespace-nowrap font-medium">{c.stage}</Td><Td>{c.what}</Td><Td className="font-mono text-[11.5px]">{c.settings}</Td></tr>)}
            </DataTable>
            <DataTable head={[{ label: "" }, { label: "Loudness", right: true }, { label: "True peak", right: true }, { label: "Range", right: true }]}>
              {([["Before", m.before], ["After", m.after]] as const).map(([k, l]) => <tr key={k}><Td>{k}</Td>{lufs(l).map((x, i) => <Td key={i} right className="font-mono">{x}</Td>)}</tr>)}
            </DataTable>
            <div className="text-[11px] text-subtle-foreground">Length kept to the sample ({((m.durationOut - m.durationIn) * 1000).toFixed(1)} ms drift), so word timings stay in sync · mastered {ago(Date.parse(m.at))}</div>
          </>
        ) : <div className="text-xs text-muted-foreground">Run Master voice again to see what it did (older runs wrote no report).</div>}
        {a.rawVoice && <MediaPlayer f={a.rawVoice} kind="audio" label="before (merged)" />}
        <MediaPlayer f={a.master} kind="audio" label="after (mastered)" />
      </>) : undefined,
    ca: a.chapters.length ? (
      <>
        <DataTable head={[{ label: "#" }, { label: "Chapter" }, { label: "Starts", right: true }, { label: "Length", right: true }, { label: "Share", right: true }]}>
          {a.chapters[0]?.startMs > 0 && <tr><Td>—</Td><Td className="text-muted-foreground">Intro (before chapter 1)</Td><Td right className="font-mono">0 s</Td><Td right className="font-mono">{dur(a.chapters[0].startMs)}</Td><Td right className="font-mono">{total ? `${Math.round((a.chapters[0].startMs / total) * 100)}%` : ""}</Td></tr>}
          {a.chapters.map((c, i) => {
            const end = a.chapters[i + 1]?.startMs ?? total, len = Math.max(0, end - c.startMs);
            return <tr key={c.n}><Td>{c.n}</Td><Td>{c.title}</Td><Td right className="font-mono">{dur(c.startMs)}</Td><Td right className="font-mono">{total ? dur(len) : "—"}</Td><Td right className="font-mono">{total ? `${Math.round((len / total) * 100)}%` : ""}</Td></tr>;
          })}
        </DataTable>
        <div className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
          <span>{a.words} words · {total ? dur(total) : ""} of narration</span>
          {a.srt && <a className="text-brand hover:underline" href={file(a.srt.path)} target="_blank" rel="noreferrer">Open the .srt ({ago(a.srt.mtime)})</a>}
        </div>
      </>) : undefined,
  };
  return <Flow loops={spec.loops} blocks={withKids(spec.blocks, kids)} />;
}
