import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { useMemo } from "react";
import { Fold } from "@/components/ui/collapsible";
import { JobsBlock, MachineBlock } from "@/components/ActivityPanel";
import { PerformancePanel } from "@/components/PerformancePanel";
import { LimitsMeter } from "@/components/LimitsMeter";
import { StatusDot } from "@/components/Status";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { useApp } from "@/hooks/app";
import { useStored } from "@/lib/storage";
import { ago, dur, tok } from "@/lib/utils";

function Section({ id, title, defaultOpen = true, children }: { id: string; title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useStored<boolean>(`right.${id}`, defaultOpen);
  return (
    <section className="border-b px-3">
      <Fold title={<span className="text-[11px] font-semibold uppercase tracking-wider">{title}</span>} open={open} onOpenChange={setOpen} trigger="min-h-9 max-md:min-h-11">
        <div className="pb-3">{children}</div>
      </Fold>
    </section>
  );
}

const cfg = { out: { label: "Output + input", color: "var(--chart-2)" } } satisfies ChartConfig;

/** Token use per day (last 14 days) from the Claude Code session logs. */
function UsageMini() {
  const { usage } = useApp();
  const data = useMemo(() => {
    if (!usage) return [];
    return Array.from({ length: 14 }, (_, i) => {
      const day = new Date(Date.now() - (13 - i) * 864e5).toISOString().slice(0, 10);
      return { day: day.slice(5), out: usage.rows.filter((r) => r.day === day).reduce((a, r) => a + r.in + r.cacheWrite + r.out, 0) };
    });
  }, [usage]);
  if (!usage) return <div className="h-[90px] text-xs text-muted-foreground">Reading session logs…</div>;
  return (
    <div className="mt-3">
      <div className="mb-1 text-xs font-medium">Tokens per day (input + cache write + output)</div>
      <ChartContainer config={cfg} className="aspect-auto h-[90px] w-full">
        <BarChart data={data} margin={{ left: -22, right: 0, top: 2, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="day" tickLine={false} axisLine={false} interval={3} />
          <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => tok(v)} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent valueFormatter={(v) => tok(v)} />} />
          <Bar dataKey="out" fill="var(--color-out)" radius={2} isAnimationActive={false} />
        </BarChart>
      </ChartContainer>
    </div>
  );
}

/** Their run history for the open video: what ran, how long, how hard it hit the machine. */
function RunsBlock() {
  const { d } = useApp();
  const runs = [...(d?.runs ?? [])].reverse().slice(0, 8);
  if (!runs.length) return <div className="text-xs text-muted-foreground">No dashboard runs for this video yet.</div>;
  return (
    <div className="grid gap-1.5">
      {runs.map((r) => (
        <div key={r.id} className="grid gap-0.5 text-xs">
          <span className="flex items-center gap-2"><StatusDot s={r.status === "done" ? "done" : "failed"} /><b className="min-w-0 flex-1 truncate font-semibold">{r.label}</b><span className="text-muted-foreground">{dur(r.ms)}</span></span>
          <span className="pl-4 text-[11px] text-muted-foreground">{ago(r.end)}{r.cpuAvg != null ? ` · CPU ${r.cpuAvg}% avg / ${r.cpuPeak}%` : ""}{r.rssPeakMB ? ` · ${r.rssPeakMB} MB` : ""}{r.gpuAvg != null ? ` · GPU ${r.gpuAvg}%` : ""}</span>
        </div>
      ))}
    </div>
  );
}

/** Stats and numbers: machine, Claude usage, jobs, runs, performance. Each section folds and remembers it. */
export function MonitorBody() {
  return (
    <div>
      <Section id="machine" title="Machine"><MachineBlock /></Section>
      <Section id="usage" title="Claude usage"><LimitsMeter /><UsageMini /></Section>
      <Section id="jobs" title="Recent jobs"><JobsBlock /></Section>
      <Section id="runs" title="Runs" defaultOpen={false}><RunsBlock /></Section>
      <Section id="perf" title="Performance"><PerformancePanel /></Section>
    </div>
  );
}
