import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { useApp } from "@/hooks/app";
import { useRunSaved } from "@/hooks/useRunSaved";
import { api } from "@/lib/api";
import { shortSpec } from "@/lib/pipeline";
import { todoText } from "@/lib/steps";
import { ago, cn, dur, money } from "@/lib/utils";
import type { PubChecks, ShortItem } from "@/lib/types";
import { ActionCard } from "@/components/ActionCard";
import { Flow, withKids } from "@/components/Flow";
import { ActionGrid } from "@/components/Layout";
import { Note, Prose } from "@/components/FileLine";
import { Lightbox } from "@/components/Lightbox";
import { MediaPlayer } from "@/components/MediaPlayer";
import { RunButton } from "@/components/RunButton";
import { SfxReview } from "@/components/SfxReview";
import { StatTile } from "@/components/StatTile";
import { StatusDot } from "@/components/Status";
import { StepPage } from "@/components/StepPage";
import { TextEditor, useDraft } from "@/components/TextEditor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardSub, CardTitle } from "@/components/ui/card";
import { Fold } from "@/components/ui/collapsible";

/** A short is <= 60 s; the voice runs about 2.4 spoken words per second including the pauses. */
const WPS = 2.4;
const DESC = "2–3 standalone 9:16 shorts (≤ 60 s) from this video's script and sourced data. Each short is its own nested workspace run through the same stages: you approve its script, run voice, align, plan and act, shape the sound, watch the draft, render the final and export. Approval is a human gate; paid stages (writing, planning, the act author, fixes) are never started by Write shorts alone.";
const STAGES = [["script", "Script"], ["voice", "Voice"], ["align", "Align"], ["plan", "Plan"], ["act", "Act"], ["sound", "Sound"], ["draft", "Draft"], ["render", "Render + QC"], ["export", "Export"]] as const;
const REDO = ["voice", "align", "plan", "act", "sound", "draft", "render"];
const APPROVAL_TONE = { approved: "success", "changed since approval": "warning", "not approved": "neutral", "no script": "danger" } as const;

function Checks({ c }: { c: PubChecks | null }) {
  if (!c) return <div className="text-xs text-muted-foreground">Not checked yet: run Check scripts.</div>;
  if (!c.errors.length && !c.warnings.length) return <div className="text-xs text-success">✓ checks passed</div>;
  return (
    <ul className="m-0 grid list-none gap-0.5 p-0 text-[12px]">
      {c.errors.map((e, i) => <li key={`e${i}`} className="text-destructive">✗ {e}</li>)}
      {c.warnings.map((e, i) => <li key={`w${i}`} className="text-warning">⚠ {e}</li>)}
    </ul>
  );
}

/** A portrait (9:16) player: never stretched to 16:9, at most 300 px wide so a phone shows it whole. */
function Portrait({ title, f }: { title: string; f: NonNullable<ShortItem["files"]["draft"]> }) {
  return (
    <figure className="m-0 grid w-full max-w-[300px] min-w-0 gap-1">
      <figcaption className="text-xs"><b>{title}</b> <span className="text-muted-foreground">{ago(f.mtime)}</span></figcaption>
      <MediaPlayer f={f} kind="video" className="aspect-[9/16] max-h-[70dvh] w-full rounded border bg-black object-contain" />
    </figure>
  );
}

/** "Redo from here": runs this stage and everything after it up to the draft (the final for Render), replacing what exists. */
function Redo({ s, stage }: { s: ShortItem; stage: string }) {
  const { busy, run } = useApp();
  if (!REDO.includes(stage)) return null;
  const to = stage === "render" ? "render" : "draft", range = stage === to ? stage : `${stage} → ${to}`;
  const paid = REDO.slice(REDO.indexOf(stage), REDO.indexOf(to) + 1).filter((x) => x === "plan" || x === "act");
  return (
    <div className="flex flex-wrap items-center gap-2.5 text-xs text-muted-foreground">
      <Button size="sm" variant="outline" disabled={!!busy || s.approval !== "approved"} onClick={() => {
        if (window.confirm(`Redo ${s.id} from ${stage}? This re-runs ${range} and replaces the outputs that exist there.`)) void run("shorts.run", s.id, { from: stage, to, force: true });
      }}><RotateCcw />Redo from here</Button>
      <span>{range}, replacing what exists{paid.length ? ` · includes paid: ${paid.join(", ")}` : ""}</span>
    </div>
  );
}

/** Remounted per short (key), so its drafts belong to the short on screen. */
function ShortFlow({ s }: { s: ShortItem }) {
  const { d, ws, file, refresh, busy } = useApp();
  const runSaved = useRunSaved();
  const script = useDraft(s.script), feedback = useDraft(s.feedback), notes = useDraft(s.notes);
  const [lb, setLb] = useState<number | null>(null);
  if (!d || !ws) return null;
  const e = s.entry, f = s.files, approved = s.approval === "approved";
  const items = [...(f.sheet ? [{ src: `${file(f.sheet.path)}&v=${Math.round(f.sheet.mtime)}`, t: 0 }] : []), ...s.thumbs.map((t) => ({ src: file(t.path), t: parseFloat(t.path.match(/t_([\d.]+)\.jpg/)?.[1] ?? "0") }))];
  const noteAt = (t: number) => { if (t > 0) notes.append(`${t.toFixed(1)} s: `); setLb(null); };
  const aLabel = `Approve ${s.id}`, rLabel = `Revise ${s.id}`, fLabel = `Fix act with notes ${s.id}`;
  const spec = shortSpec(s, d);
  const base = `shorts/${s.id}/`;
  const link = (rel: string, text: string) => <a className="font-mono text-brand" href={file(base + rel)} target="_blank" rel="noreferrer">{text}</a>;
  const mine = d.shorts.exported.filter((x) => x.path.startsWith(`shorts/export/${s.id}.`));

  const kids: Record<string, React.ReactNode> = {
    script: (
      <>
        <div className="flex flex-wrap items-center gap-2"><Checks c={s.checks} /></div>
        {(e.hook || e.payoff) && (
          <div className="grid gap-0.5 text-[12px] text-muted-foreground">
            {e.hook && <div><b className="text-foreground/80">Hook:</b> {e.hook}</div>}
            {e.payoff && <div><b className="text-foreground/80">Payoff:</b> {e.payoff}</div>}
            {e.loop && <div><b className="text-foreground/80">Loop:</b> {e.loop}</div>}
          </div>
        )}
        <TextEditor title="Script" sub={`shorts/${s.id}/02-scripting/script_raw.md`} rows={12} draft={script} spellCheck
          hint={<>Any edit needs a new approval, and the checks above are from the last <b>Check scripts</b> run: run it after saving. Spoken lines start with <code>**VO:**</code>.</>}
          onSave={async (t) => { await api.saveShortText(ws, s.id, "script", t); await refresh(); }} />
        <div className="flex flex-wrap items-center gap-2.5">
          <Badge tone={APPROVAL_TONE[s.approval as keyof typeof APPROVAL_TONE] ?? "neutral"}>{s.approval}</Badge>
          <RunButton label="Approve" running={busy?.label === aLabel} disabled={!!busy || script.dirty || approved || s.approval === "no script" || !!s.checks?.errors.length} onClick={() => runSaved("shorts.approve", s.id)} />
          <span className="text-xs text-muted-foreground">
            {approved ? `Approved${s.approvedAt ? ` ${ago(Date.parse(s.approvedAt))}` : ""}.` : script.dirty ? "Save your edits first." : s.checks?.errors.length ? "Fix the check errors first." : "The voice reads the approved script only."}
          </span>
        </div>
        <TextEditor title="Feedback for a rewrite" sub={`shorts/${s.id}/02-scripting/feedback.md`} rows={4} draft={feedback} spellCheck
          placeholder="The hook buries the number. Cut the second example; end on the loop line."
          onSave={async (t) => { await api.saveShortText(ws, s.id, "feedback", t); await refresh(); }}
          extra={<RunButton label="Revise" running={busy?.label === rLabel} disabled={!!busy || feedback.dirty || !s.feedback.trim()} onClick={() => runSaved("shorts.revise", s.id)} />} />
      </>
    ),
    voice: <>{f.voice ? <div className="max-w-xl"><MediaPlayer f={f.voice} kind="audio" label="voice" /></div> : <div className="text-xs text-muted-foreground">No voice yet.</div>}<Redo s={s} stage="voice" /></>,
    align: <>{f.srt ? <div className="text-xs">captions: {link("07-assembly/export/" + f.srt.path.split("/").pop(), f.srt.path.split("/").pop()!)}</div> : <div className="text-xs text-muted-foreground">No captions yet.</div>}<Redo s={s} stage="align" /></>,
    plan: <>{p(s, "plan") ? <div className="text-xs">plan: {link("05-video/acts.json", "05-video/acts.json")}</div> : <div className="text-xs text-muted-foreground">Not planned yet.</div>}<Redo s={s} stage="plan" /></>,
    act: (
      <>
        {(f.preview || items.length > 0) && (
          <div className="flex flex-wrap items-start gap-4">
            {f.preview && <Portrait title="Act preview" f={f.preview} />}
            {items.length > 0 && (
              <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-1" aria-label="Review frames">
                {items.map((x, i) => (
                  <figure key={x.src} className="m-0 shrink-0 cursor-zoom-in" onClick={() => setLb(i)}>
                    <img loading="lazy" src={x.src} alt="" className="block h-28 rounded border" />
                    <figcaption className="text-center font-mono text-[10.5px] text-muted-foreground">{i === 0 && f.sheet ? "sheet" : `${x.t.toFixed(1)} s`}</figcaption>
                  </figure>
                ))}
              </div>
            )}
          </div>
        )}
        {items.length === 0 && !f.preview && <div className="text-xs text-muted-foreground">No frames yet: run Frames below, or the act first.</div>}
        <ActionGrid><ActionCard id="shorts.frames" act={s.id} /><ActionCard id="shorts.review" act={s.id} /></ActionGrid>
        <TextEditor title="Director notes" sub={`shorts/${s.id}/05-video/review/A01/director_notes.md`} rows={6} draft={notes} spellCheck
          placeholder={"3.2 s: the number appears before it is spoken; it should land on the word."}
          hint="Reviews append their findings here. Fix act sends these notes to the act's author for one revision (paid), then render the frames again."
          onSave={async (t) => { await api.saveShortText(ws, s.id, "notes", t); await refresh(); }}
          extra={<RunButton label="Fix act" running={busy?.label === fLabel} disabled={!!busy || notes.dirty || !s.notes.trim()} onClick={() => runSaved("shorts.fix", s.id)} />} />
        <Redo s={s} stage="act" />
        {lb !== null && <Lightbox items={items} index={lb} onIndex={setLb} onClose={() => setLb(null)} onNote={noteAt} />}
      </>
    ),
    sound: (
      <>
        {f.mix ? <div className="max-w-xl"><MediaPlayer f={f.mix} kind="audio" label="06-audio/mix.wav" /></div> : <div className="text-xs text-muted-foreground">No mix yet: run the Sound stage.</div>}
        <SfxReview short={s.id} />
        <Redo s={s} stage="sound" />
      </>
    ),
    draft: (
      <>
        {f.draft ? <Portrait title="Draft" f={f.draft} /> : <div className="text-xs text-muted-foreground">No draft yet.</div>}
        <Redo s={s} stage="draft" />
      </>
    ),
    render: (
      <>
        {f.final ? <Portrait title="Final" f={f.final} /> : <div className="text-xs text-muted-foreground">No final yet.</div>}
        {f.final && f.draft && f.final.mtime < f.draft.mtime && <Note>The draft is newer than the final: render the final again.</Note>}
        <ActionGrid><ActionCard id="shorts.qc" act={s.id} /></ActionGrid>
        {s.qc && <Fold title={`QC report · ${ago(s.qc.mtime)}${s.progress.qc ? " · passed" : ""}`} className="rounded-lg border px-3"><div className="pb-3"><Prose>{s.qc.text}</Prose></div></Fold>}
        <Redo s={s} stage="render" />
      </>
    ),
    export: (
      <div className="grid gap-1.5 text-xs">
        {mine.length ? <div className="flex flex-wrap gap-x-4 gap-y-1">{mine.map((x) => <a key={x.path} className="font-mono text-brand" href={file(x.path)} target="_blank" rel="noreferrer">{x.path.replace("shorts/export/", "")}</a>)}</div> : <div className="text-muted-foreground">Not exported yet. Export copies every QC-passed short into shorts/export/.</div>}
        {d.shorts.exported.some((x) => x.path.endsWith("upload.md")) && <a className="font-mono text-brand" href={file("shorts/export/upload.md")} target="_blank" rel="noreferrer">upload.md</a>}
        <span className="text-muted-foreground">The overview page has this short's downloads (video, audio, stems, SFX pack, Final Cut Pro project).</span>
      </div>
    ),
  };
  return <Flow loops={spec.loops} blocks={withKids(spec.blocks, kids)} />;
}
const p = (s: ShortItem, k: keyof ShortItem["progress"]) => s.progress[k];

/** Shorts section: Write / check all, then one short at a time (S1, S2, S3) as a stage-by-stage flow. */
export function ShortsPage() {
  const { d, ws, route, go, refresh } = useApp();
  const fb = useDraft(d?.shorts.feedback ?? "");
  const sid = route.short && d?.shorts.items.some((s) => s.id === route.short) ? route.short : d?.shorts.items[0]?.id;
  // a node-view click lands on one stage of one short
  useEffect(() => {
    if (!route.step) return;
    const t = setTimeout(() => document.querySelector(`[data-block="${CSS.escape(route.step!)}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" }), 250);
    return () => clearTimeout(t);
  }, [route.step, sid]);
  if (!d || !ws) return null;
  const sh = d.shorts, st = d.statuses.shorts ?? "none", ex = sh.items.filter((s) => s.progress.exported).length;
  const cur = sh.items.find((s) => s.id === sid);
  const m = d.meta.shorts;
  const scriptOk = d.script.approval === "approved" || d.script.approval === "legacy";
  const state = st === "done" ? "done" : st === "running" ? "running" : scriptOk ? "next" : "blocked";
  const spec = cur ? shortSpec(cur, d) : null;
  return (
    <StepPage title="Shorts" desc={DESC} status={st} state={state} todo={todoText("shorts", st, d)}
      stats={<><StatTile value={sh.items.length ? `${ex}/${sh.items.length}` : "—"} label="exported" />{m && <StatTile value={dur(m.totalMs)} label={`${m.runs} runs`} />}{m && m.totalCost > 0 && <StatTile value={money(m.totalCost)} label="Claude cost" />}</>}>
      <div className="grid gap-4">
        <Fold defaultOpen={sh.items.length === 0} title={<b className="text-[13px] text-foreground">Write and check all shorts</b>} className="rounded-lg border bg-card px-3.5">
          <div className="grid gap-3 pb-3.5">
            <ActionGrid><ActionCard id="shorts.write" /><ActionCard id="shorts.check" /></ActionGrid>
            <TextEditor title="Feedback on all shorts" sub="shorts/feedback.md" rows={4} draft={fb} spellCheck
              placeholder="Open with the number, not the question. Three shorts should not share one hook shape."
              hint="Read by a full rewrite (Write shorts with Overwrite ticked). For one short, use its own feedback box and Revise."
              onSave={async (t) => { await api.saveShortsFeedback(ws, t); await refresh(); }} />
            {sh.notes && <Note>Writer's note: {sh.notes}</Note>}
          </div>
        </Fold>
        {sh.items.length === 0 && <Note>No shorts yet. {scriptOk ? "Run Write shorts." : "The long script is not approved yet; shorts are written from the approved script and the plan's data."}</Note>}
        {sh.items.length > 0 && (
          <>
            <div role="tablist" aria-label="Shorts" className="flex flex-wrap gap-2">
              {sh.items.map((s) => {
                const on = s.id === sid, next = s.progress.exported ? "exported" : STAGES.find(([k]) => k !== "script" && k !== "export" && !s.progress[k as keyof typeof s.progress])?.[1] ?? "export";
                return (
                  <button key={s.id} role="tab" aria-selected={on} onClick={() => go({ short: s.id, step: null })}
                    className={cn("grid min-w-40 max-w-64 gap-0.5 rounded-lg border bg-card px-3 py-2 text-left hover:bg-accent", on && "border-brand ring-1 ring-brand/50")}>
                    <span className="flex items-center gap-1.5"><b className="font-mono text-[13px]">{s.id}</b><span className="truncate text-xs text-muted-foreground">{s.entry.kind}</span></span>
                    <span className="truncate text-[12.5px]">{s.entry.title ?? "(untitled)"}</span>
                    <span className="text-[11px] text-muted-foreground">{s.progress.exported ? "exported" : `next: ${next}`} · {s.words} words · ~{Math.round(s.words / WPS)} s</span>
                  </button>
                );
              })}
            </div>
            {cur && spec && (
              <Card>
                <CardHeader className="flex-wrap">
                  <b className="font-mono text-[13px]">{cur.id}</b>
                  {cur.entry.kind && <Badge tone="info">{cur.entry.kind}</Badge>}
                  <CardTitle className="min-w-0 flex-1 basis-56">{cur.entry.title ?? "(untitled)"}</CardTitle>
                  <CardSub className={cn(Math.round(cur.words / WPS) > 60 && "text-destructive")}>{cur.words} words · ~{Math.round(cur.words / WPS)} s</CardSub>
                  {cur.timings.runs > 0 && <CardSub className="hidden sm:inline">{dur(cur.timings.ms)}{cur.timings.costUsd ? ` · ${money(cur.timings.costUsd)}` : ""}</CardSub>}
                </CardHeader>
                <CardBody>
                  <nav aria-label="Stages" className="flex flex-wrap gap-1">
                    {STAGES.map(([k, label], i) => {
                      const b = spec.blocks[i], status = b.done ? "done" : "none";
                      return (
                        <button key={k} onClick={() => { go({ step: k }); document.querySelector(`[data-block="${k}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" }); }}
                          className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs hover:bg-accent", route.step === k && "border-brand")}><StatusDot s={status} />{label}</button>
                      );
                    })}
                  </nav>
                  <ShortFlow key={cur.id} s={cur} />
                </CardBody>
              </Card>
            )}
          </>
        )}
      </div>
    </StepPage>
  );
}
