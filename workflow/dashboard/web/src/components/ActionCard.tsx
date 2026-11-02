import { useMemo, useState } from "react";
import { Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { InfoTip } from "@/components/ui/tooltip";
import { Fold } from "@/components/ui/collapsible";
import { useApp } from "@/hooks/app";
import { store } from "@/lib/storage";
import { ago, cn, dur } from "@/lib/utils";
import { useHighlight } from "./highlight";
import { MasterChain } from "./MasterChain";
import { initialValue, OptionField, toOpts, visible, type OptValue } from "./OptionField";
import { RunButton } from "./RunButton";

/** One runnable action: what it does, its options, a Run button. Master buttons also show the commands they chain. */
/** `bare`: only the controls (options + Run), for use inside a flow block that already shows the title and status. */
export function ActionCard({ id, act, children, hint, bare }: { id: string; act?: string; children?: React.ReactNode; hint?: string; bare?: boolean }) {
  const { schema, d, busy, run } = useApp();
  const { hot, setHot } = useHighlight();
  const a = schema[id];
  const defs = a?.opts ?? [];
  const [vals, setVals] = useState<Record<string, OptValue>>(() => {
    const saved = store.get<Record<string, unknown>>(`opt.${id}`, {});
    return Object.fromEntries(defs.map((o) => [o.key, initialValue(o, saved)]));
  });
  const planActs = useMemo(() => d?.plan.acts.map((x) => x.id) ?? [], [d]);
  // options arrive with the schema: fill any that are still missing. A remembered pick that is no longer offered
  // (an act from an older plan, a model that went away) is dropped, so it can't block the run unseen.
  const merged = useMemo(() => {
    const saved = store.get<Record<string, unknown>>(`opt.${id}`, {});
    return Object.fromEntries(defs.map((o) => {
      const v = vals[o.key] ?? initialValue(o, saved);
      const offered = id === "acts.all" && o.key === "acts" ? planActs : o.choices;
      if (o.type === "multi" && Array.isArray(v) && offered) return [o.key, v.filter((x) => offered.includes(x))];
      if (o.type === "select" && typeof v === "string" && offered?.length && !offered.includes(v)) return [o.key, o.def == null ? "" : String(o.def)];
      return [o.key, v];
    }));
  }, [defs, vals, id, planActs]);

  const covered = useMemo(() => Object.entries(schema).filter(([k, m]) => k !== id && m.chain?.some((c) => c.action === id)).map(([, m]) => m.label), [schema, id]);
  if (!a) return null;

  const isMaster = !!a.chain;
  const title = a.perAct ? `${a.label} ${act}` : a.label;
  const running = busy?.label === title;
  const last = [...(d?.runs ?? [])].reverse().find((r) => r.label === title);
  const opts = toOpts(defs, merged);
  const preview = Object.entries(opts).filter(([, v]) => v !== false && !(Array.isArray(v) && !v.length)).map(([k, v]) => (v === true ? k : `${k}=${Array.isArray(v) ? v.join(",") : v}`)).join(" · ");
  const lit = hot.has(id);
  const coveredKeys = isMaster ? a.chain!.flatMap((c) => (c.action ? [c.action] : [])) : [];

  return (
    <div
      data-action={id}
      className={cn("flex flex-col", !bare && "rounded-[10px] border bg-card shadow-sm transition-[box-shadow,border-color]", !bare && lit && "border-brand/70 ring-[3px] ring-brand/15")}
      onMouseEnter={isMaster ? () => setHot(coveredKeys) : undefined}
      onMouseLeave={isMaster ? () => setHot([]) : undefined}
      onFocus={isMaster ? () => setHot(coveredKeys) : undefined}
      onBlur={isMaster ? () => setHot([]) : undefined}
    >
      {!bare && <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 px-4 pt-3">
        <b className="text-[13px] font-semibold tracking-[-0.01em]">{title}</b>
        {(a.help || covered.length > 0) && (
          <InfoTip label={`About ${title}`}>
            {a.help}
            {covered.length > 0 && <div className="mt-1.5 text-subtle-foreground">Also runs inside: {covered.join(", ")}</div>}
          </InfoTip>
        )}
        {isMaster && <Badge><Layers className="size-3" />Chain</Badge>}
        {a.paid && <Badge>{a.paid}</Badge>}
        {a.long && <span className="ml-auto text-[11px] text-subtle-foreground">{a.long}</span>}
      </div>}
      {!bare && last && (
        <div className="px-4 pt-0.5 text-[11.5px] text-subtle-foreground">
          {last.status === "done" ? "Ran" : "Failed"} {ago(last.end)} · {dur(last.ms)}{last.cpuAvg != null ? ` · CPU ${last.cpuAvg}%` : ""}{last.rssPeakMB ? ` · ${last.rssPeakMB} MB` : ""}
        </div>
      )}
      {!bare && <div className="h-2" />}
      {!bare && isMaster && <MasterChain chain={a.chain!} job={running ? busy : null} />}
      {hint && <div className={cn("pb-2 text-xs text-warning", bare ? "px-3" : "px-4")}>{hint}</div>}
      {children}
      {defs.length > 0 && (
        <Fold title={<span className="flex min-w-0 items-center gap-2">Options <span className="min-w-0 truncate font-mono text-[11px] font-normal text-subtle-foreground">{preview}</span></span>} className={cn("px-3", !bare && "border-t")}>
          <div className="grid gap-2.5 pb-3 pt-1 sm:grid-cols-2 sm:gap-x-8">
            {defs.filter((o) => visible(o, defs, merged)).map((o) => (
              <OptionField key={o.key} o={o} value={merged[o.key]} choices={id === "acts.all" && o.key === "acts" ? planActs : undefined} onChange={(v) => setVals((p) => { const n = { ...merged, ...p, [o.key]: v }; store.set(`opt.${id}`, toOpts(defs, n)); return n; })} />
            ))}
          </div>
        </Fold>
      )}
      {!bare && (
        <div className="mt-auto flex items-center gap-2.5 px-4 pb-4 pt-1">
          <RunButton primary={!a.paid} running={running} disabled={!!busy} onClick={() => { store.set(`opt.${id}`, opts); void run(id, act, opts); }} />
          {defs.length === 0 && <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground" title={preview}>{preview}</span>}
        </div>
      )}
    </div>
  );
}
