import React from "react";
import { useCurrentFrame } from "remotion";
import { z } from "zod";
import { COLOR_TOKENS, FONT_TOKENS, alpha } from "../../tokens";
import { ease, lerp, p } from "../../motion";
import { ArchetypeFrame, ColorNameSchema, FrameTextSchema, colorOf } from "../ArchetypeFrame";
import { CueSchema, useBeat, useCue } from "../cues";
import { registerArchetype } from "../registry";
import { useScene } from "../../scene";

/**
 * StatReveal: one headline number that counts up on a spoken cue, a label that
 * says what it measures, and optional comparison bars that give it scale.
 */

const CompareSchema = z.object({
  label: z.string().max(40),
  value: z.number().nonnegative(),
  color: ColorNameSchema.default("muted"),
  at: CueSchema.optional().describe("When this bar grows; defaults to just after the main number lands"),
});

export const StatRevealSchema = FrameTextSchema.extend({
  value: z.number().describe("The number as it should read, in the unit shown, e.g. 9.6 for '$9.6 trillion'"),
  prefix: z.string().max(4).default(""),
  suffix: z.string().max(14).default("").describe("e.g. 'T', '%', ' trillion'"),
  decimals: z.number().int().min(0).max(3).default(0),
  label: z.string().max(60).describe("What the number measures, e.g. 'traded in currency markets every day'"),
  barLabel: z.string().max(30).optional().describe("Short name for the main value's bar when compare is used, e.g. 'After 30 years'"),
  countAt: CueSchema.optional().describe("Spoken word on which the count-up starts"),
  context: z.string().max(110).optional().describe("One supporting sentence shown under the label"),
  contextAt: CueSchema.optional(),
  compare: z
    .array(CompareSchema)
    .max(3)
    .optional()
    .describe("Reference values in the SAME unit as value, drawn as bars to give scale"),
  layout: z.enum(["left", "center"]).default("left"),
});
export type StatRevealProps = z.infer<typeof StatRevealSchema>;

function format(n: number, decimals: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

const CompareBar: React.FC<{
  label: string;
  value: number;
  max: number;
  color: string;
  progress: number;
  valueText: string;
  emphasis?: boolean;
}> = ({ label, value, max, color, progress, valueText, emphasis }) => {
  const width = (value / max) * 100 * ease.outCubic(progress);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 28, opacity: Math.min(1, progress * 3) }}>
      <div
        style={{
          width: 300,
          textAlign: "right",
          fontFamily: FONT_TOKENS.body,
          fontSize: 30,
          color: emphasis ? COLOR_TOKENS.text : COLOR_TOKENS.muted,
          fontWeight: emphasis ? 600 : 400,
        }}
      >
        {label}
      </div>
      {/* marginRight reserves room for the value text so the longest bar never pushes it off-frame */}
      <div style={{ flex: 1, height: 34, position: "relative", marginRight: 240 }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            width: `${Math.max(width, 0.4)}%`,
            borderRadius: 6,
            background: emphasis ? color : alpha(color, 0.55),
          }}
        />
        <div
          style={{
            position: "absolute",
            left: `calc(${Math.max(width, 0.4)}% + 16px)`,
            top: 0,
            lineHeight: "34px",
            fontFamily: FONT_TOKENS.mono,
            fontSize: 26,
            color: emphasis ? COLOR_TOKENS.text : COLOR_TOKENS.muted,
          }}
        >
          {valueText}
        </div>
      </div>
    </div>
  );
};

export const StatReveal: React.FC<StatRevealProps> = (props) => {
  const frame = useCurrentFrame();
  const s = useScene();
  const accent = colorOf(props.accent);
  const centered = props.layout === "center";

  const countStart = useCue(props.countAt, -0.05);
  const countEnd = countStart + s.sec(1.1);
  const count = ease.outCubic(p(frame, countStart, countEnd));
  const numberIn = useBeat(props.countAt, 0.5);
  // The label sets up the question as soon as the narration starts, so the frame is never
  // empty while waiting for the count cue; the number then lands on its spoken word.
  const labelIn = useBeat(undefined, 0.6, ease.outExpo, -0.1);
  const contextIn = useBeat(props.contextAt ?? props.countAt, 0.6, ease.outExpo, props.contextAt ? -0.08 : 0.9);

  const compare = props.compare ?? [];
  const max = Math.max(props.value, ...compare.map((c) => c.value)) || 1;
  const landed = countEnd / s.fps - s.voiceStart / s.fps;
  // Bars stagger in after the number lands unless they have their own cue.
  const barCues = compare.map((c, i) => c.at ?? landed + 0.25 + i * 0.35);
  const barProgress = [useBeat(barCues[0], 0.8), useBeat(barCues[1], 0.8), useBeat(barCues[2], 0.8)];
  const mainBar = useBeat(props.countAt, 1.1, ease.outCubic);

  const numberText = `${props.prefix}${format(lerp(0, props.value, count), props.decimals)}`;

  return (
    <ArchetypeFrame kicker={props.kicker} title={props.title} source={props.source} accent={props.accent}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: compare.length ? "flex-start" : "center",
          alignItems: centered ? "center" : "flex-start",
          textAlign: centered ? "center" : "left",
          paddingTop: compare.length ? 10 : 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 18,
            transform: `translateY(${(1 - numberIn) * 40}px)`,
            opacity: numberIn,
          }}
        >
          <span
            style={{
              fontFamily: FONT_TOKENS.display,
              fontWeight: 800,
              fontSize: compare.length ? 220 : 300,
              lineHeight: 0.95,
              letterSpacing: "-0.04em",
              color: accent,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {numberText}
          </span>
          {props.suffix && (
            <span
              style={{
                fontFamily: FONT_TOKENS.display,
                fontWeight: 700,
                fontSize: compare.length ? 84 : 110,
                color: COLOR_TOKENS.text,
                opacity: count > 0.6 ? 1 : count / 0.6,
              }}
            >
              {props.suffix.trim()}
            </span>
          )}
        </div>

        <div
          style={{
            marginTop: 18,
            maxWidth: 1250,
            fontFamily: FONT_TOKENS.body,
            fontWeight: 600,
            fontSize: 48,
            lineHeight: 1.2,
            textWrap: "balance",
            color: COLOR_TOKENS.text,
            opacity: labelIn,
            transform: `translateY(${(1 - labelIn) * 18}px)`,
          }}
        >
          {props.label}
        </div>

        {props.context && (
          <div
            style={{
              marginTop: 16,
              maxWidth: 1150,
              fontFamily: FONT_TOKENS.body,
              fontSize: 36,
              lineHeight: 1.35,
              textWrap: "balance",
              color: COLOR_TOKENS.muted,
              opacity: contextIn,
            }}
          >
            {props.context}
          </div>
        )}

        {compare.length > 0 && (
          <div style={{ marginTop: 56, width: "100%", display: "flex", flexDirection: "column", gap: 22 }}>
            <CompareBar
              label={props.barLabel ?? props.label}
              value={props.value}
              max={max}
              color={accent}
              progress={mainBar}
              valueText={`${props.prefix}${format(props.value, props.decimals)}${props.suffix}`}
              emphasis
            />
            {compare.map((c, i) => (
              <CompareBar
                key={c.label}
                label={c.label}
                value={c.value}
                max={max}
                color={colorOf(c.color, "muted")}
                progress={barProgress[i]}
                valueText={`${props.prefix}${format(c.value, props.decimals)}${props.suffix}`}
              />
            ))}
          </div>
        )}
      </div>
    </ArchetypeFrame>
  );
};

registerArchetype({
  name: "StatReveal",
  useWhen: "One striking number carries the beat (a size, a share, a price); optionally give it scale against 1-3 reference values.",
  schema: StatRevealSchema,
  component: StatReveal,
  examples: [
    {
      narration: "Every single day, about nine point six trillion dollars changes hands in currency markets.",
      props: {
        kicker: "The FX market",
        value: 9.6,
        prefix: "$",
        suffix: " trillion",
        decimals: 1,
        label: "traded in currency markets every day",
        countAt: "nine",
        context: "More than the entire annual output of most countries, every single day.",
        contextAt: "changes",
        source: "BIS Triennial Survey, 2025",
        accent: "butter",
        layout: "left",
      },
    },
    {
      narration: "Leave ten thousand dollars invested for thirty years at seven percent, and it grows to about seventy six thousand.",
      props: {
        title: "Time does the heavy lifting",
        value: 76123,
        prefix: "$",
        decimals: 0,
        label: "after 30 years at 7% a year",
        barLabel: "After 30 years",
        countAt: "grows",
        compare: [{ label: "What you put in", value: 10000, color: "sky", at: "ten" }],
        source: "Illustrative: $10,000 compounded at 7% for 30 years",
        accent: "mint",
        layout: "left",
      },
    },
  ],
});
