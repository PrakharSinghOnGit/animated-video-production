import React from "react";
import { useCurrentFrame } from "remotion";
import { z } from "zod";
import { scaleLinear, scaleLog } from "d3-scale";
import { area as d3area, line as d3line, curveLinear } from "d3-shape";
import { COLOR_TOKENS, FONT_TOKENS, alpha } from "../../tokens";
import { ease, p, seeded } from "../../motion";
import { ArchetypeFrame, ColorNameSchema, FRAME, FrameTextSchema, colorOf } from "../ArchetypeFrame";
import { CueSchema, useBeat } from "../cues";
import { registerArchetype } from "../registry";

/**
 * LineChart: 1-3 time series drawn full-width with real axes. The line draws itself
 * on a cue with a glowing tip; an optional period is shaded, pins pop on cues.
 * Axes and gridlines are on screen from the first moment, so the frame is never empty.
 */

const XValue = z.union([z.number(), z.string().max(14)]);

const SeriesSchema = z.object({
  name: z.string().max(24).describe("Short series name, shown at the line's end when there are 2+ series"),
  color: ColorNameSchema.default("sky"),
  values: z.array(z.number()).min(5).max(200).describe("One y value per entry in x, same length and order"),
});

const HighlightSchema = z.object({
  from: XValue.describe("x value (an entry of x) where the shaded period starts"),
  to: XValue.describe("x value (an entry of x) where the shaded period ends"),
  label: z.string().max(28).describe("Short name of the period, e.g. 'The crash'"),
  color: ColorNameSchema.default("negative"),
  at: CueSchema.optional().describe("When the shading appears; defaults to when the line reaches the start of the period"),
});

const AnnotationSchema = z.object({
  x: XValue.describe("x value (an entry of x) the pin points at"),
  label: z.string().max(32).describe("Short pin text, e.g. 'Rates hit 5%'"),
  at: CueSchema.optional().describe("When the pin pops; defaults to when the line reaches x"),
  series: z.number().int().min(0).max(2).default(0).describe("Index of the series the pin sits on"),
  color: ColorNameSchema.default("text"),
});

export const LineChartSchema = FrameTextSchema.extend({
  x: z
    .array(XValue)
    .min(5)
    .max(200)
    .describe("Shared x axis, in order (years, months, labels). All numbers are placed proportionally; mixed or text labels are spaced evenly"),
  series: z.array(SeriesSchema).min(1).max(3),
  xLabel: z.string().max(20).optional().describe("Axis caption at the right end of the x axis, e.g. 'Years'"),
  yLabel: z.string().max(40).optional().describe("What the y axis measures, shown above the axis, e.g. 'Portfolio value'"),
  prefix: z.string().max(4).default("").describe("Unit before y numbers, e.g. '$'"),
  suffix: z.string().max(6).default("").describe("Unit after y numbers, e.g. '%'"),
  compact: z.boolean().default(true).describe("Abbreviate thousands/millions as K/M/B on the y axis"),
  logScale: z.boolean().default(false).describe("Logarithmic y axis; every value must be > 0. Use to show constant % growth as a straight line"),
  yMin: z.number().optional().describe("Force the y axis minimum (default: 0 for linear axes when all values are positive, else data minimum)"),
  yMax: z.number().optional(),
  drawAt: CueSchema.optional().describe("Spoken word on which the line starts drawing; default 0.6 s after the voice starts"),
  drawSec: z.number().min(0.6).max(12).default(3).describe("Seconds the draw takes"),
  highlightRange: HighlightSchema.optional(),
  annotations: z.array(AnnotationSchema).max(4).optional(),
  endLabel: z.boolean().default(true).describe("Show the last value at the line tip (series names too when there are 2+ series)"),
});
export type LineChartProps = z.infer<typeof LineChartSchema>;

// ---------------------------------------------------------------------------

function fmtNum(v: number, compact: boolean, step: number): string {
  const abs = Math.abs(v);
  if (compact && abs >= 1e9) return `${trim(v / 1e9, step / 1e9)}B`;
  if (compact && abs >= 1e6) return `${trim(v / 1e6, step / 1e6)}M`;
  if (compact && abs >= 1e4) return `${trim(v / 1e3, step / 1e3)}K`;
  return trim(v, step);
}
function trim(v: number, step: number): string {
  const dec = step >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(step)));
  return v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

/** Full-precision value for the end-of-line pill. */
function fmtPill(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  const dec = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function logTicks(min: number, max: number): number[] {
  const out: number[] = [];
  const lo = Math.floor(Math.log10(min));
  const hi = Math.ceil(Math.log10(max));
  for (let e = lo; e <= hi; e++) for (const m of [1, 2, 5]) {
    const v = m * Math.pow(10, e);
    if (v >= min * 0.999 && v <= max * 1.001) out.push(v);
  }
  // Too dense: keep decades only.
  return out.length > 7 ? out.filter((v) => Math.abs(Math.log10(v) - Math.round(Math.log10(v))) < 1e-9) : out;
}

const PILL_H = 48;

const Annotation: React.FC<{
  px: number;
  py: number;
  cx: number;
  cy: number;
  w: number;
  label: string;
  color: string;
  progress: number;
}> = ({ px, py, cx, cy, w, label, color, progress }) => {
  // Stem runs from the data point to the nearest point on the pill's edge.
  const ex = Math.max(cx - w / 2, Math.min(cx + w / 2, px));
  const ey = Math.max(cy - PILL_H / 2, Math.min(cy + PILL_H / 2, py));
  const stem = ease.outCubic(Math.min(1, progress * 1.6));
  const rise = (cy < py ? 1 : -1) * 22 * (1 - progress);
  return (
    <g opacity={Math.min(1, progress * 3)}>
      <line x1={px} y1={py} x2={px + (ex - px) * stem} y2={py + (ey - py) * stem} stroke={alpha(color, 0.75)} strokeWidth={2.5} strokeDasharray="4 6" />
      <circle cx={px} cy={py} r={9 * progress} fill={COLOR_TOKENS.bg} stroke={color} strokeWidth={3} />
      <g transform={`translate(${cx}, ${cy + rise})`} opacity={progress}>
        <rect x={-w / 2} y={-PILL_H / 2} width={w} height={PILL_H} rx={PILL_H / 2} fill={COLOR_TOKENS.surface2} stroke={alpha(color, 0.55)} strokeWidth={2} />
        <text y={10} textAnchor="middle" fontFamily={FONT_TOKENS.body} fontWeight={600} fontSize={28} fill={color}>
          {label}
        </text>
      </g>
    </g>
  );
};

const PinWrapper: React.FC<{
  at: z.infer<typeof AnnotationSchema>["at"];
  fallback: number;
  children: (progress: number) => React.ReactNode;
}> = ({ at, fallback, children }) => {
  const cued = useBeat(at, 0.5, ease.outExpo);
  return <>{children(at === undefined ? fallback : cued)}</>;
};

const HighlightBand: React.FC<{
  at: z.infer<typeof HighlightSchema>["at"];
  fallback: number;
  render: (progress: number) => React.ReactNode;
}> = ({ at, fallback, render }) => {
  const cued = useBeat(at, 0.8, ease.outCubic);
  return <>{render(at === undefined ? fallback : cued)}</>;
};

export const LineChart: React.FC<LineChartProps> = (props) => {
  const frame = useCurrentFrame();
  const hasHeader = Boolean(props.kicker || props.title);
  const W = FRAME.width - FRAME.marginX * 2;
  const H = FRAME.height - (hasHeader ? FRAME.bodyTopWithTitle : FRAME.top) - FRAME.bottom - (props.source ? 40 : 0);

  const n = Math.min(props.x.length, ...props.series.map((s) => s.values.length));
  const xs = props.x.slice(0, n);
  const numericX = xs.every((v) => typeof v === "number");
  const series = props.series.map((s) => ({ ...s, values: s.values.slice(0, n) }));
  const multi = series.length > 1;
  const log = props.logScale && series.every((s) => s.values.every((v) => v > 0));

  const all = series.flatMap((s) => s.values);
  const dMin = Math.min(...all);
  const dMax = Math.max(...all);
  const defaultMin = log ? dMin : dMin >= 0 ? 0 : dMin;
  const yLo = props.yMin ?? defaultMin;
  const yHi = props.yMax ?? dMax;

  // Geometry ----------------------------------------------------------------
  const topPad = props.yLabel || props.xLabel ? 56 : 24;
  const bottomPad = 64;
  const rightPad = props.endLabel || multi ? (multi ? 250 : 190) : 36;
  const plotTop = topPad;
  const plotBottom = H - bottomPad;

  const yScale = (log ? scaleLog() : scaleLinear()).domain([yLo, yHi]).range([plotBottom, plotTop]);
  if (!log) (yScale as ReturnType<typeof scaleLinear>).nice(5);
  const [d0, d1] = yScale.domain() as [number, number];
  const ticks: number[] = log ? logTicks(d0, d1) : (yScale as ReturnType<typeof scaleLinear>).ticks(5);
  const tickStep = ticks.length > 1 ? Math.abs(ticks[1] - ticks[0]) : 1;
  const tickText = ticks.map((t) => `${props.prefix}${fmtNum(t, props.compact, log ? Math.max(1, t) : tickStep)}${props.suffix}`);
  const leftPad = Math.max(...tickText.map((t) => t.length)) * 17 + 28;
  const plotLeft = leftPad;
  const plotRight = W - rightPad;

  const xNum = numericX ? (xs as number[]) : xs.map((_, i) => i);
  const xScale = scaleLinear()
    .domain([Math.min(...xNum), Math.max(...xNum)])
    .range([plotLeft + 8, plotRight]);
  const px = (i: number) => xScale(xNum[i]);
  const py = (v: number) => yScale(v);

  const findIndex = (v: number | string): number => {
    if (numericX && typeof v === "number") {
      let best = 0;
      xNum.forEach((xv, i) => {
        if (Math.abs(xv - v) < Math.abs(xNum[best] - v)) best = i;
      });
      return best;
    }
    const idx = xs.findIndex((xv) => String(xv) === String(v));
    return idx >= 0 ? idx : 0;
  };

  // Draw progress -------------------------------------------------------------
  const rawDraw = useBeat(props.drawAt ?? 0.6, props.drawSec, ease.linear, -0.05);
  const draw = ease.inOutSine(rawDraw);
  const frameIn = useBeat(undefined, 0.7, ease.outExpo, -0.2);
  const tipX = plotLeft + 8 + (plotRight - plotLeft - 8) * draw;
  const tipFrac = draw;
  // x (pixel space) -> fraction of the x range, for the line-reaches-x fallback
  const reach = (i: number) => (px(i) - (plotLeft + 8)) / (plotRight - plotLeft - 8);

  const valueAtTip = (vals: number[]): { x: number; y: number; v: number } => {
    const target = Math.min(tipX, px(n - 1));
    let i = 0;
    while (i < n - 2 && px(i + 1) < target) i++;
    const x0 = px(i);
    const x1 = px(i + 1);
    const t = x1 === x0 ? 0 : Math.max(0, Math.min(1, (target - x0) / (x1 - x0)));
    const v = vals[i] + (vals[i + 1] - vals[i]) * t;
    return { x: target, y: py(v), v };
  };

  const lineGen = d3line<number>().x((_, i) => px(i)).y((v) => py(v)).curve(curveLinear);
  const areaGen = d3area<number>().x((_, i) => px(i)).y0(plotBottom).y1((v) => py(v)).curve(curveLinear);

  // x tick labels (sparse) ------------------------------------------------------
  const maxLabels = Math.max(2, Math.min(7, Math.floor((plotRight - plotLeft) / 170)));
  const labelCount = Math.min(maxLabels, n);
  const labelIdx = Array.from(new Set(Array.from({ length: labelCount }, (_, k) => Math.round((k * (n - 1)) / Math.max(1, labelCount - 1)))));

  // End labels (de-collided) ------------------------------------------------------
  const tips = series.map((s) => valueAtTip(s.values));
  const order = tips.map((_, i) => i).sort((a, b) => tips[a].y - tips[b].y);
  const labelY: number[] = [];
  let prev = -1e9;
  for (const i of order) {
    const y = Math.max(tips[i].y, prev + (multi ? 74 : 0));
    labelY[i] = y;
    prev = y;
  }

  const clipId = "lc-clip";
  const lineEnd = Math.min(tipX, px(n - 1)) + 2;
  const glowPulse = 0.5 + 0.5 * Math.sin(frame / 7);

  return (
    <ArchetypeFrame kicker={props.kicker} title={props.title} source={props.source} accent={props.accent}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        <defs>
          <clipPath id={clipId}>
            <rect x={0} y={-20} width={Math.max(0, lineEnd)} height={H + 40} />
          </clipPath>
          {series.map((s, i) => (
            <linearGradient key={i} id={`lc-fill-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={alpha(colorOf(s.color, "sky"), 0.26)} />
              <stop offset="100%" stopColor={alpha(colorOf(s.color, "sky"), 0)} />
            </linearGradient>
          ))}
        </defs>

        {/* y label */}
        {props.yLabel && (
          <text x={0} y={24} fontFamily={FONT_TOKENS.body} fontWeight={600} fontSize={30} fill={COLOR_TOKENS.text} opacity={frameIn}>
            {props.yLabel}
          </text>
        )}

        {props.xLabel && (
          <text x={plotRight} y={24} textAnchor="end" fontFamily={FONT_TOKENS.mono} fontSize={26} fill={COLOR_TOKENS.muted} opacity={frameIn}>
            {props.xLabel} {"\u2192"}
          </text>
        )}

        {/* grid + y ticks */}
        {ticks.map((t, i) => (
          <g key={t} opacity={frameIn} transform={`translate(0, ${(1 - frameIn) * 14})`}>
            <line x1={plotLeft} x2={plotRight} y1={py(t)} y2={py(t)} stroke={t === 0 ? alpha(COLOR_TOKENS.text, 0.3) : COLOR_TOKENS.grid} strokeWidth={t === 0 ? 2 : 1.5} />
            <text x={plotLeft - 18} y={py(t) + 9} textAnchor="end" fontFamily={FONT_TOKENS.mono} fontSize={26} fill={COLOR_TOKENS.muted}>
              {tickText[i]}
            </text>
          </g>
        ))}

        {/* x labels */}
        <g opacity={frameIn}>
          {labelIdx.map((i, k) => (
            <g key={i}>
              <line x1={px(i)} x2={px(i)} y1={plotBottom} y2={plotBottom + 10} stroke={alpha(COLOR_TOKENS.text, 0.3)} strokeWidth={2} />
              <text
                x={px(i)}
                y={plotBottom + 44}
                textAnchor={k === 0 ? "start" : k === labelIdx.length - 1 ? "end" : "middle"}
                fontFamily={FONT_TOKENS.mono}
                fontSize={26}
                fill={COLOR_TOKENS.muted}
              >
                {String(xs[i])}
              </text>
            </g>
          ))}
        </g>

        {/* highlighted period */}
        {props.highlightRange && (() => {
          const hr = props.highlightRange;
          const a = findIndex(hr.from);
          const b = findIndex(hr.to);
          const lo = Math.min(a, b);
          const hi = Math.max(a, b);
          const hc = colorOf(hr.color, "negative");
          const x0 = px(lo);
          const x1 = px(hi);
          const fallback = ease.outCubic(Math.max(0, Math.min(1, (tipFrac - reach(lo)) / 0.06)));
          return (
            <HighlightBand
              at={hr.at}
              fallback={fallback}
              render={(pr) => (
                <g>
                  <rect x={x0} y={plotTop} width={(x1 - x0) * pr} height={plotBottom - plotTop} fill={alpha(hc, 0.14)} />
                  <line x1={x0} x2={x0} y1={plotTop} y2={plotBottom} stroke={alpha(hc, 0.8)} strokeWidth={2.5} opacity={pr} />
                  <line x1={x1} x2={x1} y1={plotTop} y2={plotBottom} stroke={alpha(hc, 0.8)} strokeWidth={2.5} opacity={pr > 0.98 ? 1 : 0} />
                  <text
                    x={(x0 + x1) / 2}
                    y={plotTop + 34}
                    textAnchor="middle"
                    fontFamily={FONT_TOKENS.mono}
                    fontSize={28}
                    letterSpacing="0.08em"
                    fill={hc}
                    opacity={Math.max(0, (pr - 0.4) / 0.6)}
                    style={{ textTransform: "uppercase" }}
                  >
                    {hr.label}
                  </text>
                </g>
              )}
            />
          );
        })()}

        {/* series: fill + line (clipped to the draw front) */}
        {series.map((s, i) => {
          const c = colorOf(s.color, "sky");
          return (
            <g key={i} clipPath={`url(#${clipId})`}>
              {!multi && <path d={areaGen(s.values) ?? ""} fill={`url(#lc-fill-${i})`} />}
              <path d={lineGen(s.values) ?? ""} fill="none" stroke={c} strokeWidth={6} strokeLinejoin="round" strokeLinecap="round" />
            </g>
          );
        })}

        {/* annotations */}
        {(() => {
          type Rect = { x0: number; x1: number; y0: number; y1: number };
          const placed: Rect[] = [];
          if (props.highlightRange) {
            const hr = props.highlightRange;
            const mid = (px(findIndex(hr.from)) + px(findIndex(hr.to))) / 2;
            const hw = hr.label.length * 19 + 20;
            placed.push({ x0: mid - hw / 2, x1: mid + hw / 2, y0: plotTop, y1: plotTop + 48 });
          }
          if (props.endLabel) {
            for (const sr of series) {
              const ly = py(sr.values[n - 1]);
              placed.push({ x0: px(n - 1) + 20, x1: W, y0: ly - (multi ? 60 : 30), y1: ly + 30 });
            }
          }
          const yOnLine = (vals: number[], x: number): number => {
            let i = 0;
            while (i < n - 2 && px(i + 1) < x) i++;
            const x0 = px(i);
            const x1 = px(i + 1);
            const t = x1 === x0 ? 0 : Math.max(0, Math.min(1, (x - x0) / (x1 - x0)));
            return py(vals[i] + (vals[i + 1] - vals[i]) * t);
          };
          const hitsLine = (r: Rect): boolean => {
            for (const sr of series) {
              for (let x = Math.max(r.x0, px(0)); x <= Math.min(r.x1, px(n - 1)); x += 6) {
                const y = yOnLine(sr.values, x);
                if (y > r.y0 - 12 && y < r.y1 + 12) return true;
              }
            }
            return false;
          };
          return (props.annotations ?? []).map((a, k) => {
            const si = Math.min(a.series, series.length - 1);
            const idx = findIndex(a.x);
            const x = px(idx);
            const y = py(series[si].values[idx]);
            const w = a.label.length * 16.5 + 44;
            const clampX = (c: number) => Math.max(plotLeft + w / 2, Math.min(plotRight + 10 - w / 2, c));
            // Candidate pill centres around the point, nearest first.
            const cands: [number, number][] = [];
            for (const dy of [0, 90, 160, 230, 300, 370]) {
              for (const dx of [0, -w / 2 - 44, w / 2 + 44, -w, w]) {
                for (const sg of dy === 0 ? [1] : [-1, 1]) {
                  if (dx === 0 && dy === 0) continue;
                  cands.push([x + dx, y + sg * dy]);
                }
              }
            }
            cands.sort((u, v) => Math.hypot(u[0] - x, (u[1] - y) * 0.8) - Math.hypot(v[0] - x, (v[1] - y) * 0.8));
            let pick: [number, number] | undefined;
            for (const [rx, ry] of cands) {
              const cx = clampX(rx);
              const r = { x0: cx - w / 2, x1: cx + w / 2, y0: ry - PILL_H / 2, y1: ry + PILL_H / 2 };
              const inside = r.y0 >= plotTop - 8 && r.y1 <= plotBottom - 8;
              const clash = placed.some((q) => r.x0 < q.x1 + 10 && r.x1 > q.x0 - 10 && r.y0 < q.y1 + 10 && r.y1 > q.y0 - 10);
              if (inside && !clash && !hitsLine(r)) {
                pick = [cx, ry];
                break;
              }
            }
            const [cx, cy] = pick ?? [clampX(cands[0][0]), Math.max(plotTop + 30, cands[0][1])];
            placed.push({ x0: cx - w / 2, x1: cx + w / 2, y0: cy - PILL_H / 2, y1: cy + PILL_H / 2 });
            const fallback = ease.outBack(1.6)(Math.max(0, Math.min(1, (tipFrac - reach(idx)) / 0.05)));
            return (
              <PinWrapper key={k} at={a.at} fallback={fallback}>
                {(pr) => (
                  <Annotation px={x} py={y} cx={cx} cy={cy} w={w} label={a.label} color={colorOf(a.color, "text")} progress={Math.max(0, Math.min(1, pr))} />
                )}
              </PinWrapper>
            );
          });
        })()}

        {/* glowing tips + end labels */}
        {series.map((s, i) => {
          const c = colorOf(s.color, "sky");
          const t = tips[i];
          const done = rawDraw >= 1;
          const live = true;
          const labelIn = done ? 1 : Math.max(0, (draw - 0.1) / 0.4);
          const pillText = `${props.prefix}${fmtPill(t.v)}${props.suffix}`;
          const pillW = pillText.length * 17 + 36;
          return (
            <g key={`tip-${i}`}>
              {live && (
                <g>
                  <circle cx={t.x} cy={t.y} r={30 + 8 * glowPulse} fill={alpha(c, 0.1)} />
                  <circle cx={t.x} cy={t.y} r={19} fill={alpha(c, 0.28)} />
                  <circle cx={t.x} cy={t.y} r={9} fill={COLOR_TOKENS.text} stroke={c} strokeWidth={4} />
                </g>
              )}
              {props.endLabel && (
                <g transform={`translate(${Math.max(plotLeft + 20, t.x) + 34}, ${labelY[i]})`}>
                  {multi && (
                    <text y={-26} fontFamily={FONT_TOKENS.body} fontWeight={600} fontSize={28} fill={c} opacity={frameIn}>
                      {s.name}
                    </text>
                  )}
                  <g opacity={labelIn}>
                    <rect x={0} y={-22} width={pillW} height={44} rx={10} fill={COLOR_TOKENS.surface2} stroke={alpha(c, 0.6)} strokeWidth={2} />
                    <text x={pillW / 2} y={10} textAnchor="middle" fontFamily={FONT_TOKENS.mono} fontWeight={700} fontSize={28} fill={COLOR_TOKENS.text}>
                      {pillText}
                    </text>
                  </g>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </ArchetypeFrame>
  );
};

// ---------------------------------------------------------------------------
// Example data. Compound growth is exact arithmetic; the "crash" series is hypothetical.

const YEARS = Array.from({ length: 31 }, (_, i) => i);
const compound = (rate: number) => YEARS.map((y) => Math.round(10000 * Math.pow(1 + rate, y)));

// Hypothetical index (base 100): slow rise, sharp fall, slower recovery. Not real market data.
const MONTHS = Array.from({ length: 49 }, (_, i) => i);
const hypoIndex = MONTHS.map((m) => {
  const base = m <= 18 ? 100 + m * 2.2 : m <= 26 ? 139.6 - (m - 18) * 7.4 : 80.4 + (m - 26) * 2.1;
  return Math.round((base + (seeded(`hypo-${m}`) - 0.5) * 4) * 10) / 10;
});

const monthlyGrowth = Array.from({ length: 121 }, (_, i) => Math.round(1000 * Math.pow(1.015, i)));

registerArchetype({
  name: "LineChart",
  useWhen: "A value changes over time and the SHAPE is the point (growth curve, crash and recovery, divergence of 2-3 series); the line draws itself on the narration.",
  schema: LineChartSchema,
  component: LineChart,
  examples: [
    {
      narration:
        "Put ten thousand dollars away at seven percent and watch what happens. For years it feels slow, then the curve bends upward, and by year thirty it has passed seventy six thousand, while the same money at two percent barely reaches eighteen thousand.",
      props: {
        kicker: "Compounding",
        title: "Same money, different rate",
        x: YEARS,
        xLabel: "Years",
        yLabel: "Portfolio value",
        series: [
          { name: "2% a year", color: "sky", values: compound(0.02) },
          { name: "7% a year", color: "mint", values: compound(0.07) },
        ],
        prefix: "$",
        drawAt: "watch",
        drawSec: 5.5,
        highlightRange: { from: 15, to: 30, label: "The curve bends", color: "butter", at: "bends" },
        annotations: [{ x: 30, label: "$76,123 vs $18,114", series: 1, at: "thirty" }],
        source: "Illustrative: $10,000 compounded annually",
        accent: "mint",
      },
    },
    {
      narration:
        "Imagine an index that climbs for a year and a half, then the crash hits, and it loses almost half its gains in eight months. The recovery is slower than the fall.",
      props: {
        kicker: "Boom and bust",
        title: "The fall is faster than the climb",
        x: MONTHS,
        xLabel: "Months",
        yLabel: "Index (start = 100)",
        series: [{ name: "Index", color: "peach", values: hypoIndex }],
        drawAt: "climbs",
        drawSec: 5,
        highlightRange: { from: 18, to: 26, label: "The crash", color: "negative", at: "crash" },
        annotations: [{ x: 18, label: "Peak", at: "then", color: "butter" }],
        source: "Illustrative data",
        accent: "peach",
      },
    },
    {
      narration:
        "On a normal chart, steady growth of one and a half percent a month looks like an explosion. On a log scale, it becomes a straight line.",
      props: {
        kicker: "Log scale",
        title: "Steady growth, straight line",
        x: Array.from({ length: 121 }, (_, i) => i),
        xLabel: "Months",
        series: [{ name: "Balance", color: "lav", values: monthlyGrowth }],
        prefix: "$",
        logScale: true,
        drawAt: "steady",
        drawSec: 3.5,
        source: "Illustrative: $1,000 growing 1.5% per month",
        accent: "lav",
      },
    },
  ],
});
