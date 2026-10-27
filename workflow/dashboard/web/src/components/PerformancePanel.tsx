import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { useApp } from "@/hooks/app";
import { STEPS } from "@/lib/steps";
import { dur, money, tok } from "@/lib/utils";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { StatTile } from "@/components/StatTile";

/** Dashboard run step keys ("act:A03", "frames:A03"...) -> the pipeline step they belong to. */
const stepOf = (k: string) => (/^(act|fix|frames|preview|review)(:|$)/.test(k) ? "acts" : k);

const timeCfg = { pipeline: { label: "Pipeline (timings.json)", color: "var(--chart-3)" }, wall: { label: "Dashboard runs", color: "var(--chart-2)" } } satisfies ChartConfig;
const costCfg = { cost: { label: "Claude cost", color: "var(--chart-2)" } } satisfies ChartConfig;
const actCfg = { cost: { label: "Claude cost", color: "var(--chart-4)" } } satisfies ChartConfig;
const min1 = (m: number) => `${Math.round(m * 10) / 10} min`;

/** Time and money per step for the selected video. Sources: timings.json (meta, timings) and dashboard_runs.json (runs). */
export function PerformancePanel() {
  const { d } = useApp();
  const data = useMemo(() => {
    if (!d) return null;
    const wall: Record<string, number> = {};
    for (const r of d.runs) wall[stepOf(r.step)] = (wall[stepOf(r.step)] ?? 0) + (r.ms ?? 0);
    const steps = STEPS.map((s) => ({ step: s.label, pipeline: (d.meta[s.key]?.totalMs ?? 0) / 60000, wall: (wall[s.key] ?? 0) / 60000, cost: Math.round((d.meta[s.key]?.totalCost ?? 0) * 100) / 100 }));
    const byModel: Record<string, { cost: number; ms: number; out: number }> = {};
    for (const t of d.timings) if (t.model) { const m = (byModel[t.model] ??= { cost: 0, ms: 0, out: 0 }); m.cost += t.costUsd ?? 0; m.ms += t.ms ?? 0; m.out += t.outputTokens ?? 0; }
    const acts = d.acts.filter((a) => a.meta).map((a) => ({ act: a.id, cost: Math.round((a.meta!.totalCost) * 100) / 100, min: a.meta!.totalMs / 60000 }));
    return { steps, byModel, acts, wallTotal: Object.values(wall).reduce((a, b) => a + b, 0) };
  }, [d]);

  if (!d || !data) return <div className="text-xs text-muted-foreground">Open a video to see its time and cost per step.</div>;
  const empty = data.steps.every((s) => !s.pipeline && !s.wall && !s.cost);
  const axis = { tickLine: false, axisLine: false, tickMargin: 4 } as const;
  return (
    <div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 pb-2">
        <StatTile align="left" value={dur(d.totals.ms)} label="recorded time" />
        <StatTile align="left" value={money(d.totals.costUsd)} label="Claude cost" />
        <StatTile align="left" value={dur(data.wallTotal)} label="dashboard runs" />
      </div>
      {empty ? <div className="pb-3 text-xs text-muted-foreground">No timings recorded for this video yet.</div> : (
        <div className="grid gap-4 pb-2">
          <div>
            <div className="mb-1 text-xs font-medium">Time per step</div>
            <ChartContainer config={timeCfg} className="aspect-auto h-[210px] w-full">
              <BarChart data={data.steps} layout="vertical" margin={{ left: 0, right: 8, top: 0, bottom: 0 }} barGap={1}>
                <CartesianGrid horizontal={false} />
                <YAxis dataKey="step" type="category" width={54} interval={0} {...axis} />
                <XAxis type="number" tickFormatter={(v) => `${v}m`} {...axis} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent valueFormatter={(v) => min1(v)} />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="pipeline" fill="var(--color-pipeline)" radius={2} isAnimationActive={false} barSize={7} />
                <Bar dataKey="wall" fill="var(--color-wall)" radius={2} isAnimationActive={false} barSize={7} />
              </BarChart>
            </ChartContainer>
          </div>
          <div>
            <div className="mb-1 text-xs font-medium">Money per step (Claude)</div>
            <ChartContainer config={costCfg} className="aspect-auto h-[170px] w-full">
              <BarChart data={data.steps} layout="vertical" margin={{ left: 0, right: 8, top: 0, bottom: 0 }}>
                <CartesianGrid horizontal={false} />
                <YAxis dataKey="step" type="category" width={54} interval={0} {...axis} />
                <XAxis type="number" tickFormatter={(v) => `$${v}`} {...axis} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent valueFormatter={(v) => `$${v.toFixed(2)}`} />} />
                <Bar dataKey="cost" fill="var(--color-cost)" radius={2} isAnimationActive={false} barSize={10} />
              </BarChart>
            </ChartContainer>
          </div>
          {data.acts.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-medium">Money per act</div>
              <ChartContainer config={actCfg} className="aspect-auto h-[120px] w-full">
                <BarChart data={data.acts} margin={{ left: -18, right: 4, top: 4, bottom: 0 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="act" {...axis} />
                  <YAxis tickFormatter={(v) => `$${v}`} {...axis} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent valueFormatter={(v) => `$${v.toFixed(2)}`} />} />
                  <Bar dataKey="cost" fill="var(--color-cost)" radius={2} isAnimationActive={false} />
                </BarChart>
              </ChartContainer>
            </div>
          )}
          {Object.keys(data.byModel).length > 0 && (
            <table className="w-full text-[11.5px]">
              <thead><tr className="text-left text-muted-foreground"><th className="font-medium">Model</th><th className="text-right font-medium">Time</th><th className="text-right font-medium">Output</th><th className="text-right font-medium">Cost</th></tr></thead>
              <tbody>{Object.entries(data.byModel).map(([m, x]) => <tr key={m}><td className="font-mono">{m}</td><td className="text-right">{dur(x.ms)}</td><td className="text-right">{tok(x.out)}</td><td className="text-right">{money(x.cost)}</td></tr>)}</tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
