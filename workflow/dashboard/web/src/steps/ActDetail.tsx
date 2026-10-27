import { useRef, useState } from "react";
import { useApp } from "@/hooks/app";
import { api } from "@/lib/api";
import { ago, basename, dur, money } from "@/lib/utils";
import type { ActRow } from "@/lib/types";
import { ActionCard } from "@/components/ActionCard";
import { ActionGrid, Cols } from "@/components/Layout";
import { Card, CardBody, CardHeader, CardSub, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Fold } from "@/components/ui/collapsible";
import { StatusPill } from "@/components/Status";
import { MediaPlayer } from "@/components/MediaPlayer";
import { Lightbox } from "@/components/Lightbox";
import { Note } from "@/components/FileLine";
import { TextEditor, useDraft } from "@/components/TextEditor";

const SEV: Record<string, string> = { high: "text-destructive", medium: "text-warning", low: "text-muted-foreground" };

/** Everything for one act: preview, frames, per-act actions, notes for the author, reviews. Remounted per act (key). */
export function ActDetail({ a }: { a: ActRow }) {
  const { ws, file, refresh } = useApp();
  const video = useRef<HTMLVideoElement>(null);
  const [lb, setLb] = useState<number | null>(null);
  const notes = useDraft(a.notes);
  const thumbs = a.thumbs.map((t) => ({ src: file(t.path), t: parseFloat(t.path.match(/t_([\d.]+)\.jpg/)?.[1] ?? "0") }));
  const noteAt = (t: number) => { notes.append(`${t.toFixed(1)} s: `); setLb(null); };
  const pv = a.preview;

  return (
    <div className="grid min-w-0 gap-3.5">
      <Card>
        <CardHeader>
          <CardTitle><span className="font-mono">{a.id}</span> · {a.title}</CardTitle>
          <StatusPill s={a.status} />
          <span className="flex-1" />
          <CardSub className="hidden font-mono text-[11px] sm:inline">{a.scene ? basename(a.scene.path) : "no file yet"}</CardSub>
        </CardHeader>
        <CardBody>
          {a.idea && <div className="text-muted-foreground">{a.idea}</div>}
          {pv ? (
            <>
              <MediaPlayer ref={video} f={pv} kind="video" />
              <div className="flex flex-wrap items-center gap-2.5">
                <Button size="sm" onClick={() => noteAt(video.current?.currentTime ?? 0)}>Add note at current time</Button>
                <span className="text-xs text-muted-foreground">Preview rendered {ago(pv.mtime)}{a.scene && a.scene.mtime > pv.mtime && <span className="text-warning"> · the act changed since: render again</span>}</span>
              </div>
            </>
          ) : <Note>No preview yet. Render one below to watch the act with its voice and effects.</Note>}
          {thumbs.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {thumbs.map((t, i) => (
                <figure key={t.src} className="m-0 shrink-0 cursor-zoom-in" onClick={() => setLb(i)}>
                  <img loading="lazy" src={t.src} alt="" className="block h-[72px] rounded border" />
                  <figcaption className="text-center font-mono text-[10.5px] text-muted-foreground">{t.t.toFixed(1)} s</figcaption>
                </figure>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
      <ActionGrid>{["acts.preview", "acts.review", "acts.frames", "acts.act", "acts.fix"].map((k) => <ActionCard key={k} id={k} act={a.id} />)}</ActionGrid>
      <Cols>
        <TextEditor title="Review notes for the author" sub={`review/${a.id}/director_notes.md`} rows={13} draft={notes}
          onSave={async (t) => { await api.saveNotes(ws!, a.id, t); await refresh(); }}
          placeholder={'One line per problem, starting with the time in the act:\n12.3 s: the IPO strip lands after "jargon"; it should be complete on the word.\n20–23 s: strips cut off at the top.'}
          hint="“Fix with notes” sends these notes to the act's author for one revision (paid). Reviews can append their findings here." />
        <Card>
          <CardHeader><CardTitle>Reviews</CardTitle><CardSub>{a.reviews.length} saved</CardSub></CardHeader>
          <CardBody className="gap-0">
            {a.reviews.length === 0 && <span className="text-xs text-muted-foreground">No reviews yet. Run “Review” above.</span>}
            {a.reviews.map((r, i) => (
              <Fold key={r.file} defaultOpen={i === 0} className="border-b border-border/60 last:border-0"
                title={<span className="text-left text-foreground"><b>{r.agent}</b> · sync {r.sync}/10 · overall {r.overall}/10 · {r.issues.length} issues <span className="text-muted-foreground">· {ago(r.at)} · {dur(r.ms)} · {r.costUsd ? money(r.costUsd) : "free"} · given: {r.give.join(", ") || "frames only"}</span></span>}>
                <div className="pb-2">
                  <div className="my-1.5 text-muted-foreground">{r.summary}</div>
                  {r.issues.map((x, j) => (
                    <div key={j} className="grid grid-cols-[56px_1fr_auto] gap-2.5 border-b border-border/60 py-2 text-[12.5px] last:border-0">
                      <button className="min-h-8 self-start text-left font-mono text-brand" onClick={() => { const v = video.current; if (v) { v.currentTime = parseFloat(x.time) || 0; void v.play(); } }}>{x.time}</button>
                      <div>
                        <span className={SEV[x.severity]}>{x.kind} · {x.severity}</span> {x.seen}
                        {x.said && <div className="text-muted-foreground">said: “{x.said}”</div>}
                        <div className="text-muted-foreground">→ {x.fix}</div>
                      </div>
                      <Button size="sm" onClick={() => notes.append(`${x.time}: ${x.seen}${x.said ? ` (said: "${x.said}")` : ""}. Fix: ${x.fix}`)}>To notes</Button>
                    </div>
                  ))}
                </div>
              </Fold>
            ))}
            {a.critic && (
              <Fold title={`Author's critic (${a.critic.file}): ${a.critic.score}/10`}>
                {a.critic.issues.map((x, j) => (
                  <div key={j} className="grid grid-cols-[56px_1fr] gap-2.5 border-b border-border/60 py-2 text-[12.5px]"><span className="font-mono text-brand">{x.time}</span><div>{x.problem}<div className="text-muted-foreground">→ {x.fix}</div></div></div>
                ))}
              </Fold>
            )}
          </CardBody>
        </Card>
      </Cols>
      {lb !== null && <Lightbox items={thumbs} index={lb} onIndex={setLb} onClose={() => setLb(null)} onNote={noteAt} />}
    </div>
  );
}
