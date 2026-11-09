import { useState } from "react";
import { Plus, RotateCcw, X } from "lucide-react";
import { useApp } from "@/hooks/app";
import { useRunSaved } from "@/hooks/useRunSaved";
import { api } from "@/lib/api";
import { blockStatus, shortSpec } from "@/lib/pipeline";
import { todoText } from "@/lib/steps";
import { ago, cn, dur, money } from "@/lib/utils";
import type { PubChecks, ShortItem } from "@/lib/types";
import { ActionCard } from "@/components/ActionCard";
import { Flow, withKids } from "@/components/Flow";
import { ActionGrid } from "@/components/Layout";
import { Note, Prose } from "@/components/FileLine";
import { Lightbox } from "@/components/Lightbox";
import { MediaPlayer } from "@/components/MediaPlayer";
import { BeatMap } from "@/components/BeatMap";
import { RunButton } from "@/components/RunButton";
import { SfxReview } from "@/components/SfxReview";
import { StatTile } from "@/components/StatTile";
import { StatusDot } from "@/components/Status";
import { StepPage } from "@/components/StepPage";
import { Mark } from "@/components/StepBar";
import { TextEditor, useDraft } from "@/components/TextEditor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Fold } from "@/components/ui/collapsible";
import { ResearchPanel } from "@/components/ResearchPanel";

/** A short is <= 60 s; the voice runs about 2.4 spoken words per second including the pauses. */
const WPS = 2.4;
const DESC = "2–3 standalone 9:16 shorts (≤ 60 s) from this video's script and sourced data. Each short is its own nested workspace run through the same stages: you approve its script, run voice, align, plan and act, shape the sound, watch the draft, render the final and export. Approval is a human gate; paid stages (writing, planning, the act author, fixes) are never started by Write shorts alone.";
const DESC_PROJECT = "Shorts only, no long video: write the brief (what happened, the angle, every fact with its source), then write one short or a series of parts from it. Each short is its own workspace run through the same stages: you approve its script, run voice, align, plan and act, shape the sound, watch the draft, render the final and export. Numbers a short says must be in the brief.";
/** Same test as the server (08-shorts briefWritten): the scaffold's headings and (guidance) do not count. */
const briefWritten = (t: string) => t.replace(/^#.*$/gm, "").replace(/\([^)]*\)/g, "").trim().length >= 30;
const STAGES = [["script", "Script"], ["voice", "Voice"], ["align", "Align"], ["beat", "Music & beat"], ["plan", "Plan"], ["act", "Act"], ["sound", "Sound"], ["draft", "Draft"], ["render", "Render + QC"], ["export", "Export"]] as const;
const REDO = ["voice", "align", "beat", "plan", "act", "sound", "draft", "render"];
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
function ShortFlow({ s, stage }: { s: ShortItem; stage: string }) {
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
    beat: s.rhythm ? <BeatMap r={s.rhythm} /> : (
      <div className="text-xs text-muted-foreground">No track. Pick one in the options (library: Sound → Music stem → Music library; the bed prompts are there too), then run. Without one the short is cut to the words and Sound uses the generated bed.</div>
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
  return <Flow blocks={withKids(spec.blocks, kids).filter((b) => b.id === stage)} />;
}
const p = (s: ShortItem, k: keyof ShortItem["progress"]) => s.progress[k];

/** The next stage a short needs (its step bar opens there). */
const nextStage = (s: ShortItem, d: Parameters<typeof shortSpec>[1]) => shortSpec(s, d).blocks.find((b) => !b.done)?.id ?? "export";

/** One short in the shorts bar: id, kind, title, where it stands; × removes it (after a confirm). */
function ShortChip({ s, on, onPick }: { s: ShortItem; on: boolean; onPick: () => void }) {
  const { d, run, canRun } = useApp();
  if (!d) return null;
  const next = s.progress.exported ? "exported" : `next: ${STAGES.find(([k]) => k === nextStage(s, d))?.[1] ?? "export"}`;
  return (
    <div role="tab" aria-selected={on} className={cn("group relative grid w-60 shrink-0 snap-start gap-0.5 rounded-lg border bg-card px-3 py-2 text-left hover:bg-accent", on && "border-brand ring-1 ring-brand/50")}>
      <button type="button" onClick={onPick} className="absolute inset-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-brand" aria-label={`Open ${s.id}`} />
      <span className="flex items-center gap-1.5 pr-6"><StatusDot s={s.progress.exported ? "done" : s.approval === "approved" ? "partial" : "none"} /><b className="font-mono text-[13px]">{s.id}</b><span className="truncate text-xs text-muted-foreground">{s.entry.kind}</span></span>
      <span className="truncate text-[12.5px]">{s.entry.title || "(untitled)"}</span>
      <span className="truncate text-[11px] text-muted-foreground">{next} · {s.words} words · ~{Math.round(s.words / WPS)} s</span>
      <button type="button" title={`Remove ${s.id}`} aria-label={`Remove ${s.id}`} disabled={!canRun("shorts.remove", s.id)}
        className="absolute right-1.5 top-1.5 z-10 rounded p-1 text-subtle-foreground opacity-60 hover:bg-destructive/10 hover:text-destructive hover:opacity-100 disabled:opacity-30 group-hover:opacity-100"
        onClick={() => { if (window.confirm(`Remove ${s.id} "${s.entry.title || "untitled"}"? Its folder moves to shorts/.removed/ (restore it by moving it back).`)) void run("shorts.remove", s.id); }}>
        <X className="size-3.5" />
      </button>
    </div>
  );
}

/** The open short's stages, left to right like the video's step bar. */
function ShortStepBar({ s, cur, onPick }: { s: ShortItem; cur: string; onPick: (k: string) => void }) {
  const { d } = useApp();
  if (!d) return null;
  const spec = shortSpec(s, d), next = nextStage(s, d);
  return (
    <nav aria-label={`${s.id} stages`} className="flex overflow-x-auto rounded-lg border bg-card">
      {spec.blocks.map((b, i) => {
        const st = blockStatus(d, b), on = cur === b.id;
        return (
          <button key={b.id} onClick={() => onPick(b.id)} aria-current={on ? "step" : undefined}
            className="group relative flex min-w-[78px] flex-1 basis-0 flex-col justify-center gap-0.5 px-2.5 py-2.5 text-left outline-none transition-colors hover:bg-accent/60 focus-visible:bg-accent">
            <span className="flex items-center gap-2">
              <Mark st={st} n={i + 1} />
              <span className={cn("truncate text-[12.5px] font-medium", on ? "text-foreground" : "text-muted-foreground group-hover:text-foreground")}>{b.title.replace(" + QC", "")}</span>
              {next === b.id && !on && <span className="size-1.5 shrink-0 rounded-full bg-brand" aria-label="next" />}
            </span>
            <span aria-hidden className={cn("absolute inset-x-3 bottom-0 h-[2px] rounded-full", on ? "bg-brand" : "bg-transparent")} />
          </button>
        );
      })}
    </nav>
  );
}

/**
 * Shorts section: the shorts bar (one chip per short, + Add short, × to remove), then the open short as its own workspace:
 * its header, its stage bar, one stage below. Writing all at once and the shared feedback sit in a fold.
 */
export function ShortsPage() {
  const { d, ws, route, go, refresh } = useApp();
  const fb = useDraft(d?.shorts.feedback ?? "");
  const brief = useDraft(d?.script.idea ?? "");
  const [adding, setAdding] = useState(false);
  const sid = route.short && d?.shorts.items.some((s) => s.id === route.short) ? route.short : d?.shorts.items[0]?.id;
  if (!d || !ws) return null;
  const sh = d.shorts, st = d.statuses.shorts ?? "none", ex = sh.items.filter((s) => s.progress.exported).length;
  const cur = sh.items.find((s) => s.id === sid);
  const m = d.meta.shorts;
  const only = d.kind === "shorts";
  const scriptOk = only ? briefWritten(d.script.idea) : d.script.approval === "approved" || d.script.approval === "legacy";
  const state = st === "done" ? "done" : st === "running" ? "running" : scriptOk ? "next" : "blocked";
  const stage = cur ? (STAGES.some(([k]) => k === route.step) ? route.step! : nextStage(cur, d)) : null;
  const addOpen = adding || (sh.items.length === 0 && !only);
  return (
    <StepPage title="Shorts" desc={only ? DESC_PROJECT : DESC} status={st} state={state} todo={todoText("shorts", st, d)}
      stats={<><StatTile value={sh.items.length ? `${ex}/${sh.items.length}` : "—"} label="exported" />{m && <StatTile value={dur(m.totalMs)} label={`${m.runs} runs`} />}{m && m.totalCost > 0 && <StatTile value={money(m.totalCost)} label="Claude cost" />}</>}>
      <div className="grid grid-cols-1 gap-4 [&>*]:min-w-0">
        {only && (
          <Fold defaultOpen={!sh.items.length || !scriptOk} title={<b className="text-[13px] text-foreground">Brief{d.title ? `: ${d.title}` : ""}</b>} className="rounded-lg border bg-card px-3.5">
            <div className="grid gap-2 pb-3.5">
              <TextEditor title="Brief" sub="02-scripting/idea.md" rows={14} draft={brief} spellCheck
                hint={<>The writer's only source. Put every number a short may say under <b>Facts and sources</b>, each with its source on the same line; the check flags any number that is not here. The first <code>#</code> heading names the project.</>}
                onSave={async (t) => { await api.saveText(ws, "idea", t); await refresh(); }} />
              <Fold title={<b className="text-[13px] text-foreground">Web research (optional): sourced facts for the brief</b>} defaultOpen={!!d.script.research.trim()} className="rounded-lg border px-3">
                <div className="pb-3"><ResearchPanel actions /></div>
              </Fold>
              {!sh.items.length && (
                <ActionGrid><ActionCard id="shorts.write" /><ActionCard id="shorts.add" /></ActionGrid>
              )}
            </div>
          </Fold>
        )}
        <section aria-label="Shorts" className="grid min-w-0 gap-2">
          <div role="tablist" aria-label="Shorts" className="flex snap-x gap-2 overflow-x-auto pb-1">
            {sh.items.map((s) => <ShortChip key={s.id} s={s} on={s.id === sid} onPick={() => go({ short: s.id, step: null })} />)}
            <button type="button" onClick={() => setAdding(!adding)} aria-expanded={addOpen}
              className={cn("flex w-40 shrink-0 snap-start flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground hover:border-brand hover:text-foreground", addOpen && "border-brand text-foreground")}>
              <Plus className="size-4" />Add short
            </button>
          </div>
          {addOpen && (
            <div className="grid gap-2 rounded-lg border bg-card p-3">
              <div className="text-xs text-muted-foreground">{sh.items.length ? `The writer reads the ${sh.items.length} short${sh.items.length > 1 ? "s" : ""} that exist and writes one that repeats none of them (other kind, hook, number and payoff). Give an idea to steer it, or tick Blank to write it yourself.` : "Add one short at a time (the writer avoids repeating earlier ones), or write a whole set at once under All shorts."}</div>
              <ActionCard id="shorts.add" />
              {!scriptOk && <Note>{only ? "Write the brief first: the writer works only from it." : "The long script is not approved yet: shorts are cut from the approved script and the plan's sourced data."}</Note>}
            </div>
          )}
        </section>

        {cur && stage && (
          <section aria-label={cur.id} className="grid min-w-0 grid-cols-1 gap-3 [&>*]:min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <b className="font-mono text-[15px]">{cur.id}</b>
              {cur.entry.kind && <Badge tone="info">{cur.entry.kind}</Badge>}
              <h2 className="m-0 min-w-0 flex-1 basis-56 text-[15px] font-semibold">{cur.entry.title || "(untitled)"}</h2>
              <span className={cn("text-xs text-muted-foreground", Math.round(cur.words / WPS) > 60 && "text-destructive")}>{cur.words} words · ~{Math.round(cur.words / WPS)} s</span>
              {cur.timings.runs > 0 && <span className="text-xs text-muted-foreground">{dur(cur.timings.ms)}{cur.timings.costUsd ? ` · ${money(cur.timings.costUsd)}` : ""}</span>}
            </div>
            <ShortStepBar s={cur} cur={stage} onPick={(k) => go({ step: k })} />
            <ShortFlow key={`${cur.id}-${stage}`} s={cur} stage={stage} />
          </section>
        )}

        <Fold title={<b className="text-[13px] text-foreground">All shorts: write a set at once, check, shared feedback</b>} className="rounded-lg border bg-card px-3.5">
          <div className="grid gap-3 pb-3.5">
            <ActionGrid><ActionCard id="shorts.write" /><ActionCard id="shorts.check" /></ActionGrid>
            <TextEditor title="Feedback on all shorts" sub="shorts/feedback.md" rows={4} draft={fb} spellCheck
              placeholder="Open with the number, not the question. Three shorts should not share one hook shape."
              hint="Read by a full rewrite (Write shorts with Overwrite ticked) and by Add short. For one short, use its own feedback box and Revise."
              onSave={async (t) => { await api.saveShortsFeedback(ws, t); await refresh(); }} />
            {sh.notes && <Note>Writer's note: {sh.notes}</Note>}
          </div>
        </Fold>
      </div>
    </StepPage>
  );
}
