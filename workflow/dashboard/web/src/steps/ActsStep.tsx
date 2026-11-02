import { useMemo } from "react";
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
  const stopBatch = async () => { try { await api.stopBatch(ws); toast("The running acts finish; no new act starts."); } catch (e) { toast((e as Error).message); } };

  return (
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
      <ul className="m-0 max-h-[272px] list-none overflow-y-auto p-0" role="listbox" aria-label="Acts">
        {acts.map((x) => {
          const rv = x.reviews[0], on = picked.includes(x.id), job = runningJobs.find((j) => j.locks?.includes(`act:${x.id}`));
          return (
            <li key={x.id} role="option" aria-selected={x.id === open?.id}
              className={cn("grid grid-cols-[auto_auto_1fr_auto] items-center gap-2.5 border-b border-border/60 px-3 py-1.5 last:border-0 sm:grid-cols-[auto_auto_1fr_auto_168px]", x.id === open?.id ? "bg-accent shadow-[inset_3px_0_0_var(--brand)]" : "hover:bg-accent/50")}>
              <Checkbox checked={on} onCheckedChange={(v) => toggle(x.id, v === true)} aria-label={`Pick ${x.id} for a batch`} />
              {job ? <Loader2 className="size-3.5 animate-spin text-warning" aria-label="running" /> : <StatusDot s={x.status} />}
              <button type="button" onClick={() => go({ act: x.id })} className="min-w-0 py-0.5 text-left outline-none focus-visible:underline">
                <span className="block truncate text-[13px]"><span className="font-mono">{x.id}</span> {x.title}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {((x.end - x.start) / 1000).toFixed(0)} s{x.meta ? ` · ${dur(x.meta.totalMs)} · ${money(x.meta.totalCost)}` : ""}{x.approval ? " · approved" : ""}{job ? ` · ${job.label}` : ""}
                </span>
              </button>
              <span className="text-[11px] text-muted-foreground">{rv ? `sync ${rv.sync}/10` : x.critic ? `critic ${x.critic.score}/10` : ""}</span>
              <NativeSelect aria-label={`Author model for ${x.id}`} title="Model that authors this act in a batch (default = the batch model)" className="!h-7 text-xs max-sm:col-span-4 max-sm:ml-7 max-sm:w-auto"
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
        <div className="grid gap-3 pb-3 lg:grid-cols-2">
          <div className="rounded-md border"><div className="px-3 pt-2 text-xs font-semibold">Author</div><ActionCard bare id="acts.all" hide={["acts", "models"]} /></div>
          <div className="rounded-md border"><div className="px-3 pt-2 text-xs font-semibold">Review</div><ActionCard bare id="acts.reviewAll" hide={["acts"]} /></div>
        </div>
      </Fold>
    </section>
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
