import { useState } from "react";
import { PenLine, Plus, RotateCcw, X } from "lucide-react";
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
import { Stepper } from "@/components/StepBar";
import { TextEditor, useDraft } from "@/components/TextEditor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Fold } from "@/components/ui/collapsible";
import { ResearchPanel } from "@/components/ResearchPanel";

/** The voice runs about 2.4 spoken words per second including the pauses (a short's limit: its maxS, 60 s by default). */
const WPS = 2.4;
const DESC = "2–3 standalone 9:16 shorts (60 s by default, up to 3 min with Max length) from this video's script and sourced data. Each short is its own nested workspace run through the same stages: you approve its script, run voice, align, plan and act, shape the sound, watch the draft, render the final and export. Approval is a human gate; paid stages (writing, planning, the act author, fixes) are never started by Write shorts alone.";
const DESC_PROJECT = "Shorts only, no long video: write the brief (what happened, the angle, every fact with its source), then write one short or a series of parts from it. Each short is its own workspace run through the same stages: you approve its script, run voice, align, plan and act, shape the sound, watch the draft, render the final and export. Numbers a short says must be in the brief.";
/** Same test as the server (08-shorts briefWritten): the scaffold's headings and (guidance) do not count. */
const briefWritten = (t: string) => t.replace(/^#.*$/gm, "").replace(/\([^)]*\)/g, "").trim().length >= 30;
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

/** Minutes:seconds label of a length limit (2:40, 3 min). */
const lenLabel = (s: number) => (s >= 60 && s % 60 === 0 ? `${s / 60} min` : s > 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : `${s} s`);

/**
 * The shorts as tabs across the top (like the project's section tabs): the writing page first (the brief in a shorts
 * project), then one tab per short with where it stands; × removes a short (after a confirm); + adds one.
 */
function ShortsTabs({ sid, writing, onAdd }: { sid: string | undefined; writing: boolean; onAdd: () => void }) {
  const { d, go, run, canRun } = useApp();
  if (!d) return null;
  const only = d.kind === "shorts";
  const tab = "group relative flex shrink-0 items-center gap-2 px-3 text-[13px] font-medium outline-none transition-colors focus-visible:bg-accent";
  const bar = (on: boolean) => <span aria-hidden className={cn("absolute inset-x-2 bottom-0 h-[2px] rounded-full", on ? "bg-brand" : "bg-transparent")} />;
  return (
    <nav aria-label="Shorts" className="flex h-11 shrink-0 items-stretch gap-1 overflow-x-auto border-b bg-background px-4 max-sm:px-2">
      <button onClick={() => go({ short: null, step: "write" })} aria-current={writing ? "page" : undefined} className={cn(tab, writing ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
        <PenLine className="size-[15px] text-subtle-foreground" />{only ? "Brief & writing" : "Write shorts"}{bar(writing)}
      </button>
      <span aria-hidden className="my-3 w-px shrink-0 bg-border" />
      {d.shorts.items.map((s) => {
        const on = !writing && s.id === sid;
        const st = s.progress.exported ? "done" : d.jobs.some((j) => j.status === "running" && j.label.endsWith(` ${s.id}`)) ? "running" : s.approval === "approved" ? "partial" : "none";
        return (
          <div key={s.id} className={cn(tab, "pr-1.5", on ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
            <button onClick={() => go({ short: s.id, step: null })} aria-current={on ? "page" : undefined} title={s.entry.title || s.id} className="flex items-center gap-2 outline-none">
              <StatusDot s={st} /><b className="font-mono">{s.id}</b><span className="max-w-[180px] truncate font-normal">{s.entry.title || "(untitled)"}</span>
            </button>
            <button type="button" title={`Remove ${s.id}`} aria-label={`Remove ${s.id}`} disabled={!canRun("shorts.remove", s.id)}
              className="rounded p-0.5 text-subtle-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 disabled:hidden group-hover:opacity-100 max-md:opacity-60"
              onClick={() => { if (window.confirm(`Remove ${s.id} "${s.entry.title || "untitled"}"? Its folder moves to shorts/.removed/ (restore it by moving it back).`)) void run("shorts.remove", s.id); }}>
              <X className="size-3.5" />
            </button>
            {bar(on)}
          </div>
        );
      })}
      <button onClick={onAdd} className={cn(tab, "text-muted-foreground hover:text-foreground")}><Plus className="size-[15px]" />Add short</button>
    </nav>
  );
}

/**
 * Shorts section, laid out like the Video section: the shorts as tabs, the open short's stages as the step bar, and the
 * open stage as its own page below. The first tab is the writing page (a shorts project's brief and research, writing a
 * set, adding one, the shared feedback).
 */
export function ShortsPage() {
  const { d, ws, route, go, refresh } = useApp();
  const fb = useDraft(d?.shorts.feedback ?? "");
  const brief = useDraft(d?.script.idea ?? "");
  const [adding, setAdding] = useState(false);
  const sid = route.short && d?.shorts.items.some((s) => s.id === route.short) ? route.short : route.step === "write" ? undefined : d?.shorts.items[0]?.id;
  if (!d || !ws) return null;
  const sh = d.shorts, st = d.statuses.shorts ?? "none", ex = sh.items.filter((s) => s.progress.exported).length;
  const cur = sh.items.find((s) => s.id === sid);
  const writing = !cur;
  const m = d.meta.shorts;
  const only = d.kind === "shorts";
  const scriptOk = only ? briefWritten(d.script.idea) : d.script.approval === "approved" || d.script.approval === "legacy";
  const state = st === "done" ? "done" : st === "running" ? "running" : scriptOk ? "next" : "blocked";
  const addOpen = adding || sh.items.length === 0;
  const scroll = (el: React.ReactNode) => <div className="min-h-0 flex-1 overflow-y-auto" id="step-scroll">{el}</div>;
  const tabs = <ShortsTabs sid={sid} writing={writing} onAdd={() => { setAdding(true); go({ short: null, step: "write" }); }} />;

  if (writing) {
    return (
      <>
        {tabs}
        {scroll(
          <StepPage title={only ? "Brief & writing" : "Write shorts"} desc={only ? DESC_PROJECT : DESC} status={st} state={state} todo={todoText("shorts", st, d)}
            stats={<><StatTile value={sh.items.length ? `${ex}/${sh.items.length}` : "—"} label="exported" />{m && <StatTile value={dur(m.totalMs)} label={`${m.runs} runs`} />}{m && m.totalCost > 0 && <StatTile value={money(m.totalCost)} label="Claude cost" />}</>}>
            <div className="grid grid-cols-1 gap-4 [&>*]:min-w-0">
              {only && (
                <section aria-label="Brief" className="grid gap-2">
                  <TextEditor title="Brief" sub="02-scripting/idea.md" rows={14} draft={brief} spellCheck
                    hint={<>The writer's only source. Put every number a short may say under <b>Facts and sources</b>, each with its source on the same line; the check flags any number that is not here. The first <code>#</code> heading names the project.</>}
                    onSave={async (t) => { await api.saveText(ws, "idea", t); await refresh(); }} />
                  <Fold title={<b className="text-[13px] text-foreground">Web research (optional): sourced facts for the brief</b>} defaultOpen={!!d.script.research.trim()} className="rounded-lg border px-3">
                    <div className="pb-3"><ResearchPanel actions /></div>
                  </Fold>
                </section>
              )}
              {!scriptOk && <Note>{only ? "Write the brief first: the writer works only from it." : "The long script is not approved yet: shorts are cut from the approved script and the plan's sourced data."}</Note>}
              <ActionGrid><ActionCard id="shorts.write" /><ActionCard id="shorts.check" /></ActionGrid>
              <Fold open={addOpen} onOpenChange={setAdding} title={<b className="text-[13px] text-foreground">Add one short</b>} className="rounded-lg border bg-card px-3.5">
                <div className="grid gap-2 pb-3.5">
                  <div className="text-xs text-muted-foreground">{sh.items.length ? `The writer reads the ${sh.items.length} short${sh.items.length > 1 ? "s" : ""} that exist and writes one that repeats none of them (other kind, hook, number and payoff). Give an idea to steer it, or tick Blank to write it yourself.` : "Write a whole set above, or add one short at a time (the writer avoids repeating earlier ones)."}</div>
                  <ActionCard id="shorts.add" />
                </div>
              </Fold>
              <TextEditor title="Feedback on all shorts" sub="shorts/feedback.md" rows={4} draft={fb} spellCheck
                placeholder="Open with the number, not the question. Three shorts should not share one hook shape."
                hint="Read by a full rewrite (Write shorts with Overwrite ticked) and by Add short. For one short, use its own feedback box and Revise."
                onSave={async (t) => { await api.saveShortsFeedback(ws, t); await refresh(); }} />
              {sh.notes && <Note>Writer's note: {sh.notes}</Note>}
            </div>
          </StepPage>,
        )}
      </>
    );
  }

  // one short: its stages are the step bar, the open stage is the page
  const spec = shortSpec(cur, d), next = nextStage(cur, d);
  const stage = spec.blocks.some((b) => b.id === route.step) ? route.step! : next;
  const block = spec.blocks.find((b) => b.id === stage)!;
  const bst = blockStatus(d, block);
  const bstate = bst === "running" ? "running" : block.done ? "done" : stage === next ? "next" : "todo";
  const secs = Math.round(cur.words / WPS);
  return (
    <>
      {tabs}
      <Stepper label={`${cur.id} stages`} current={stage} onPick={(k) => go({ short: cur.id, step: k })}
        items={spec.blocks.map((b) => ({ key: b.id, label: b.title.replace(" + QC", ""), st: blockStatus(d, b), next: next === b.id }))} />
      {scroll(
        <StepPage key={`${cur.id}-${stage}`} title={`${block.title}`} desc={block.desc ?? ""} status={bst === "todo" ? "none" : bst} state={bstate}
          todo={`${cur.id}${cur.entry.kind ? ` · ${cur.entry.kind}` : ""} · ${cur.entry.title || "(untitled)"}${block.note ? ` · ${block.note}` : ""}`}
          stats={<>
            <StatTile value={`~${secs} s`} label={`of ${lenLabel(cur.maxS)} max · ${cur.words} words`} />
            {cur.timings.runs > 0 && <StatTile value={dur(cur.timings.ms)} label={`${cur.timings.runs} runs`} />}
            {cur.timings.costUsd > 0 && <StatTile value={money(cur.timings.costUsd)} label="cost" />}
          </>}>
          <ShortFlow s={cur} stage={stage} />
        </StepPage>,
      )}
    </>
  );
}
