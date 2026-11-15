import { useEffect, useMemo, useRef } from "react";
import { Loader2, PenLine, ScanEye, Square } from "lucide-react";
import { useApp } from "@/hooks/app";
import { useEdgeFade } from "@/hooks/useEdgeFade";
import { useRunWith } from "@/hooks/useRunSaved";
import { api } from "@/lib/api";
import { useStored } from "@/lib/storage";
import { dur, money, cn } from "@/lib/utils";
import { ActionCard } from "@/components/ActionCard";
import { StatusDot } from "@/components/Status";
import { Button } from "@/components/ui/button";
import { Checkbox, NativeSelect } from "@/components/ui/fields";
import { Fold } from "@/components/ui/collapsible";
import { ActFlow } from "./ActDetail";

/**
 * The Acts step header: every act in a scrolling list (pick one to open it below; tick several for a batch), a model
 * per act, and the batch actions. Jobs on different acts run side by side, so you can review A01 while A05 is authored.
 */
export function ActsHeader() {
  const { d, ws, route, go, schema, runningJobs, canRun, jobFor, toast } = useApp();
  const runWith = useRunWith();
  const [sel, setSel] = useStored<string[]>(`acts.sel.${ws}`, []);
  const [models, setModels] = useStored<Record<string, string>>(`acts.models.${ws}`, {});
  const strip = useRef<HTMLUListElement>(null);
  const fade = useEdgeFade(strip, d?.acts.length ?? 0);
  // keep the open act in view in the strip
  useEffect(() => { strip.current?.querySelector(`[data-act="${route.act ?? ""}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" }); }, [route.act]);
  const choices = useMemo(() => schema["acts.act"]?.opts.find((o) => o.key === "model")?.choices ?? ["default"], [schema]);
  if (!d || !ws || !d.acts.length) return null;
  const acts = d.acts, ids = new Set(acts.map((a) => a.id));
  const picked = sel.filter((x) => ids.has(x));
  const open = acts.find((x) => x.id === route.act) ?? acts[0];
  const toggle = (id: string, on: boolean) => setSel((p) => (on ? [...p.filter((x) => x !== id), id] : p.filter((x) => x !== id)));
  const missing = acts.filter((a) => !a.scene).map((a) => a.id);
  // a batch with nothing ticked authors the missing acts and continues the cut-off ones
  const todo = acts.filter((a) => !a.scene || a.unfinished).map((a) => a.id);
  // per-act models for the acts this batch will author ("default" = the batch model in the options)
  const target = picked.length ? picked : todo;
  const modelArg = target.filter((id) => models[id] && models[id] !== "default").map((id) => `${id}=${models[id]}`).join(",");
  const batch = jobFor(schema["acts.all"]?.label ?? "Author acts"), reviewing = jobFor(schema["acts.reviewAll"]?.label ?? "Review acts");
  // nothing ticked = "Finish N acts": send exactly those acts and never --force, so a saved "Redo acts that exist"
  // can't turn the button into a redo of every act, and a cut-off act continues its file instead of starting over
  const author = () => runWith("acts.all", undefined, picked.length ? { acts: picked, models: modelArg || undefined } : { acts: todo, force: false, models: modelArg || undefined });
  const review = () => runWith("acts.reviewAll", undefined, { acts: picked });
  const changed = Object.entries(d.plan.changed ?? {});
  const updating = jobFor(schema["acts.changed"]?.label ?? "Update changed acts");
  const stopBatch = async () => { try { await api.stopBatch(ws); toast("The running acts finish; no new act starts."); } catch (e) { toast((e as Error).message); } };

  return (
    <>
    {changed.length > 0 && (
      <section aria-label="Acts whose narration changed" className="grid gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <b className="text-[12.5px]">The script changed: {changed.length} act{changed.length > 1 ? "s" : ""} to update</b>
          <span className="text-muted-foreground">the other acts were only moved to the new voice and keep their drawing</span>
          <Button size="sm" variant="default" className="ml-auto" disabled={!canRun("acts.changed")} onClick={() => runWith("acts.changed")}>
            {updating ? <Loader2 className="animate-spin" /> : <PenLine />}Update {changed.length} changed act{changed.length > 1 ? "s" : ""}
          </Button>
        </div>
        {changed.map(([id, c]) => (
          <Fold key={id} title={<span><span className="font-mono font-semibold">{id}</span> · {c.notes.length ? `${c.notes.length} plan note${c.notes.length > 1 ? "s" : ""} · ` : ""}what was said before and now</span>}>
            <div className="grid gap-1 pb-2 pl-5">
              <div><span className="text-muted-foreground">before: </span>{c.before}</div>
              <div><span className="text-muted-foreground">now: </span><span className="text-foreground">{c.now}</span></div>
              {c.notes.map((n, i) => <div key={i} className="text-warning">{n}</div>)}
            </div>
          </Fold>
        ))}
        <span className="text-[11px] text-subtle-foreground">A drawn act gets one update round in its author's session (old lines → new lines, the rest kept), {schema["acts.changed"]?.paid}. Model and parallel acts: Batch options below.</span>
      </section>
    )}
    <ActsProgress />
    <section aria-label="Acts" className="overflow-hidden rounded-lg border bg-background shadow-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b bg-raised/60 px-3 py-2 text-xs">
        <b className="text-[12.5px] font-semibold">All acts</b>
        <span className="text-muted-foreground">{acts.length - missing.length}/{acts.length} drawn · click an act to open it below, tick acts for a batch</span>
        <span className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => setSel(missing)}>Missing</Button>
          <Button size="sm" variant="ghost" onClick={() => setSel(acts.map((a) => a.id))}>All</Button>
          <Button size="sm" variant="ghost" onClick={() => setSel([])}>None</Button>
        </span>
      </div>
      <ul ref={strip} style={fade} className="m-0 flex list-none snap-x scroll-px-2.5 gap-2 overflow-x-auto p-2.5" role="listbox" aria-label="Acts" aria-orientation="horizontal">
        {acts.map((x) => {
          const rv = x.reviews[0], on = picked.includes(x.id), job = runningJobs.find((j) => j.locks?.includes(`act:${x.id}`)), isOpen = x.id === open?.id;
          return (
            <li key={x.id} role="option" aria-selected={isOpen} data-act={x.id}
              className={cn("relative grid w-[212px] shrink-0 snap-start gap-1.5 rounded-lg border bg-card p-2.5 transition-colors", isOpen ? "border-brand ring-1 ring-brand/50" : "hover:bg-accent/50", on && !isOpen && "border-brand/50")}>
              <div className="flex items-center gap-2">
                <Checkbox className="relative z-10" checked={on} onCheckedChange={(v) => toggle(x.id, v === true)} aria-label={`Pick ${x.id} for a batch`} />
                {job ? <Loader2 className="size-3.5 animate-spin text-warning" aria-label="running" /> : <StatusDot s={x.status} />}
                <span className="font-mono text-[13px] font-semibold">{x.id}</span>
                {x.unfinished && !job ? <span className="ml-auto rounded bg-warning/15 px-1.5 text-[10.5px] text-warning" title={`Cut off: ${x.unfinished}. The next batch continues this file`}>cut off</span>
                  : d.plan.changed?.[x.id] ? <span className="ml-auto rounded bg-warning/15 px-1.5 text-[10.5px] text-warning" title="The script change rewrote this act's narration: Update changed acts">narration changed</span>
                  : <span className="ml-auto text-[11px] text-muted-foreground">{rv ? `sync ${rv.sync}/10` : x.critic ? `critic ${x.critic.score}/10` : ""}</span>}
              </div>
              <button type="button" onClick={() => go({ act: x.id })} className="min-w-0 text-left outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:underline">
                <span className="block truncate text-[12.5px]">{x.title}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {((x.end - x.start) / 1000).toFixed(0)} s{x.meta ? ` · ${dur(x.meta.totalMs)} · ${money(x.meta.totalCost)}` : ""}{x.approval ? " · approved" : ""}{job ? ` · ${job.label}` : ""}
                </span>
              </button>
              <NativeSelect aria-label={`Author model for ${x.id}`} title="Model that authors this act in a batch (default = the batch model)" className="relative z-10 !h-7 w-full text-xs"
                value={models[x.id] && choices.includes(models[x.id]) ? models[x.id] : "default"} onChange={(e) => setModels((p) => ({ ...p, [x.id]: e.target.value }))}>
                {choices.map((c) => <option key={c} value={c}>{c === "default" ? "batch model" : c}</option>)}
              </NativeSelect>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-2 border-t bg-raised/60 px-3 py-2">
        <Button size="sm" variant="default" disabled={!canRun("acts.all") || (!picked.length && !todo.length)} onClick={author}>
          {batch ? <Loader2 className="animate-spin" /> : <PenLine />}{picked.length ? `Author ${picked.length} picked` : todo.length ? `Finish ${todo.length} act${todo.length > 1 ? "s" : ""} (${todo.join(", ")})` : "All drawn: tick acts to redo"}
        </Button>
        <Button size="sm" variant="secondary" disabled={!canRun("acts.reviewAll") || (!picked.length && missing.length === acts.length)} onClick={review}>
          {reviewing ? <Loader2 className="animate-spin" /> : <ScanEye />}{picked.length ? `Review ${picked.length} picked` : "Review all drawn"}
        </Button>
        {batch && <Button size="sm" variant="secondary" onClick={stopBatch} title="Acts being authored finish; queued acts don't start"><Square className="fill-current" />Start no more acts</Button>}
        <span className="text-[11px] text-subtle-foreground">{schema["acts.all"]?.paid?.replace(/\s*per act$/, "")} per act{modelArg ? ` · own models: ${modelArg}` : ""}</span>
      </div>
      <Fold title="Batch options (parallel acts, batch model, usage limit, reviewer)" className="border-t px-3">
        <div className="grid gap-3 pb-3">
          <div className="rounded-md border"><div className="px-3 pt-2 text-xs font-semibold">Author</div><ActionCard bare id="acts.all" hide={["acts", "models"]} /></div>
          <div className="rounded-md border"><div className="px-3 pt-2 text-xs font-semibold">Review</div><ActionCard bare id="acts.reviewAll" hide={["acts"]} /></div>
          <div className="rounded-md border"><div className="px-3 pt-2 text-xs font-semibold">Update changed acts</div><ActionCard bare id="acts.changed" /></div>
        </div>
      </Fold>
    </section>
    </>
  );
}

/** The act picked in the header, as a flow. */
export function ActsStep() {
  const { d, route } = useApp();
  if (!d) return null;
  const a = d.acts.find((x) => x.id === route.act) ?? d.acts[0];
  if (!a) return <div className="text-xs text-muted-foreground">Plan the video first.</div>;
  return <ActFlow key={a.id} a={a} />;
}

type Phase = "approved" | "drawn" | "running" | "cut" | "failed" | "changed" | "missing";
const PHASE: Record<Phase, { label: string; cls: string }> = {
  approved: { label: "approved", cls: "bg-success" },
  drawn: { label: "drawn", cls: "bg-success/55" },
  running: { label: "being drawn", cls: "bg-warning/70 animate-pulse" },
  cut: { label: "cut off (continues next batch)", cls: "bg-[repeating-linear-gradient(135deg,var(--color-warning)_0_4px,transparent_4px_8px)]" },
  changed: { label: "narration changed", cls: "bg-warning/35" },
  failed: { label: "failed", cls: "bg-destructive/70" },
  missing: { label: "not drawn", cls: "bg-muted" },
};

/** The voiceover as one bar: each act is a segment as long as its narration, coloured by how far it is. "Covered" =
 *  the share of the voice whose act is drawn and finished, so a cut-off or missing act shows as a gap in the voice. */
function ActsProgress() {
  const { d, go, runningJobs } = useApp();
  if (!d) return null;
  const acts = d.acts;
  const phase = (x: (typeof acts)[number]): Phase => {
    if (runningJobs.some((j) => j.locks?.includes(`act:${x.id}`) && /^(acts|act:|fix:)/.test(j.step))) return "running";
    if (!x.scene) return x.status === "failed" ? "failed" : "missing";
    if (x.unfinished) return "cut";
    if (d.plan.changed?.[x.id]) return "changed";
    if (x.status === "failed") return "failed";
    return x.approval ? "approved" : "drawn";
  };
  const rows = acts.map((x) => ({ x, p: phase(x), ms: Math.max(0, x.end - x.start) }));
  const total = rows.reduce((a, r) => a + r.ms, 0) || 1;
  const covered = rows.filter((r) => r.p === "drawn" || r.p === "approved").reduce((a, r) => a + r.ms, 0);
  const count = (p: Phase[]) => rows.filter((r) => p.includes(r.p)).length;
  const seen = [...new Set(rows.map((r) => r.p))];
  const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, "0")}`;
  return (
    <section aria-label="Acts progress" className="grid gap-1.5 rounded-lg border bg-background px-3 py-2.5 text-xs shadow-sm">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <b className="text-[12.5px] font-semibold">{count(["drawn", "approved"])}/{acts.length} acts done</b>
        <span className="text-muted-foreground">{mmss(covered)} of {mmss(total)} of the voice covered ({Math.round((covered / total) * 100)}%)</span>
        {count(["approved"]) > 0 && <span className="text-muted-foreground">· {count(["approved"])} approved</span>}
      </div>
      <div className="flex h-5 w-full gap-px overflow-hidden rounded" role="list">
        {rows.map(({ x, p, ms }) => (
          <button key={x.id} type="button" role="listitem" onClick={() => go({ act: x.id })} style={{ flexGrow: ms || 1 }}
            title={`${x.id} ${x.title}: ${PHASE[p].label} (${Math.round(ms / 1000)} s)`} aria-label={`${x.id}: ${PHASE[p].label}`}
            className={cn("min-w-[14px] basis-0 text-[10px] font-mono font-semibold text-foreground/80 outline-none hover:brightness-110 focus-visible:ring-2 focus-visible:ring-brand", PHASE[p].cls)}>
            {ms / total > 0.05 ? x.id.replace(/^A0?/, "") : ""}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
        {(Object.keys(PHASE) as Phase[]).filter((p) => seen.includes(p)).map((p) => (
          <span key={p} className="flex items-center gap-1"><span className={cn("inline-block size-2.5 rounded-sm", PHASE[p].cls)} />{PHASE[p].label}</span>
        ))}
      </div>
    </section>
  );
}
