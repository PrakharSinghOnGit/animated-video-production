import { useEffect, useMemo, useRef } from "react";
import { Loader2, PenLine, ScanEye, Square } from "lucide-react";
import { useApp } from "@/hooks/app";
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
  // keep the open act in view in the strip
  useEffect(() => { strip.current?.querySelector(`[data-act="${route.act ?? ""}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" }); }, [route.act]);
  const choices = useMemo(() => schema["acts.act"]?.opts.find((o) => o.key === "model")?.choices ?? ["default"], [schema]);
  if (!d || !ws || !d.acts.length) return null;
  const acts = d.acts, ids = new Set(acts.map((a) => a.id));
  const picked = sel.filter((x) => ids.has(x));
  const open = acts.find((x) => x.id === route.act) ?? acts[0];
  const toggle = (id: string, on: boolean) => setSel((p) => (on ? [...p.filter((x) => x !== id), id] : p.filter((x) => x !== id)));
  const missing = acts.filter((a) => !a.scene).map((a) => a.id);
  // per-act models for the acts this batch will author ("default" = the batch model in the options)
  const target = picked.length ? picked : missing;
  const modelArg = target.filter((id) => models[id] && models[id] !== "default").map((id) => `${id}=${models[id]}`).join(",");
  const batch = jobFor(schema["acts.all"]?.label ?? "Author acts"), reviewing = jobFor(schema["acts.reviewAll"]?.label ?? "Review acts");
  const author = () => runWith("acts.all", undefined, { acts: picked, models: modelArg || undefined });
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
      <ul ref={strip} className="m-0 flex list-none snap-x gap-2 overflow-x-auto p-2.5" role="listbox" aria-label="Acts" aria-orientation="horizontal">
        {acts.map((x) => {
          const rv = x.reviews[0], on = picked.includes(x.id), job = runningJobs.find((j) => j.locks?.includes(`act:${x.id}`)), isOpen = x.id === open?.id;
          return (
            <li key={x.id} role="option" aria-selected={isOpen} data-act={x.id}
              className={cn("relative grid w-[212px] shrink-0 snap-start gap-1.5 rounded-lg border bg-card p-2.5 transition-colors", isOpen ? "border-brand ring-1 ring-brand/50" : "hover:bg-accent/50", on && !isOpen && "border-brand/50")}>
              <div className="flex items-center gap-2">
                <Checkbox className="relative z-10" checked={on} onCheckedChange={(v) => toggle(x.id, v === true)} aria-label={`Pick ${x.id} for a batch`} />
                {job ? <Loader2 className="size-3.5 animate-spin text-warning" aria-label="running" /> : <StatusDot s={x.status} />}
                <span className="font-mono text-[13px] font-semibold">{x.id}</span>
                {d.plan.changed?.[x.id] ? <span className="ml-auto rounded bg-warning/15 px-1.5 text-[10.5px] text-warning" title="The script change rewrote this act's narration: Update changed acts">narration changed</span>
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
        <Button size="sm" variant="default" disabled={!canRun("acts.all") || (!picked.length && !missing.length)} onClick={author}>
          {batch ? <Loader2 className="animate-spin" /> : <PenLine />}{picked.length ? `Author ${picked.length} picked` : missing.length ? `Author ${missing.length} missing` : "All drawn: tick acts to redo"}
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
