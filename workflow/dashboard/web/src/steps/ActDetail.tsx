import { useRef, useState } from "react";
import { useApp } from "@/hooks/app";
import { api } from "@/lib/api";
import { ago, basename, dur, money } from "@/lib/utils";
import type { ActRow } from "@/lib/types";
import { actSpec } from "@/lib/pipeline";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/Status";
import { MediaPlayer } from "@/components/MediaPlayer";
import { Lightbox } from "@/components/Lightbox";
import { Note } from "@/components/FileLine";
import { TextEditor, useDraft } from "@/components/TextEditor";
import { BlockFold, Flow, withKids } from "@/components/Flow";

const SEV: Record<string, string> = { high: "text-destructive", medium: "text-warning", low: "text-muted-foreground" };

/**
 * One act as a flow: author -> frames -> preview -> review -> notes -> fix (loops back to preview) -> approved.
 * Remounted per act (key), so the notes draft and the video ref belong to the act on screen.
 */
export function ActFlow({ a }: { a: ActRow }) {
  const { ws, file, refresh, d } = useApp();
  const video = useRef<HTMLVideoElement>(null);
  const [lb, setLb] = useState<number | null>(null);
  const notes = useDraft(a.notes);
  const [busy, setBusy] = useState(false);
  const act = async (f: () => Promise<unknown>) => { setBusy(true); try { await f(); await refresh(); } finally { setBusy(false); } };
  if (!d) return null;
  const thumbs = a.thumbs.map((t) => ({ src: file(t.path), t: parseFloat(t.path.match(/t_([\d.]+)\.jpg/)?.[1] ?? "0") }));
  const noteAt = (t: number) => { notes.append(`${t.toFixed(1)} s: `); setLb(null); };
  const pv = a.preview, pvStale = !!pv && !!a.scene && a.scene.mtime > pv.mtime;
  const spec = actSpec(a, d);
  const kids: Record<string, React.ReactNode> = {
    author: a.critic ? (
      <BlockFold title={`Author's critic (${a.critic.file}): ${a.critic.score}/10`}>
        {a.critic.issues.map((x, j) => <div key={j} className="grid grid-cols-[56px_1fr] gap-2.5 border-b border-border/60 py-2 text-[12.5px]"><span className="font-mono text-brand">{x.time}</span><div>{x.problem}<div className="text-muted-foreground">→ {x.fix}</div></div></div>)}
      </BlockFold>) : undefined,
    frames: thumbs.length ? (
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {thumbs.map((t, i) => (
          <figure key={t.src} className="m-0 shrink-0 cursor-zoom-in" onClick={() => setLb(i)}>
            <img loading="lazy" src={t.src} alt="" className="block h-[72px] rounded border" />
            <figcaption className="text-center font-mono text-[10.5px] text-muted-foreground">{t.t.toFixed(1)} s</figcaption>
          </figure>
        ))}
      </div>) : undefined,
    preview: pv ? (
      <>
        <MediaPlayer ref={video} f={pv} kind="video" />
        <div className="flex flex-wrap items-center gap-2.5">
          <Button size="sm" onClick={() => noteAt(video.current?.currentTime ?? 0)}>Add note at current time</Button>
          <span className="text-xs text-muted-foreground">Rendered {ago(pv.mtime)}{pvStale && <span className="text-warning"> · the act changed since: render again</span>}</span>
        </div>
      </>) : <Note>No preview yet. Render one to watch the act with its voice and effects.</Note>,
    review: a.reviews.length ? a.reviews.map((r, i) => (
      <BlockFold key={r.file} defaultOpen={i === 0}
        title={<span className="text-left text-foreground"><b>{r.agent}</b> · sync {r.sync}/10 · overall {r.overall}/10 · {r.issues.length} issues <span className="text-muted-foreground">· {ago(r.at)} · {dur(r.ms)} · {r.costUsd ? money(r.costUsd) : "free"} · given: {r.give.join(", ") || "frames only"}</span></span>}>
        <div className="pb-2">
          <div className="my-1.5 text-muted-foreground">{r.summary}</div>
          {r.issues.map((x, j) => (
            <div key={j} className="grid grid-cols-[56px_1fr_auto] gap-2.5 border-b border-border/60 py-2 text-[12.5px] last:border-0">
              <button className="min-h-8 self-start text-left font-mono text-brand" onClick={() => { const v = video.current; if (v) { v.currentTime = parseFloat(x.time) || 0; void v.play(); } }}>{x.time}</button>
              <div><span className={SEV[x.severity]}>{x.kind} · {x.severity}</span> {x.seen}{x.said && <div className="text-muted-foreground">said: “{x.said}”</div>}<div className="text-muted-foreground">→ {x.fix}</div></div>
              <Button size="sm" onClick={() => notes.append(`${x.time}: ${x.seen}${x.said ? ` (said: "${x.said}")` : ""}. Fix: ${x.fix}`)}>To notes</Button>
            </div>
          ))}
        </div>
      </BlockFold>)) : <span className="text-xs text-muted-foreground">No reviews yet.</span>,
    notes: <TextEditor title="Review notes" sub={`review/${a.id}/director_notes.md`} rows={10} draft={notes}
      onSave={async (t) => { await api.saveNotes(ws!, a.id, t); await refresh(); }}
      placeholder={'12.3 s: the IPO strip lands after "jargon"; it should be complete on the word.\n20–23 s: strips cut off at the top.'} />,
    approved: a.scene ? (
      <div className="flex flex-wrap items-center gap-2.5">
        {a.approval
          ? <><span className="text-xs text-muted-foreground">You approved this version {ago(Date.parse(a.approval.at))}. Editing the act cancels it.</span>
              <Button size="sm" disabled={busy} onClick={() => act(() => api.unapproveAct(ws!, a.id))}>Remove approval</Button></>
          : <><Button size="sm" disabled={busy} onClick={() => act(() => api.approveAct(ws!, a.id))}>Approve act</Button>
              <span className="text-xs text-muted-foreground">Marks this version done, even without a review or with old notes.</span></>}
      </div>) : undefined,
  };

  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="m-0 text-[15px] font-semibold"><span className="font-mono">{a.id}</span> · {a.title}</h2>
        <StatusPill s={a.status} />
        <span className="font-mono text-[11px] text-muted-foreground">{a.scene ? basename(a.scene.path) : "no file yet"}</span>
        {a.idea && <span className="basis-full text-xs text-muted-foreground">{a.idea}</span>}
      </div>
      <Flow loops={spec.loops} blocks={withKids(spec.blocks, kids)} />
      {lb !== null && <Lightbox items={thumbs} index={lb} onIndex={setLb} onClose={() => setLb(null)} onNote={noteAt} />}
    </div>
  );
}
