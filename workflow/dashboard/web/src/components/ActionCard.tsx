import { useMemo, useState } from "react";
import { Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Fold } from "@/components/ui/collapsible";
import { useApp } from "@/hooks/app";
import { store } from "@/lib/storage";
import { ago, cn, dur, STATUS_LABEL } from "@/lib/utils";
import { useHighlight } from "./highlight";
import { MasterChain } from "./MasterChain";
import { initialValue, OptionField, toOpts, type OptValue } from "./OptionField";
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
  // options arrive with the schema: fill any that are still missing
  const merged = useMemo(() => {
    const saved = store.get<Record<string, unknown>>(`opt.${id}`, {});
    return Object.fromEntries(defs.map((o) => [o.key, vals[o.key] ?? initialValue(o, saved)]));
  }, [defs, vals, id]);

  const covered = useMemo(() => Object.entries(schema).filter(([k, m]) => k !== id && m.chain?.some((c) => c.action === id)).map(([, m]) => m.label), [schema, id]);
  if (!a) return null;

  const isMaster = !!a.chain;
  const title = a.perAct ? `${a.label} ${act}` : a.label;
  const running = busy?.label === title;
  const last = [...(d?.runs ?? [])].reverse().find((r) => r.label === title);
  const opts = toOpts(defs, merged);
  const preview = Object.entries(opts).filter(([, v]) => v !== false && !(Array.isArray(v) && !v.length)).map(([k, v]) => (v === true ? k : `${k}=${Array.isArray(v) ? v.join(",") : v}`)).join(" · ");
  const lit = hot.has(id);
  const planActs = d?.plan.acts.map((x) => x.id) ?? [];
  const coveredKeys = isMaster ? a.chain!.flatMap((c) => (c.action ? [c.action] : [])) : [];

  return (
    <div
      data-action={id}
      className={cn("flex flex-col", !bare && "rounded-lg border bg-secondary/30 transition-[box-shadow,border-color]", !bare && isMaster && "border-l-[3px] border-l-brand", !bare && lit && "border-brand ring-2 ring-brand/60")}
      onMouseEnter={isMaster ? () => setHot(coveredKeys) : undefined}
      onMouseLeave={isMaster ? () => setHot([]) : undefined}
      onFocus={isMaster ? () => setHot(coveredKeys) : undefined}
      onBlur={isMaster ? () => setHot([]) : undefined}
    >
      {!bare && <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 pt-2.5">
        <b className="text-[13px]">{title}</b>
        {isMaster && <Badge tone="solid"><Layers className="size-3" />Master</Badge>}
        {a.paid ? <Badge tone="warning">Paid · {a.paid}</Badge> : <Badge tone="success">Free</Badge>}
        {a.long && <span className="ml-auto text-[11px] text-muted-foreground">{a.long}</span>}
      </div>}
      {!bare && <div className="px-3 pb-2 pt-1 text-xs text-muted-foreground">
        {a.help}
        {last && (
          <div className="mt-0.5 text-[11.5px] opacity-80">
            Last: {STATUS_LABEL[last.status === "done" ? "done" : "failed"]} {ago(last.end)}, {dur(last.ms)}
            {last.cpuAvg != null ? `, CPU ${last.cpuAvg}% avg` : ""}{last.rssPeakMB ? `, ${last.rssPeakMB} MB peak` : ""}
          </div>
        )}
        {covered.length > 0 && <div className="mt-0.5 text-[11.5px] text-brand">Also runs inside: {covered.join(", ")}</div>}
      </div>}
      {!bare && isMaster && <MasterChain chain={a.chain!} job={running ? busy : null} />}
      {hint && <div className="px-3 pb-2 text-xs text-warning">{hint}</div>}
      {children}
      {defs.length > 0 && (
        <Fold title={`Options (${defs.length})`} className={cn("px-3", !bare && "border-t")}>
          <div className="grid gap-2 pb-3 pt-1">
            {defs.map((o) => (
              <OptionField key={o.key} o={o} value={merged[o.key]} choices={id === "acts.all" && o.key === "acts" ? planActs : undefined} onChange={(v) => setVals((p) => { const n = { ...merged, ...p, [o.key]: v }; store.set(`opt.${id}`, toOpts(defs, n)); return n; })} />
            ))}
          </div>
        </Fold>
      )}
      <div className={cn("mt-auto flex items-center gap-2.5 px-3", bare ? "pb-1 pt-0" : "pb-3 pt-1")}>
        {!bare && <RunButton primary={!a.paid} running={running} disabled={!!busy} onClick={() => { store.set(`opt.${id}`, opts); void run(id, act, opts); }} />}
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground" title={preview}>{preview}</span>
      </div>
    </div>
  );
}
