import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Countdown } from "@/components/LimitsMeter";
import { useNow } from "@/hooks/useNow";
import { Progress } from "@/components/ui/progress";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { ago, money, tok } from "@/lib/utils";
import type { LimitBar, ProviderId, URow } from "@/lib/types";

/** One colour per provider, from the chart tokens (Ollama, the sixth, is a tint of Codex's green). */
export const PROVIDER_META: Record<ProviderId, { label: string; color: string; short: string }> = {
  claude: { label: "Claude", short: "Claude", color: "var(--chart-1)" },
  "claude-iit": { label: "Claude IIT", short: "IIT", color: "var(--chart-5)" },
  codex: { label: "Codex", short: "Codex", color: "var(--chart-2)" },
  opencode: { label: "OpenCode", short: "OpenCode", color: "var(--chart-4)" },
  agy: { label: "agy", short: "agy", color: "var(--chart-3)" },
  ollama: { label: "Ollama", short: "Ollama", color: "color-mix(in oklab, var(--chart-2) 45%, var(--background))" },
};
export const PROVIDER_IDS = Object.keys(PROVIDER_META) as ProviderId[];

export const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 864e5).toISOString().slice(0, 10);
export const DAYS30 = Array.from({ length: 30 }, (_, i) => iso(29 - i));

export interface Sum { in: number; cw: number; cr: number; out: number; n: number; cost: number; hasCost: boolean }
export const emptySum = (): Sum => ({ in: 0, cw: 0, cr: 0, out: 0, n: 0, cost: 0, hasCost: false });
export function sumRows(rows: URow[], from?: string, price?: (r: URow) => number | null): Sum {
  const s = emptySum();
  for (const r of rows) {
    if (from && r.day < from) continue;
    s.in += r.in; s.cw += r.cacheWrite; s.cr += r.cacheRead; s.out += r.out; s.n += r.replies;
    const c = r.cost ?? price?.(r) ?? null;
    if (c != null) { s.cost += c; s.hasCost = true; }
  }
  return s;
}
/** Fresh tokens (input + cache write + output): what a day "used"; cache reads are reported separately. */
export const fresh = (s: Pick<Sum, "in" | "cw" | "out">) => s.in + s.cw + s.out;
export const freshRow = (r: URow) => r.in + r.cacheWrite + r.out;

/** Stacked daily bars over the last 30 days, one series per key. */
export function DailyChart({ series, rowsOf, height = 220 }: { series: { key: string; label: string; color: string }[]; rowsOf: (key: string) => URow[]; height?: number }) {
  const cfg: ChartConfig = Object.fromEntries(series.map((s, i) => [`s${i}`, { label: s.label, color: s.color }]));
  const byDay = series.map((s) => { const m = new Map<string, number>(); for (const r of rowsOf(s.key)) m.set(r.day, (m.get(r.day) ?? 0) + freshRow(r)); return m; });
  const data = DAYS30.map((day) => ({ day: day.slice(5), ...Object.fromEntries(series.map((_, i) => [`s${i}`, byDay[i].get(day) ?? 0])) }));
  return (
    <ChartContainer config={cfg} className="aspect-auto w-full" style={{ height }}>
      <BarChart data={data} margin={{ left: 0, right: 4, top: 4, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="day" tickLine={false} axisLine={false} interval={4} />
        <YAxis tickFormatter={(v) => tok(v)} tickLine={false} axisLine={false} width={48} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent valueFormatter={(v) => tok(v)} />} />
        {series.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
        {series.map((_, i) => <Bar key={i} dataKey={`s${i}`} stackId="t" fill={`var(--color-s${i})`} isAnimationActive={false} />)}
      </BarChart>
    </ChartContainer>
  );
}

/** Multi-day windows (Codex's 30-day one): days and hours, updated every minute. */
function LongCountdown({ resetsAt }: { resetsAt: number }) {
  const now = useNow(60000);
  const h = Math.max(0, Math.floor((resetsAt * 1000 - now) / 3600e3));
  return <span className="font-mono tabular-nums">resets in {Math.floor(h / 24)} d {h % 24} h · {new Date(resetsAt * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>;
}

const tone = (p: number) => (p >= 90 ? "danger" : p >= 70 ? "warning" : "success") as "danger" | "warning" | "success";

/** Rate-limit windows a provider reports (Codex: primary/secondary). */
export function LimitBars({ limits, at }: { limits: LimitBar[]; at?: number | null }) {
  if (!limits.length) return <div className="text-xs text-muted-foreground">No rate-limit data in the logs yet.</div>;
  return (
    <div className="grid gap-3">
      {limits.map((l) => (
        <div key={l.label} className="grid gap-1">
          <div className="flex items-baseline justify-between gap-2"><span className="text-xs text-muted-foreground">{l.label}</span><b className="text-[15px] font-semibold tabular-nums">{Math.round(l.usedPct)}% used</b></div>
          <Progress value={l.usedPct} tone={tone(l.usedPct)} />
          <div className="text-[11.5px]">{l.resetsAt && l.resetsAt * 1000 - Date.now() > 48 * 3600e3 ? <LongCountdown resetsAt={l.resetsAt} /> : <Countdown resetsAt={l.resetsAt} />}</div>
        </div>
      ))}
      {at ? <div className="text-[11px] text-muted-foreground">as of {ago(at)} · from the latest session log</div> : null}
    </div>
  );
}

export const costLabel = (kind: string, s: Sum, priced: boolean) =>
  kind === "free" ? "free" : kind === "subscription" ? "subscription" : s.hasCost ? `${money(s.cost)}${kind === "estimate" ? " est." : ""}` : kind === "estimate" && !priced ? "add prices below" : "$0";
