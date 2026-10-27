import * as React from "react";
import * as RechartsPrimitive from "recharts";
import { cn } from "@/lib/utils";

// shadcn/ui chart primitives (recharts wrapper): config -> CSS variables -> tooltip/legend content.
export type ChartConfig = Record<string, { label?: React.ReactNode; color?: string }>;
const ChartContext = React.createContext<{ config: ChartConfig } | null>(null);
const useChart = () => { const c = React.useContext(ChartContext); if (!c) throw new Error("useChart must be used within a ChartContainer"); return c; };

export function ChartContainer({ id, className, children, config, ...props }: React.ComponentProps<"div"> & { config: ChartConfig; children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>["children"] }) {
  const uid = React.useId();
  const chartId = `chart-${id || uid.replace(/:/g, "")}`;
  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-chart={chartId}
        className={cn(
          "flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/60 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-hidden [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted/60 [&_.recharts-sector]:outline-hidden [&_.recharts-surface]:outline-hidden",
          className,
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer minWidth={0} minHeight={0}>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

function ChartStyle({ id, config }: { id: string; config: ChartConfig }) {
  const entries = Object.entries(config).filter(([, c]) => c.color);
  if (!entries.length) return null;
  return <style dangerouslySetInnerHTML={{ __html: `[data-chart=${id}] {\n${entries.map(([k, c]) => `  --color-${k}: ${c.color};`).join("\n")}\n}` }} />;
}

export const ChartTooltip = RechartsPrimitive.Tooltip;
export const ChartLegend = RechartsPrimitive.Legend;

interface TipItem { dataKey?: string | number; name?: string | number; value?: number | string; color?: string; payload?: Record<string, unknown> & { fill?: string } }

export function ChartTooltipContent({ active, payload, label, className, hideLabel, labelFormatter, valueFormatter }: {
  active?: boolean; payload?: TipItem[]; label?: React.ReactNode; className?: string; hideLabel?: boolean; labelFormatter?: (l: React.ReactNode) => React.ReactNode; valueFormatter?: (v: number, key: string) => string;
}) {
  const { config } = useChart();
  if (!active || !payload?.length) return null;
  return (
    <div className={cn("grid min-w-32 gap-1.5 rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-xl", className)}>
      {!hideLabel && label != null && <div className="font-medium">{labelFormatter ? labelFormatter(label) : label}</div>}
      <div className="grid gap-1">
        {payload.map((it, i) => {
          const key = String(it.dataKey ?? it.name ?? i);
          const cfg = config[key];
          const color = it.color ?? it.payload?.fill ?? cfg?.color;
          return (
            <div key={key} className="flex items-center gap-2">
              <span className="size-2 shrink-0 rounded-[2px]" style={{ background: color }} />
              <span className="text-muted-foreground">{cfg?.label ?? it.name ?? key}</span>
              <span className="ml-auto pl-3 font-mono font-medium tabular-nums">{typeof it.value === "number" ? (valueFormatter ? valueFormatter(it.value, key) : it.value.toLocaleString()) : it.value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ChartLegendContent({ payload, className }: { payload?: { dataKey?: string | number; value?: string; color?: string }[]; className?: string }) {
  const { config } = useChart();
  if (!payload?.length) return null;
  return (
    <div className={cn("flex flex-wrap items-center justify-center gap-x-3.5 gap-y-1 pt-2", className)}>
      {payload.map((it) => {
        const key = String(it.dataKey ?? it.value);
        return (
          <div key={key} className="flex items-center gap-1.5 text-muted-foreground">
            <span className="size-2 rounded-[2px]" style={{ background: it.color }} />
            {config[key]?.label ?? it.value}
          </div>
        );
      })}
    </div>
  );
}
