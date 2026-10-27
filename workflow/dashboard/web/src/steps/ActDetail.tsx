import { useRef, useState } from "react";
import { useApp } from "@/hooks/app";
import { api } from "@/lib/api";
import { ago, basename, dur, money } from "@/lib/utils";
import type { ActRow } from "@/lib/types";
import { runsFor } from "@/lib/flow";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/Status";
import { MediaPlayer } from "@/components/MediaPlayer";
import { Lightbox } from "@/components/Lightbox";
import { Note } from "@/components/FileLine";
import { TextEditor, useDraft } from "@/components/TextEditor";
import { BlockFold, Flow } from "@/components/Flow";
import { ok } from "./useStep";

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
  if (!d) return null;
  const thumbs = a.thumbs.map((t) => ({ src: file(t.path), t: parseFloat(t.path.match(/t_([\d.]+)\.jpg/)?.[1] ?? "0") }));
  const noteAt = (t: number) => { notes.append(`${t.toFixed(1)} s: `); setLb(null); };
  const pv = a.preview, pvStale = !!pv && !!a.scene && a.scene.mtime > pv.mtime;
  const fixLabel = `Fix with notes ${a.id}`;
  const fixRuns = runsFor(d, fixLabel).length;
  const approved = !!a.scene && !!pv && !pvStale && a.reviews.length > 0 && !a.notes.trim();

  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="m-0 text-[15px] font-semibold"><span className="font-mono">{a.id}</span> · {a.title}</h2>
        <StatusPill s={a.status} />
        <span className="font-mono text-[11px] text-muted-foreground">{a.scene ? basename(a.scene.path) : "no file yet"}</span>
        {a.idea && <span className="basis-full text-xs text-muted-foreground">{a.idea}</span>}
      </div>
      <Flow
        loops={[{ from: "fix", to: "preview", label: "fix → re-preview, re-review", ran: fixRuns }]}
        blocks={[
          { id: "author", title: "Author", action: "acts.act", act: a.id, label: `Author ${a.id}`, done: !!a.scene, outAt: a.scene?.mtime, costRe: new RegExp(`^act ${a.id}\\b`, "i"),
            children: a.critic ? (
              <BlockFold title={`Author's critic (${a.critic.file}): ${a.critic.score}/10`}>
                {a.critic.issues.map((x, j) => <div key={j} className="grid grid-cols-[56px_1fr] gap-2.5 border-b border-border/60 py-2 text-[12.5px]"><span className="font-mono text-brand">{x.time}</span><div>{x.problem}<div className="text-muted-foreground">→ {x.fix}</div></div></div>)}
              </BlockFold>) : undefined },
          { id: "frames", title: "Frames", action: "acts.frames", act: a.id, label: `Render frames ${a.id}`, done: thumbs.length > 0, costRe: new RegExp(`^frames ${a.id}\\b`, "i"),
            children: thumbs.length ? (
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {thumbs.map((t, i) => (
                  <figure key={t.src} className="m-0 shrink-0 cursor-zoom-in" onClick={() => setLb(i)}>
                    <img loading="lazy" src={t.src} alt="" className="block h-[72px] rounded border" />
                    <figcaption className="text-center font-mono text-[10.5px] text-muted-foreground">{t.t.toFixed(1)} s</figcaption>
                  </figure>
                ))}
              </div>) : undefined },
          { id: "preview", title: "Preview", action: "acts.preview", act: a.id, label: `Render preview ${a.id}`, done: !!pv && !pvStale, outAt: pv?.mtime, costRe: new RegExp(`^preview ${a.id}\\b`, "i"),
            children: pv ? (
              <>
                <MediaPlayer ref={video} f={pv} kind="video" />
                <div className="flex flex-wrap items-center gap-2.5">
                  <Button size="sm" onClick={() => noteAt(video.current?.currentTime ?? 0)}>Add note at current time</Button>
                  <span className="text-xs text-muted-foreground">Rendered {ago(pv.mtime)}{pvStale && <span className="text-warning"> · the act changed since: render again</span>}</span>
                </div>
              </>) : <Note>No preview yet. Render one to watch the act with its voice and effects.</Note> },
          { id: "review", title: "Review", action: "acts.review", act: a.id, label: `Review ${a.id}`, done: a.reviews.length > 0, costRe: new RegExp(`^review ${a.id}\\b`, "i"),
            children: a.reviews.length ? a.reviews.map((r, i) => (
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
              </BlockFold>)) : <span className="text-xs text-muted-foreground">No reviews yet.</span> },
          { id: "notes", title: "Notes for the author", desc: "Your gate: one line per problem, starting with the time in the act. Reviews can append findings here.", done: !!a.notes.trim(),
            children: <TextEditor title="Review notes" sub={`review/${a.id}/director_notes.md`} rows={10} draft={notes}
              onSave={async (t) => { await api.saveNotes(ws!, a.id, t); await refresh(); }}
              placeholder={'12.3 s: the IPO strip lands after "jargon"; it should be complete on the word.\n20–23 s: strips cut off at the top.'} /> },
          { id: "fix", title: "Fix with notes", desc: "Sends the notes to the act's author for one revision (resumes the author's session: the biggest cost).", action: "acts.fix", act: a.id, label: fixLabel, done: ok(d, fixLabel) && !a.notes.trim() },
          { id: "approved", title: "Approved", desc: "Done when the preview is current, a review exists, and no notes are left open.", done: approved },
        ]}
      />
      {lb !== null && <Lightbox items={thumbs} index={lb} onIndex={setLb} onClose={() => setLb(null)} onNote={noteAt} />}
    </div>
  );
}
