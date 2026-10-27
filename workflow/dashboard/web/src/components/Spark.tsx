import { Area, AreaChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

/** Small area chart over the last samples (shadcn chart). Animation is off so polling does not flicker. */
export function Spark({ values, max, color, label, unit = "%", height = 28 }: { values: (number | null)[]; max: number; color: string; label: string; unit?: string; height?: number }) {
  const data = values.map((v, i) => ({ i, v: v ?? 0 }));
  const config = { v: { label, color } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <XAxis dataKey="i" hide />
        <YAxis hide domain={[0, max]} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel valueFormatter={(v) => `${Math.round(v * 10) / 10}${unit}`} />} />
        <Area dataKey="v" type="monotone" stroke="var(--color-v)" strokeWidth={1.5} fill="var(--color-v)" fillOpacity={0.15} isAnimationActive={false} dot={false} />
      </AreaChart>
    </ChartContainer>
  );
}
