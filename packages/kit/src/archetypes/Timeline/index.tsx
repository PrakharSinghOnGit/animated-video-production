import React from "react";
import { useCurrentFrame } from "remotion";
import { z } from "zod";
import { COLOR_TOKENS, FONT_TOKENS, alpha } from "../../tokens";
import { ease, lerp, p } from "../../motion";
import { ArchetypeFrame, ColorNameSchema, FrameTextSchema, FRAME, colorOf, type ColorName } from "../ArchetypeFrame";
import { CueSchema, parseCue, type Cue } from "../cues";
import { registerArchetype } from "../registry";
import { useScene, type SceneContextValue } from "../../scene";

/**
 * Timeline: a horizontal axis that draws first, then events pop one by one on their cues while a
 * "now" marker rides along the axis. Cards alternate above/below so neighbours never collide;
 * optional era brackets span groups of events along the top.
 */

const EventSchema = z.object({
  date: z.string().max(14).describe("Short date label, e.g. '1971', 'Sep 2008', 'Stage 2'"),
  title: z.string().max(36).describe("What happened, 2-5 words, e.g. 'Lehman Brothers collapses'"),
  detail: z.string().max(64).optional().describe("One short clause of context"),
  at: CueSchema.optional().describe("Spoken word on which the event pops; defaults to even spacing across the narration"),
  color: ColorNameSchema.optional().describe("Defaults to a rotating pastel"),
});

const SpanSchema = z.object({
  from: z.union([z.string(), z.number()]).describe("First event the era covers: its date label (e.g. '1944') or its 0-based index"),
  to: z.union([z.string(), z.number()]).describe("Last event the era covers: its date label or 0-based index"),
  label: z.string().max(28).describe("Era name, short enough to fit over the events it covers, e.g. 'Bretton Woods era'"),
  at: CueSchema.optional().describe("When the bracket draws; defaults to when its first event appears"),
  color: ColorNameSchema.optional(),
});

export const TimelineSchema = FrameTextSchema.extend({
  events: z.array(EventSchema).min(3).max(8).describe("Events in chronological order, left to right"),
  span: z.array(SpanSchema).max(3).optional().describe("Era brackets drawn along the top over a range of events"),
});
export type TimelineProps = z.infer<typeof TimelineSchema>;

const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function cueFrame(s: SceneContextValue, cue: Cue | undefined, offsetSec = 0): number | undefined {
  if (cue === undefined) return undefined;
  const base =
    typeof cue === "number"
      ? s.voiceStart + s.sec(cue)
      : (() => {
          const { word, occurrence } = parseCue(cue);
          return s.word(word, occurrence).start;
        })();
  return base + s.sec(offsetSec);
}

function wrapLines(str: string, size: number, width: number, f: number): number {
  const words = str.split(/\s+/).filter(Boolean);
  let lines = 1;
  let cur = 0;
  for (const w of words) {
    const ww = w.length * size * f;
    const next = cur === 0 ? ww : cur + size * 0.3 + ww;
    if (cur > 0 && next > width) {
      lines++;
      cur = ww;
    } else cur = next;
  }
  return lines;
}

const COLORS: ColorName[] = ["sky", "mint", "peach", "lav", "butter", "rose"];
const SPAN_COLORS: ColorName[] = ["lav", "sky", "peach"];
const LANE = 60;

export const Timeline: React.FC<TimelineProps> = (props) => {
  const frame = useCurrentFrame();
  const s = useScene();
  const accent = colorOf(props.accent);

  const hasHeader = Boolean(props.kicker || props.title);
  const bodyTop = hasHeader ? FRAME.bodyTopWithTitle : FRAME.top;
  const W = FRAME.width - 2 * FRAME.marginX;
  const H = FRAME.height - bodyTop - FRAME.bottom - (props.source ? 40 : 0);

  const events = props.events;
  const n = events.length;

  // ---- spans -> index ranges and lanes
  const indexOfRef = (ref: string | number) => {
    if (typeof ref === "number") return Math.max(0, Math.min(n - 1, Math.round(ref)));
    const i = events.findIndex((e) => clean(e.date) === clean(ref));
    return i >= 0 ? i : 0;
  };
  const spans = (props.span ?? []).map((sp, i) => {
    const a = indexOfRef(sp.from);
    const b = indexOfRef(sp.to);
    return { ...sp, a: Math.min(a, b), b: Math.max(a, b), color: colorOf(sp.color ?? SPAN_COLORS[i % SPAN_COLORS.length]), lane: 0 };
  });
  const laneEnds: number[] = [];
  [...spans]
    .sort((x, y) => x.a - y.a)
    .forEach((sp) => {
      let lane = laneEnds.findIndex((end) => end < sp.a);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = sp.b;
      sp.lane = lane;
    });
  const lanes = laneEnds.length;
  const stripH = lanes ? lanes * LANE + 26 : 0;

  // ---- geometry
  const R = H - stripH;
  const dense = n >= 7 ? 2 : n >= 5 ? 1 : 0;
  const cwMax = n <= 4 ? 520 : 440;
  const cw = Math.min(cwMax, (2 * W - 28 * (n - 1)) / (n + 1));
  const step = (W - cw) / (n - 1);
  const xs = events.map((_, i) => i * step);
  const innerW = cw - 4 - 24;
  const maxCardH = R / 2 - 36;

  let k = 1;
  const base = [
    { date: 34, title: 54, detail: 34 },
    { date: 32, title: 46, detail: 32 },
    { date: 28, title: 38, detail: 28 },
  ][dense];
  const sizes = (kk: number) => ({
    date: Math.max(26, Math.round(base.date * kk)),
    title: Math.max(30, Math.round(base.title * kk)),
    detail: Math.max(26, Math.round(base.detail * kk)),
  });
  const heightOf = (z: ReturnType<typeof sizes>) =>
    Math.max(
      ...events.map(
        (e) =>
          z.date * 1.3 +
          10 +
          wrapLines(e.title, z.title, innerW, 0.6) * z.title * 1.14 +
          (e.detail ? 10 + wrapLines(e.detail, z.detail, innerW, 0.55) * z.detail * 1.3 : 0) +
          20
      )
    );
  while (k > 0.68 && heightOf(sizes(k)) > maxCardH) k -= 0.04;
  const fs = sizes(k);
  // Stack (era strip, cards above, axis, cards below) is centred as a block so the frame is used evenly.
  const aH = Math.min(maxCardH, heightOf(fs)) + 4;
  const stackH = stripH + aH * 2 + 28;
  const top0 = Math.max(0, (H - stackH) / 2);
  const axisY = top0 + stripH + aH + 14;

  // ---- timing
  const dur = Math.max(1, s.voiceEnd - s.voiceStart);
  const t = events.map((e, i) => cueFrame(s, e.at) ?? Math.round(s.voiceStart + ((i + 0.5) / n) * dur));
  const axisStart = s.voiceStart - s.sec(0.3);
  const axisProg = ease.outCubic(p(frame, axisStart, axisStart + s.sec(1.0)));
  const pop = t.map((tt) => ease.outExpo(p(frame, tt - s.sec(0.08), tt + s.sec(0.55))));
  const dotPop = t.map((tt) => ease.outBack(1.9)(p(frame, tt - s.sec(0.08), tt + s.sec(0.4))));

  // Now marker: starts at the axis origin, glides to each event just before its cue.
  let markerX = 0;
  for (let i = 0; i < n; i++) {
    const from = i === 0 ? 0 : xs[i - 1];
    const startF = i === 0 ? Math.max(axisStart, t[0] - s.sec(1.0)) : Math.max(t[i - 1] + s.sec(0.15), t[i] - s.sec(0.7));
    const q = ease.inOutCubic(p(frame, startF, t[i]));
    if (q > 0) markerX = lerp(from, xs[i], q);
    else break;
  }
  const markerVisible = ease.outExpo(p(frame, axisStart, axisStart + s.sec(0.5)));
  const markerPulse = 0.5 + 0.5 * Math.sin((frame / s.fps) * Math.PI * 2 * 0.9);

  const tickEvery = step / 2;

  return (
    <ArchetypeFrame kicker={props.kicker} title={props.title} source={props.source} accent={props.accent}>
      <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H }}>
        {/* Era brackets */}
        {spans.map((sp, i) => {
          const at = cueFrame(s, sp.at, -0.08) ?? t[sp.a] - s.sec(0.1);
          const prog = ease.outCubic(p(frame, at, at + s.sec(0.8)));
          const left = xs[sp.a];
          const right = Math.min(W, xs[sp.b] + (sp.b === n - 1 ? cw : step * 0.92));
          const top = top0 + sp.lane * LANE;
          return (
            <div
              key={`span-${i}`}
              style={{
                position: "absolute",
                left,
                top,
                width: right - left,
                height: LANE - 14,
                clipPath: `inset(-10px ${(1 - prog) * 100}% -10px 0)`,
                opacity: Math.min(1, prog * 5),
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: alpha(sp.color, 0.13),
                  borderTop: `4px solid ${sp.color}`,
                  borderRadius: 6,
                }}
              />
              <div style={{ position: "absolute", left: 0, top: 0, width: 4, height: LANE - 14 + 14, background: sp.color, borderRadius: 2 }} />
              <div style={{ position: "absolute", right: 0, top: 0, width: 4, height: LANE - 14 + 14, background: sp.color, borderRadius: 2 }} />
              <div
                style={{
                  position: "absolute",
                  left: 24,
                  right: 24,
                  top: 4,
                  bottom: 0,
                  display: "flex",
                  alignItems: "center",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  fontFamily: FONT_TOKENS.display,
                  fontWeight: 600,
                  fontSize: 28,
                  letterSpacing: "-0.01em",
                  color: COLOR_TOKENS.text,
                }}
              >
                {sp.label}
              </div>
            </div>
          );
        })}

        {/* Axis */}
        <svg width={W} height={H} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
          <line x1={0} y1={axisY} x2={W * axisProg} y2={axisY} stroke={alpha(COLOR_TOKENS.text, 0.2)} strokeWidth={4} strokeLinecap="round" />
          {Array.from({ length: Math.floor(W / tickEvery) + 1 }, (_, i) => i * tickEvery).map((x, i) => (
            <line
              key={i}
              x1={x}
              x2={x}
              y1={axisY - 7}
              y2={axisY + 7}
              stroke={alpha(COLOR_TOKENS.text, 0.16)}
              strokeWidth={3}
              opacity={x <= W * axisProg ? 1 : 0}
            />
          ))}
          {/* elapsed portion */}
          <line x1={0} y1={axisY} x2={Math.min(markerX, W * axisProg)} y2={axisY} stroke={accent} strokeWidth={6} strokeLinecap="round" />
          {axisProg > 0.98 && (
            <path d={`M${W - 18} ${axisY - 14} L${W} ${axisY} L${W - 18} ${axisY + 14}`} fill="none" stroke={alpha(COLOR_TOKENS.text, 0.25)} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
          )}
          {/* ghost event slots: the structure is visible before anything is spoken */}
          {xs.map((x, i) => (
            <circle key={`g${i}`} cx={x} cy={axisY} r={12} fill="none" stroke={alpha(COLOR_TOKENS.text, 0.18)} strokeWidth={3} opacity={axisProg * (1 - dotPop[i])} />
          ))}
          {/* event dots */}
          {xs.map((x, i) => {
            const color = colorOf(events[i].color ?? COLORS[i % COLORS.length]);
            const d = Math.max(0, dotPop[i]);
            return (
              <g key={`d${i}`} transform={`translate(${x} ${axisY}) scale(${d})`}>
                <circle r={17} fill={COLOR_TOKENS.bg} stroke={color} strokeWidth={4} />
                <circle r={7} fill={color} />
              </g>
            );
          })}
          {/* now marker */}
          <g transform={`translate(${markerX} ${axisY})`} opacity={markerVisible}>
            <circle r={24 + 6 * markerPulse} fill={alpha(accent, 0.12 + 0.1 * (1 - markerPulse))} />
            <circle r={11} fill={accent} stroke={COLOR_TOKENS.bg} strokeWidth={3} />
          </g>
        </svg>

        {/* Event cards */}
        {events.map((e, i) => {
          const above = i % 2 === 0;
          const color = colorOf(e.color ?? COLORS[i % COLORS.length]);
          const r = pop[i];
          const next = i < n - 1 ? p(frame, t[i + 1], t[i + 1] + s.sec(0.45)) : 0;
          const dim = 1 - 0.28 * ease.outCubic(next);
          const slide = (1 - r) * 30 * (above ? 1 : -1);
          return (
            <div
              key={`ev-${i}`}
              style={{
                position: "absolute",
                left: xs[i] - 2,
                width: cw,
                ...(above ? { bottom: H - axisY + 14 } : { top: axisY + 14 }),
                boxSizing: "border-box",
                padding: above ? "0 0 20px 26px" : "20px 0 0 26px",
                opacity: r * dim,
                transform: `translateY(${slide}px)`,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: 4,
                  borderRadius: 2,
                  background: color,
                  transformOrigin: above ? "bottom" : "top",
                  transform: `scaleY(${r})`,
                }}
              />
              <div
                style={{
                  fontFamily: FONT_TOKENS.mono,
                  fontWeight: 700,
                  fontSize: fs.date,
                  lineHeight: 1.3,
                  letterSpacing: "0.04em",
                  color,
                  marginBottom: 10,
                }}
              >
                {e.date}
              </div>
              <div
                style={{
                  fontFamily: FONT_TOKENS.display,
                  fontWeight: 600,
                  fontSize: fs.title,
                  lineHeight: 1.14,
                  letterSpacing: "-0.02em",
                  textWrap: "balance",
                  color: COLOR_TOKENS.text,
                }}
              >
                {e.title}
              </div>
              {e.detail && (
                <div
                  style={{
                    marginTop: 10,
                    fontFamily: FONT_TOKENS.body,
                    fontSize: fs.detail,
                    lineHeight: 1.3,
                    textWrap: "balance",
                    color: COLOR_TOKENS.muted,
                  }}
                >
                  {e.detail}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ArchetypeFrame>
  );
};

registerArchetype({
  name: "Timeline",
  useWhen: "Showing a sequence of dated events or stages in order (a crisis history, policy changes, the stages of a cycle), optionally grouped into eras.",
  schema: TimelineSchema,
  component: Timeline,
  examples: [
    {
      narration:
        "After Bretton Woods in nineteen forty four, the dollar was tied to gold, until the United States ended convertibility in nineteen seventy one. Lehman Brothers collapsed in two thousand eight, and in twenty twenty central banks cut rates and bought assets on a huge scale.",
      props: {
        kicker: "Money, modern history",
        title: "How the rules of money changed",
        events: [
          { date: "1944", title: "Bretton Woods", detail: "Currencies are pegged to the dollar", at: "Bretton" },
          { date: "1971", title: "US ends gold convertibility", detail: "The dollar is no longer redeemable in gold", at: "convertibility" },
          { date: "2008", title: "Lehman Brothers collapses", detail: "The financial crisis deepens", at: "Lehman" },
          { date: "2020", title: "Central banks step in", detail: "Rate cuts and large asset purchases", at: "central" },
        ],
        span: [{ from: "1944", to: "1971", label: "Bretton Woods era", at: "tied" }],
        source: "Historical record",
        accent: "butter",
      },
    },
    {
      narration:
        "A bubble starts with displacement, then a boom, then euphoria, then smart money takes profits, and finally panic.",
      props: {
        kicker: "Anatomy of a bubble",
        title: "Five stages, boom to bust",
        events: [
          { date: "Stage 1", title: "Displacement", detail: "A new story or cheap credit changes expectations", at: "displacement", color: "sky" },
          { date: "Stage 2", title: "Boom", detail: "Prices climb and attention follows", at: "boom", color: "mint" },
          { date: "Stage 3", title: "Euphoria", detail: "Caution fades, leverage builds", at: "euphoria", color: "butter" },
          { date: "Stage 4", title: "Profit-taking", detail: "Early buyers quietly sell", at: "profits", color: "peach" },
          { date: "Stage 5", title: "Panic", detail: "Selling feeds on itself", at: "panic", color: "rose" },
        ],
        source: "Illustrative: Minsky and Kindleberger's stages of a bubble",
        accent: "rose",
      },
    },
    {
      narration:
        "Markets have seen crash after crash: Wall Street in nineteen twenty nine, the gold window closing, Black Monday, the Asian crisis, the dot com bubble, Lehman, the Eurozone, and the pandemic.",
      props: {
        kicker: "A century of shocks",
        events: [
          { date: "1929", title: "Wall Street crash", at: "Wall" },
          { date: "1971", title: "Gold window closes", at: "gold" },
          { date: "1987", title: "Black Monday", at: "Monday" },
          { date: "1997", title: "Asian financial crisis", at: "Asian" },
          { date: "2000", title: "Dot-com bubble bursts", at: "bubble" },
          { date: "2008", title: "Lehman collapses", at: "Lehman" },
          { date: "2010", title: "Eurozone debt crisis", at: "Eurozone" },
          { date: "2020", title: "Pandemic market crash", at: "pandemic" },
        ],
        span: [{ from: "2008", to: "2010", label: "Post-crisis years" }],
        source: "Historical record",
        accent: "lav",
      },
    },
  ],
});
