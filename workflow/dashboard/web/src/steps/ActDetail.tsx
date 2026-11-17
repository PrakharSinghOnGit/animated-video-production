import { useRef, useState } from "react";
import { Camera, ScanEye, Tag } from "lucide-react";
import { useApp } from "@/hooks/app";
import { useRunWith } from "@/hooks/useRunSaved";
import { useStored } from "@/lib/storage";
import { Input } from "@/components/ui/fields";
import { api } from "@/lib/api";
import { ago, basename, cn, dur, money } from "@/lib/utils";
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
  const { ws, file, refresh, d, canRun } = useApp();
  const runWith = useRunWith();
  const video = useRef<HTMLVideoElement>(null);
  const [lb, setLb] = useState<number | null>(null);
  const notes = useDraft(a.notes);
  const [at, setAt] = useState("");
  // frames you tagged for the reviewer (act-relative seconds), kept per act
  const [tags, setTags] = useStored<number[]>(`acts.tags.${ws}.${a.id}`, []);
  const [focus, setFocus] = useState("");
  const tagged = (t: number) => tags.some((x) => Math.abs(x - t) < 0.01);
  const toggleTag = (t: number) => setTags((p) => (p.some((x) => Math.abs(x - t) < 0.01) ? p.filter((x) => Math.abs(x - t) >= 0.01) : [...p, t].sort((x, y) => x - y)));
  /** Render one frame at t seconds (added to the frames already there) and tag it for the reviewer. */
  const frameAt = (t: number) => {
    const r = Math.round(Math.max(0, t) * 100) / 100;
    if (!tagged(r)) toggleTag(r);
    void runWith("acts.frames", a.id, { at: String(r), only: true });
  };
  const reviewTagged = () => runWith("acts.review", a.id, {
    noFrames: true,
    focus: `the frames at ${tags.map((t) => `${t.toFixed(2)} s`).join(", ")}${focus.trim() ? `: ${focus.trim()}` : ""}`.slice(0, 300),
  });
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
    frames: (
      <>
        <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); const t = parseFloat(at); if (Number.isFinite(t)) frameAt(t); }}>
          <label className="text-xs text-muted-foreground" htmlFor={`at-${a.id}`}>Frame at</label>
          <Input id={`at-${a.id}`} inputMode="decimal" placeholder="12.5" value={at} onChange={(e) => setAt(e.target.value.replace(/[^\d.]/g, ""))} className="!h-8 w-20" />
          <span className="text-xs text-muted-foreground">s</span>
          <Button size="sm" type="submit" disabled={!a.scene || !Number.isFinite(parseFloat(at)) || !canRun("acts.frames", a.id)}><Camera />Render frame</Button>
          <span className="text-[11px] text-subtle-foreground">Adds one frame (act time) to the ones below and tags it for the reviewer.</span>
        </form>
        {!!a.grids?.length && (
          <div className="flex gap-1.5 overflow-x-auto pb-1" aria-label="Motion grids">
            {a.grids.map((g, i) => (
              <a key={g.path} href={file(g.path)} target="_blank" rel="noreferrer" className="shrink-0" title="Motion grid: 12 frames 0.5 s apart, the spoken words under each">
                <img loading="lazy" src={`${file(g.path)}&v=${Math.round(g.mtime)}`} alt={`Motion grid ${i + 1}`} className="block h-[96px] rounded border" />
              </a>
            ))}
          </div>
        )}
        {a.checks && (a.checks.findings.length > 0 || a.checks.low > 0) && (
          <div className="text-[12.5px]">
            {a.checks.findings.map((f) => (
              <div key={f.id} className="grid grid-cols-[56px_1fr] gap-2.5 border-b border-border/60 py-1.5">
                <span className="font-mono text-brand">{f.t.toFixed(1)} s</span>
                <div><span className={cn("mr-1.5 font-mono text-[11px]", f.severity === "high" ? "text-destructive" : "text-muted-foreground")}>#{f.id} {f.kind}</span>{f.msg}</div>
              </div>
            ))}
            {a.checks.low > 0 && <div className="py-1.5 text-[11px] text-subtle-foreground">{a.checks.low} low finding(s) in review/{a.id}/checks.json</div>}
          </div>
        )}
        {thumbs.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {thumbs.map((t, i) => (
              <figure key={t.src} className="m-0 shrink-0">
                <img loading="lazy" src={t.src} alt="" onClick={() => setLb(i)} className={cn("block h-[72px] cursor-zoom-in rounded border", tagged(t.t) && "ring-2 ring-brand")} />
                <figcaption className="flex items-center justify-center gap-1 font-mono text-[10.5px] text-muted-foreground">
                  {t.t.toFixed(1)} s
                  <button type="button" onClick={() => toggleTag(t.t)} aria-pressed={tagged(t.t)} title={tagged(t.t) ? "Untag" : "Tag for the reviewer"} className={cn("rounded p-0.5 hover:text-foreground", tagged(t.t) && "text-brand")}><Tag className="size-3" /></button>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
        {tags.length > 0 && (
          <div className="grid gap-2 rounded-md border bg-raised/50 p-2.5">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <b>Tagged for review:</b>
              {tags.map((t) => <button key={t} type="button" onClick={() => toggleTag(t)} className="rounded border px-1.5 font-mono hover:line-through" title="Untag">{t.toFixed(2)} s</button>)}
              <button type="button" className="ml-auto text-muted-foreground hover:text-foreground" onClick={() => setTags([])}>Clear</button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input placeholder="What to check there (optional), e.g. the strip overlaps the title" value={focus} onChange={(e) => setFocus(e.target.value)} className="min-w-0 flex-1 basis-60" />
              <Button size="sm" variant="default" disabled={!a.scene || !canRun("acts.review", a.id)} onClick={reviewTagged}><ScanEye />Review these frames</Button>
            </div>
            <span className="text-[11px] text-subtle-foreground">Runs Review with the frames already rendered (no new grid), told to look hardest at these times. Findings land in the review list and your notes.</span>
          </div>
        )}
      </>),
    preview: pv ? (
      <>
        <MediaPlayer ref={video} f={pv} kind="video" />
        <div className="flex flex-wrap items-center gap-2.5">
          <Button size="sm" onClick={() => noteAt(video.current?.currentTime ?? 0)}>Add note at current time</Button>
          <Button size="sm" disabled={!canRun("acts.frames", a.id)} onClick={() => frameAt(video.current?.currentTime ?? 0)} title="Render this moment as a frame and tag it for the reviewer"><Camera />Frame at current time</Button>
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
      <span className="text-xs text-muted-foreground">{a.approval
        ? `You approved this version ${ago(Date.parse(a.approval.at))}. Editing the act cancels it.`
        : "Approve marks this version done, even without a review or with old notes."}</span>) : undefined,
  };
  const asides: Record<string, React.ReactNode> = {
    approved: a.scene ? (a.approval
      ? <Button size="sm" disabled={busy} onClick={() => act(() => api.unapproveAct(ws!, a.id))}>Remove approval</Button>
      : <Button size="sm" variant="default" disabled={busy} onClick={() => act(() => api.approveAct(ws!, a.id))}>Approve act</Button>) : undefined,
  };

  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-center gap-2 border-b pb-3">
        <h2 className="m-0 text-[15px] font-semibold"><span className="font-mono">{a.id}</span> · {a.title}</h2>
        <StatusPill s={a.status} />
        <span className="font-mono text-[11px] text-muted-foreground">{a.scene ? basename(a.scene.path) : "no file yet"}</span>
        {a.idea && <span className="basis-full text-xs text-muted-foreground">{a.idea}</span>}
      </div>
      <Flow loops={spec.loops} blocks={withKids(spec.blocks, kids, asides)} />
      {lb !== null && <Lightbox items={thumbs} index={lb} onIndex={setLb} onClose={() => setLb(null)} onNote={noteAt} />}
    </div>
  );
}
