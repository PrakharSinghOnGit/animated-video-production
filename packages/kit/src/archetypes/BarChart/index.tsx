import React from "react";
import { useCurrentFrame } from "remotion";
import { z } from "zod";
import { COLOR_TOKENS, FONT_TOKENS, alpha } from "../../tokens";
import { ease, lerp, p } from "../../motion";
import { ArchetypeFrame, ColorNameSchema, FRAME, FrameTextSchema, colorOf } from "../ArchetypeFrame";
import { CueSchema, useBeat, useCue } from "../cues";
import { registerArchetype } from "../registry";
import { useScene } from "../../scene";

/**
 * BarChart: 2-8 categories as horizontal or vertical bars that grow in a stagger on a cue.
 * Category names (clamped to 2 lines) and empty tracks are visible from the start, so the
 * frame is never empty; highlight dims everything but the named categories.
 */

const BarSchema = z.object({
  label: z.string().max(40).describe("Category name; long names wrap to 2 lines and are truncated after that"),
  value: z.number().nonnegative(),
  color: ColorNameSchema.optional().describe("Override this bar's colour (default: barColor)"),
});

const ReferenceSchema = z.object({
  value: z.number().nonnegative().describe("Same unit as the bars"),
  label: z.string().max(30).describe("What the line marks, e.g. 'Target' or 'What you put in'"),
  color: ColorNameSchema.default("text"),
  at: CueSchema.optional().describe("When the line draws; default just after the bars have grown"),
});

export const BarChartSchema = FrameTextSchema.extend({
  bars: z.array(BarSchema).min(2).max(8),
  variant: z.enum(["horizontal", "vertical"]).default("horizontal").describe("horizontal suits long names and rankings; vertical suits 2-6 short names"),
  barColor: ColorNameSchema.default("sky").describe("Default colour of all bars"),
  prefix: z.string().max(4).default("").describe("e.g. '$'"),
  suffix: z.string().max(12).default("").describe("e.g. '%' or 'K'"),
  decimals: z.number().int().min(0).max(3).default(0),
  growAt: CueSchema.optional().describe("Spoken word on which the first bar starts growing; default 0.8 s after the voice starts"),
  staggerSec: z.number().min(0).max(1).default(0.18).describe("Delay between consecutive bars; match the pace of the narration"),
  sortDescending: z.boolean().default(false).describe("Sort bars from largest to smallest (ranking)"),
  highlight: z.array(z.string()).max(4).optional().describe("Exact bar labels to emphasise (in the accent colour); all other bars dim"),
  highlightAt: CueSchema.optional().describe("Spoken word on which the highlight applies; default just after all bars have grown"),
  referenceLine: ReferenceSchema.optional(),
});
export type BarChartProps = z.infer<typeof BarChartSchema>;

const GROW_SEC = 0.9;

function fmt(n: number, decimals: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

const clamp2: React.CSSProperties = {
  display: "-webkit-box",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 2,
  overflow: "hidden",
  textWrap: "balance",
  overflowWrap: "anywhere",
};

interface Row {
  label: string;
  value: number;
  base: string;
  lit: boolean;
}

const BarItem: React.FC<{
  row: Row;
  index: number;
  max: number;
  vertical: boolean;
  props: BarChartProps;
  growAt: BarChartProps["growAt"];
  hl: number;
  hasHighlight: boolean;
  accent: string;
  geom: { slot: number; thickness: number; length: number; labelW: number; originX: number; originY: number };
  frameIn: number;
}> = ({ row, index, max, vertical, props, growAt, hl, hasHighlight, accent, geom, frameIn }) => {
  const grow = useBeat(growAt ?? 0.8, GROW_SEC, ease.outCubic, -0.05 + index * props.staggerSec);
  const len = Math.max(grow > 0 ? 6 : 0, geom.length * (row.value / max) * grow);
  const dim = hasHighlight ? lerp(1, row.lit ? 1 : 0.4, hl) : 1;
  const valueText = `${props.prefix}${fmt(row.value * grow, props.decimals)}${props.suffix}`;
  const emphasised = hasHighlight && row.lit && hl > 0.5;
  const valueColor = emphasised ? accent : COLOR_TOKENS.text;
  const track = alpha(COLOR_TOKENS.text, 0.06);

  const barFill = (
    <>
      <div style={{ position: "absolute", inset: 0, borderRadius: 10, background: row.base }} />
      {hasHighlight && row.lit && (
        <div style={{ position: "absolute", inset: 0, borderRadius: 10, background: accent, opacity: hl }} />
      )}
    </>
  );

  if (!vertical) {
    const top = geom.originY + index * geom.slot + (geom.slot - geom.thickness) / 2;
    return (
      <>
        <div
          style={{
            position: "absolute",
            left: 0,
            top: geom.originY + index * geom.slot,
            width: geom.labelW,
            height: geom.slot,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            textAlign: "right",
            opacity: frameIn * (hasHighlight ? lerp(1, row.lit ? 1 : 0.45, hl) : 1),
            transform: `translateX(${(1 - frameIn) * -24}px)`,
          }}
        >
          <div
            style={{
              ...clamp2,
              fontFamily: FONT_TOKENS.body,
              fontWeight: row.lit && hl > 0.5 ? 700 : 500,
              fontSize: 32,
              lineHeight: 1.18,
              color: COLOR_TOKENS.text,
            }}
          >
            {row.label}
          </div>
        </div>
        <div style={{ position: "absolute", left: geom.originX, top, width: geom.length, height: geom.thickness, borderRadius: 10, background: track, opacity: frameIn }} />
        <div style={{ position: "absolute", left: geom.originX, top, width: len, height: geom.thickness, opacity: dim }}>{barFill}</div>
        <div
          style={{
            position: "absolute",
            left: geom.originX + len + 18,
            top,
            height: geom.thickness,
            display: "flex",
            alignItems: "center",
            fontFamily: FONT_TOKENS.mono,
            fontWeight: 700,
            fontSize: 36,
            color: valueColor,
            opacity: Math.min(1, grow * 4) * dim,
            whiteSpace: "nowrap",
          }}
        >
          {valueText}
        </div>
      </>
    );
  }

  const left = geom.originX + index * geom.slot + (geom.slot - geom.thickness) / 2;
  const baseline = geom.originY;
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: geom.originX + index * geom.slot + 6,
          top: baseline + 18,
          width: geom.slot - 12,
          display: "flex",
          justifyContent: "center",
          textAlign: "center",
          opacity: frameIn * (hasHighlight ? lerp(1, row.lit ? 1 : 0.45, hl) : 1),
          transform: `translateY(${(1 - frameIn) * 16}px)`,
        }}
      >
        <div
          style={{
            ...clamp2,
            fontFamily: FONT_TOKENS.body,
            fontWeight: row.lit && hl > 0.5 ? 700 : 500,
            fontSize: 28,
            lineHeight: 1.18,
            color: COLOR_TOKENS.text,
          }}
        >
          {row.label}
        </div>
      </div>
      <div style={{ position: "absolute", left, top: baseline - geom.length, width: geom.thickness, height: geom.length, borderRadius: 10, background: track, opacity: frameIn }} />
      <div style={{ position: "absolute", left, top: baseline - len, width: geom.thickness, height: len, opacity: dim }}>{barFill}</div>
      <div
        style={{
          position: "absolute",
          left: geom.originX + index * geom.slot,
          width: geom.slot,
          top: baseline - len - 56,
          height: 48,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          fontFamily: FONT_TOKENS.mono,
          fontWeight: 700,
          fontSize: 34,
          color: valueColor,
          opacity: Math.min(1, grow * 4) * dim,
          whiteSpace: "nowrap",
        }}
      >
        {valueText}
      </div>
    </>
  );
};

export const BarChart: React.FC<BarChartProps> = (props) => {
  const frame = useCurrentFrame();
  const s = useScene();
  const accent = colorOf(props.accent);
  const vertical = props.variant === "vertical";
  const hasHeader = Boolean(props.kicker || props.title);
  const W = FRAME.width - FRAME.marginX * 2;
  const H = FRAME.height - (hasHeader ? FRAME.bodyTopWithTitle : FRAME.top) - FRAME.bottom - (props.source ? 40 : 0);

  const litNames = (props.highlight ?? []).map((h) => h.trim().toLowerCase());
  const hasHighlight = litNames.length > 0;
  const rows: Row[] = props.bars
    .map((b) => ({
      label: b.label,
      value: b.value,
      base: colorOf(b.color ?? props.barColor, "sky"),
      lit: litNames.includes(b.label.trim().toLowerCase()),
    }))
    .sort((a, b) => (props.sortDescending ? b.value - a.value : 0));
  const n = rows.length;
  const ref = props.referenceLine;
  const max = Math.max(...rows.map((r) => r.value), ref?.value ?? 0, 1e-9);

  const frameIn = useBeat(undefined, 0.7, ease.outExpo, -0.2);
  const growStart = useCue(props.growAt ?? 0.8, -0.05);
  const grownFrame = growStart + s.sec(GROW_SEC + props.staggerSec * (n - 1));
  const hlCued = useBeat(props.highlightAt, 0.5, ease.outCubic);
  const hlAuto = ease.outCubic(p(frame, grownFrame + s.sec(0.5), grownFrame + s.sec(1.0)));
  const hl = props.highlightAt === undefined ? hlAuto : hlCued;
  const refCued = useBeat(ref?.at, 0.9, ease.outCubic);
  const refAuto = ease.outCubic(p(frame, grownFrame - s.sec(0.3), grownFrame + s.sec(0.6)));
  const refIn = ref ? (ref.at === undefined ? refAuto : refCued) : 0;

  // Geometry -----------------------------------------------------------------
  const longest = Math.max(...rows.map((r) => r.label.length));
  let geom: React.ComponentProps<typeof BarItem>["geom"];
  let refPos = { x: 0, y: 0 };
  if (!vertical) {
    const labelW = Math.max(200, Math.min(440, longest * 17 + 24));
    const originX = labelW + 28;
    const valueRes = 240;
    const length = W - originX - valueRes;
    const topRes = ref ? 64 : 0;
    const slot = Math.min(132, (H - topRes) / n);
    const originY = topRes + Math.max(0, (H - topRes - slot * n) / 2);
    geom = { slot, thickness: Math.min(88, slot * 0.64), length, labelW, originX, originY };
    refPos = { x: originX + length * ((ref?.value ?? 0) / max), y: originY };
  } else {
    const gutter = ref ? 260 : 0;
    const plotW = W - gutter;
    const slot = Math.min(240, plotW / n);
    const used = slot * n;
    const originX = (plotW - used) / 2;
    const labelRes = 100;
    const valueRes = 60;
    const length = H - labelRes - valueRes;
    geom = { slot, thickness: Math.min(150, slot * 0.62), length, labelW: 0, originX, originY: H - labelRes };
    refPos = { x: originX + used, y: geom.originY - length * ((ref?.value ?? 0) / max) };
  }

  const refColor = colorOf(ref?.color ?? "text");
  const axis = alpha(COLOR_TOKENS.text, 0.3);

  return (
    <ArchetypeFrame kicker={props.kicker} title={props.title} source={props.source} accent={props.accent}>
      <div style={{ position: "absolute", inset: 0 }}>
        {/* baseline axis */}
        {!vertical ? (
          <div style={{ position: "absolute", left: geom.originX - 2, top: geom.originY - 6, width: 3, height: geom.slot * n + 12, background: axis, opacity: frameIn }} />
        ) : (
          <div style={{ position: "absolute", left: geom.originX, top: geom.originY, width: geom.slot * n, height: 3, background: axis, opacity: frameIn }} />
        )}

        {rows.map((row, i) => (
          <BarItem
            key={row.label + i}
            row={row}
            index={i}
            max={max}
            vertical={vertical}
            props={props}
            growAt={props.growAt}
            hl={hl}
            hasHighlight={hasHighlight}
            accent={accent}
            geom={geom}
            frameIn={frameIn}
          />
        ))}

        {/* reference line */}
        {ref && refIn > 0 && !vertical && (
          <>
            <div
              style={{
                position: "absolute",
                left: refPos.x - 1.5,
                top: geom.originY - 6,
                width: 0,
                height: (geom.slot * n + 12) * refIn,
                borderLeft: `3px dashed ${alpha(refColor, 0.85)}`,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: Math.max(0, Math.min(W - 460, refPos.x - 230)),
                top: geom.originY - 66,
                width: 460,
                display: "flex",
                justifyContent: "center",
                opacity: refIn,
              }}
            >
              <RefChip label={ref.label} value={`${props.prefix}${fmt(ref.value, props.decimals)}${props.suffix}`} color={refColor} />
            </div>
          </>
        )}
        {ref && refIn > 0 && vertical && (
          <>
            <div
              style={{
                position: "absolute",
                left: geom.originX,
                top: refPos.y - 1.5,
                width: geom.slot * n * refIn,
                height: 0,
                borderTop: `3px dashed ${alpha(refColor, 0.85)}`,
              }}
            />
            <div style={{ position: "absolute", left: refPos.x + 24, top: refPos.y - 40, width: 232, opacity: refIn }}>
              <RefChip label={ref.label} value={`${props.prefix}${fmt(ref.value, props.decimals)}${props.suffix}`} color={refColor} stacked />
            </div>
          </>
        )}
      </div>
    </ArchetypeFrame>
  );
};

const RefChip: React.FC<{ label: string; value: string; color: string; stacked?: boolean }> = ({ label, value, color, stacked }) => (
  <div
    style={{
      display: "flex",
      flexDirection: stacked ? "column" : "row",
      alignItems: stacked ? "flex-start" : "center",
      gap: stacked ? 2 : 14,
      padding: "8px 20px",
      borderRadius: 14,
      background: COLOR_TOKENS.surface2,
      border: `2px solid ${alpha(color, 0.6)}`,
      fontFamily: FONT_TOKENS.body,
      fontSize: 28,
      lineHeight: 1.15,
      color,
      fontWeight: 600,
      textWrap: "balance",
      whiteSpace: stacked ? "normal" : "nowrap",
    }}
  >
    <span>{label}</span>
    <span style={{ fontFamily: FONT_TOKENS.mono, fontWeight: 700, color: COLOR_TOKENS.text }}>{value}</span>
  </div>
);

// ---------------------------------------------------------------------------
// Examples. Final balances are exact arithmetic (10,000 compounded annually for 30 years);
// the budget split is hypothetical.

const finalBalance = (rate: number) => Math.round(10000 * Math.pow(1 + rate, 30));

registerArchetype({
  name: "BarChart",
  useWhen: "Compare 2-8 values across categories or rank them (sizes, rates, shares); optionally highlight one or more bars or mark a reference value.",
  schema: BarChartSchema,
  component: BarChart,
  examples: [
    {
      narration:
        "Same ten thousand dollars, thirty years, but change the rate. At two percent you end up with eighteen thousand. At six percent, fifty seven thousand. At ten percent, one hundred seventy four thousand.",
      props: {
        kicker: "Compounding",
        title: "The rate changes everything",
        variant: "horizontal",
        bars: [
          { label: "2% a year", value: finalBalance(0.02) },
          { label: "4% a year", value: finalBalance(0.04) },
          { label: "6% a year", value: finalBalance(0.06) },
          { label: "8% a year", value: finalBalance(0.08) },
          { label: "10% a year", value: finalBalance(0.1) },
        ],
        prefix: "$",
        growAt: "change",
        staggerSec: 0.3,
        highlight: ["10% a year"],
        highlightAt: "ten#2",
        referenceLine: { value: 10000, label: "What you put in", color: "text", at: "dollars" },
        source: "Illustrative: $10,000 compounded annually for 30 years",
        accent: "mint",
      },
    },
    {
      narration:
        "In this made-up budget, housing takes the biggest slice by far, a third of income, well above the target. Transport, food and healthcare are each much smaller.",
      props: {
        kicker: "Where the money goes",
        title: "One line item dominates",
        variant: "vertical",
        bars: [
          { label: "Housing", value: 33 },
          { label: "Everything else", value: 20 },
          { label: "Transportation and car costs", value: 17 },
          { label: "Food and groceries", value: 12 },
          { label: "Savings", value: 10 },
          { label: "Healthcare and insurance", value: 8 },
        ],
        suffix: "%",
        sortDescending: true,
        growAt: "budget",
        staggerSec: 0.25,
        highlight: ["Housing"],
        highlightAt: "housing",
        referenceLine: { value: 25, label: "Illustrative target", color: "butter", at: "target" },
        source: "Illustrative data",
        accent: "peach",
      },
    },
  ],
});
