import { useApp } from "@/hooks/app";
import { ago, dur, shortId, cn } from "@/lib/utils";
import { StatusDot } from "@/components/Status";
import { Spark } from "@/components/Spark";
import { Progress } from "@/components/ui/progress";
import type { Job } from "@/lib/types";

export function SectionHead({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return <div className="flex min-h-8 items-center justify-between px-3 pb-1 pt-3.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><span>{children}</span>{right}</div>;
}

function JobRow({ j }: { j: Job }) {
  const { go, showLog } = useApp();
  const s = j.stats, st = j.status === "running" ? "running" : j.status === "done" ? "done" : "failed";
  return (
    <button onClick={() => { go({ view: "ws", ws: j.ws }); showLog(j.id); }} className="grid w-full gap-0.5 border-b border-border/60 px-3 py-2 text-left text-xs hover:bg-accent">
      <span className="flex items-center gap-2"><StatusDot s={st} /><b className="min-w-0 flex-1 truncate font-semibold">{j.label}</b><span className="text-muted-foreground">{dur(j.ms)}</span></span>
      <span className="flex flex-wrap gap-x-2.5 text-[11px] text-muted-foreground">
        <span className="font-mono">{shortId(j.ws)}</span>
        {j.status === "running" && s.cur ? <><span>CPU {s.cur.cpu}%</span><span>{s.cur.rssMB} MB</span><span className="truncate">{s.cur.top[0] ?? ""}</span></> : s.cpuAvg != null ? <><span>CPU {s.cpuAvg}% avg</span><span>{s.rssPeakMB} MB peak</span>{s.gpuAvg != null && <span>GPU {s.gpuAvg}%</span>}</> : null}
        <span>{j.status === "running" ? `step ${j.cmdIndex + 1}/${j.cmdCount}` : ago(j.endedAt)}</span>
      </span>
      {j.status === "running" && j.cmdCount > 1 && <Progress className="mt-1" value={((j.cmdIndex + 0.5) / j.cmdCount) * 100} />}
    </button>
  );
}

/** Live machine numbers: CPU/GPU/memory sparklines, per-core bars, busiest processes. The one place they are shown. */
export function MachineBlock() {
  const { system: s } = useApp();
  const H = s?.history ?? [], n = s?.now;
  const row = (label: string, values: (number | null)[], max: number, color: string, text: string, unit = "%") => (
    <div className="grid grid-cols-[48px_1fr_64px] items-center gap-2 py-0.5 text-[11.5px] text-muted-foreground">
      <span>{label}</span><Spark values={values} max={max} color={color} label={label} unit={unit} /><b className="text-right font-semibold text-foreground">{text}</b>
    </div>
  );
  if (!n) return <div className="h-[200px] text-xs text-muted-foreground">Sampling…</div>;
  return (
    <div>
      <div className="pb-1 text-[11px] text-muted-foreground" title={s ? s.machine.cpu : ""}>{s ? `${s.machine.cores} cores · ${s.machine.memGB} GB` : ""}</div>
      {row("CPU", H.map((x) => x.cpu), 100, "var(--chart-1)", `${n.cpu.toFixed(0)}%`)}
      <div className="grid gap-[3px] py-1" style={{ gridTemplateColumns: `repeat(${Math.min(n.cores.length, 12)}, 1fr)` }}>
        {n.cores.map((c, i) => <i key={i} title={`core ${i}: ${c}%`} className="relative block h-[20px] overflow-hidden rounded-[2px] bg-secondary"><i className={cn("absolute inset-x-0 bottom-0 block", c > 85 ? "bg-destructive" : c > 60 ? "bg-warning" : "bg-success")} style={{ height: `${c}%` }} /></i>)}
      </div>
      {row("GPU", H.map((x) => x.gpu), 100, "var(--chart-2)", n.gpu == null ? "—" : `${n.gpu}%`)}
      {row("Memory", H.map((x) => x.memUsedGB), n.memTotalGB, "var(--chart-3)", `${n.memUsedGB} GB`, " GB")}
      <div className="flex justify-between py-1 text-[11.5px] text-muted-foreground"><span>Load {n.load.join(" · ")}</span><b className="font-semibold text-foreground">{n.diskFreeGB ?? "—"} GB free</b></div>
      <table className="w-full text-[11.5px]"><tbody>{(s?.top ?? []).slice(0, 5).map((p) => (
        <tr key={p.pid}><td className="max-w-[130px] truncate py-0.5 font-mono">{p.comm}</td><td className="py-0.5 text-right">{p.cpu}%</td><td className="py-0.5 pl-2 text-right text-muted-foreground">{p.rssMB} MB</td></tr>
      ))}</tbody></table>
    </div>
  );
}

/** Running jobs first, then the most recent finished ones (all videos). */
export function JobsBlock() {
  const { activity, runningAnywhere } = useApp();
  const recent = activity.filter((j) => j.status !== "running").slice(0, 10);
  return (
    <div className="-mx-3">
      {runningAnywhere.map((j) => <JobRow key={j.id} j={j} />)}
      {runningAnywhere.length === 0 && <div className="px-3 py-1.5 text-xs text-muted-foreground">Nothing running.</div>}
      {recent.map((j) => <JobRow key={j.id} j={j} />)}
      {recent.length === 0 && <div className="px-3 py-1.5 text-xs text-muted-foreground">No runs since the dashboard started.</div>}
    </div>
  );
}
