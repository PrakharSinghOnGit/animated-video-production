import React from "react";
import { useCurrentFrame } from "remotion";
import { z } from "zod";
import { COLOR_TOKENS, FONT_TOKENS, alpha } from "../../tokens";
import { ease, p } from "../../motion";
import { ArchetypeFrame, FrameTextSchema, colorOf } from "../ArchetypeFrame";
import { CueSchema, parseCue, type Cue } from "../cues";
import { registerArchetype } from "../registry";
import { useScene, type SceneContextValue, type SpokenWord } from "../../scene";

/**
 * KineticHeadline: a typography-led beat for one key phrase or term. Words are revealed in step
 * with the ACTUAL spoken words (matched in order against the scene transcript, with even pacing
 * as a fallback); emphasis words get the accent colour, a heavier weight and a sweeping underline
 * or marker on their spoken moment; an optional definition fades in afterwards.
 */

export const KineticHeadlineSchema = FrameTextSchema.extend({
  variant: z
    .enum(["center-large", "stacked-left", "term"])
    .default("center-large")
    .describe(
      "center-large: one punchy centred line, up to ~8 words, huge. stacked-left: 4-12 words broken into 2-3 left-aligned lines. term: a TERM in caps (1-3 words) plus a definition, like a full-frame dictionary entry."
    ),
  text: z
    .string()
    .min(1)
    .max(90)
    .describe(
      "The phrase exactly as it is (mostly) spoken, so words can sync to the voice. center-large: up to ~8 words. stacked-left: 4-12 words. term: the term itself, e.g. 'Liquidity'. The title field is ignored."
    ),
  emphasis: z
    .array(z.string().min(1).max(40))
    .max(3)
    .default([])
    .describe("Words or short phrases copied from text to highlight in the accent colour with a sweeping underline, e.g. ['purchasing power']"),
  emphasisStyle: z.enum(["underline", "marker"]).default("underline").describe("underline: bar under the words. marker: highlighter behind the lower half."),
  definition: z
    .string()
    .max(160)
    .optional()
    .describe("Optional supporting line under the headline (required in spirit for the term variant): one plain-English sentence"),
  definitionAt: CueSchema.optional().describe("Spoken word on which the definition appears; defaults to just after the last headline word"),
  startAt: CueSchema.optional().describe(
    "Spoken word where the headline begins, to disambiguate when its words also occur earlier in the narration; defaults to the first spoken word"
  ),
});
export type KineticHeadlineProps = z.infer<typeof KineticHeadlineSchema>;

// ---------------------------------------------------------------------------
// Matching display words to the spoken transcript
// ---------------------------------------------------------------------------

const clean = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, "");

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

function sameWord(d: string, sp: string): boolean {
  if (!d || !sp) return false;
  if (d === sp) return true;
  return d.length >= 4 && sp.length >= 3 && (d.startsWith(sp) || sp.startsWith(d));
}

/** Greedy in-order alignment of display words to spoken words; picks the best-scoring starting point. */
export function alignWords(display: string[], spoken: SpokenWord[], notBefore: number): ({ start: number; end: number } | null)[] {
  const d = display.map(clean);
  let best: { score: number; res: ({ start: number; end: number } | null)[] } | null = null;
  for (let j = 0; j < spoken.length; j++) {
    if (spoken[j].startFrame < notBefore - 3) continue;
    let ptr = j;
    let unmatched = 0;
    let matches = 0;
    const res: ({ start: number; end: number } | null)[] = [];
    for (let k = 0; k < d.length; k++) {
      let found = -1;
      const window = 4 + 2 * unmatched;
      for (let q = ptr; q < Math.min(spoken.length, ptr + window); q++) {
        if (sameWord(d[k], clean(spoken[q].text))) {
          found = q;
          break;
        }
      }
      if (found >= 0) {
        res.push({ start: spoken[found].startFrame, end: spoken[found].endFrame });
        ptr = found + 1;
        matches++;
        unmatched = 0;
      } else {
        res.push(null);
        unmatched++;
      }
    }
    const score = matches * 10 + (res[0] ? 4 : 0) - (j - 0) * 0.001;
    if (matches > 0 && (!best || score > best.score)) best = { score, res };
  }
  return best ? best.res : display.map(() => null);
}

function resolveTimes(
  display: string[],
  s: SceneContextValue,
  startAt: number | undefined
): { start: number; end: number }[] {
  const base = startAt ?? s.voiceStart;
  const aligned = alignWords(display, s.words, base);
  const n = display.length;
  const pace = s.sec(0.42);
  const known = aligned.map((a, i) => (a ? i : -1)).filter((i) => i >= 0);
  if (known.length === 0) {
    return display.map((_, i) => ({ start: base + i * pace, end: base + i * pace + s.sec(0.35) }));
  }
  const out: { start: number; end: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = aligned[i];
    if (a) {
      out.push(a);
      continue;
    }
    const prevK = [...known].reverse().find((k) => k < i);
    const nextK = known.find((k) => k > i);
    let start: number;
    if (prevK !== undefined && nextK !== undefined) {
      const t = (i - prevK) / (nextK - prevK);
      start = aligned[prevK]!.start + (aligned[nextK]!.start - aligned[prevK]!.start) * t;
    } else if (prevK !== undefined) {
      start = aligned[prevK]!.end + (i - prevK) * s.sec(0.3);
    } else {
      start = Math.max(base, aligned[nextK!]!.start - (nextK! - i) * s.sec(0.3));
    }
    out.push({ start: Math.round(start), end: Math.round(start + s.sec(0.35)) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Typesetting (estimated metrics; verified visually)
// ---------------------------------------------------------------------------

function wordWidth(word: string, size: number, upper: boolean): number {
  let w = 0;
  for (const ch of upper ? word.toUpperCase() : word) {
    if (/[A-Z]/.test(ch)) w += 0.7;
    else if (/[0-9]/.test(ch)) w += 0.62;
    else if (/[.,'’:;!?-]/.test(ch)) w += 0.3;
    else if (/[mw]/.test(ch)) w += 0.82 * 0.72;
    else if (/[ijlft]/.test(ch)) w += 0.26;
    else w += 0.58;
  }
  return w * size * 0.99;
}

interface Token {
  idx: number[]; // display word indices
  words: string[];
  emphasised: boolean;
}

function tokenWidth(t: Token, size: number, upper: boolean): number {
  return t.words.reduce((a, w, i) => a + wordWidth(w, size, upper) * (t.emphasised ? 1.04 : 1) + (i ? size * 0.26 : 0), 0);
}

function breakLines(tokens: Token[], size: number, upper: boolean, maxW: number, lines: number): Token[][] | null {
  const widths = tokens.map((t) => tokenWidth(t, size, upper));
  const gap = size * 0.26;
  const greedy = (limit: number) => {
    const out: Token[][] = [[]];
    let cur = 0;
    tokens.forEach((t, i) => {
      const next = out[out.length - 1].length ? cur + gap + widths[i] : widths[i];
      if (out[out.length - 1].length && next > limit) {
        out.push([t]);
        cur = widths[i];
      } else {
        out[out.length - 1].push(t);
        cur = next;
      }
    });
    return out;
  };
  let lo = Math.max(...widths);
  let hi = widths.reduce((a, b) => a + b, 0) + gap * tokens.length;
  if (lo > maxW) return null;
  if (greedy(hi).length > lines) return null;
  for (let it = 0; it < 24; it++) {
    const mid = (lo + hi) / 2;
    if (greedy(mid).length <= lines) hi = mid;
    else lo = mid;
  }
  const out = greedy(hi);
  const widest = Math.max(...out.map((l) => l.reduce((a, t, i) => a + tokenWidth(t, size, upper) + (i ? gap : 0), 0)));
  if (out.length !== lines || widest > maxW) return null;
  return out;
}

interface VariantCfg {
  maxSize: number;
  minSize: number;
  minLines: number;
  maxLines: number;
  maxW: number;
  lineHeight: number;
  upper: boolean;
  align: "center" | "flex-start";
  defSize: number;
  defMaxW: number;
}
const CFG: Record<KineticHeadlineProps["variant"], VariantCfg> = {
  "center-large": { maxSize: 210, minSize: 96, minLines: 1, maxLines: 3, maxW: 1560, lineHeight: 1.02, upper: false, align: "center", defSize: 46, defMaxW: 1300 },
  "stacked-left": { maxSize: 176, minSize: 96, minLines: 2, maxLines: 3, maxW: 1400, lineHeight: 1.0, upper: false, align: "flex-start", defSize: 44, defMaxW: 1150 },
  term: { maxSize: 200, minSize: 90, minLines: 1, maxLines: 2, maxW: 1560, lineHeight: 1.0, upper: true, align: "flex-start", defSize: 50, defMaxW: 1400 },
};

function fit(tokens: Token[], cfg: VariantCfg, availH: number): { size: number; lines: Token[][] } {
  const minLines = Math.min(cfg.minLines, tokens.length);
  for (let size = cfg.maxSize; size >= cfg.minSize; size -= 4) {
    for (let L = minLines; L <= Math.min(cfg.maxLines, tokens.length); L++) {
      if (L * size * cfg.lineHeight > availH) continue;
      const lines = breakLines(tokens, size, cfg.upper, cfg.maxW, L);
      if (lines) return { size, lines };
    }
  }
  const L = Math.min(cfg.maxLines, tokens.length);
  const size = cfg.minSize;
  // Last resort: greedy lines at the minimum size (may be wide, but never crashes).
  return { size, lines: breakLines(tokens, size, cfg.upper, 1e6, L) ?? [tokens] };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const KineticHeadline: React.FC<KineticHeadlineProps> = (props) => {
  const frame = useCurrentFrame();
  const s = useScene();
  const cfg = CFG[props.variant];
  const accent = colorOf(props.accent);

  const display = props.text.split(/\s+/).filter(Boolean);
  const times = resolveTimes(display, s, cueFrame(s, props.startAt));

  // Emphasis: first occurrence of each phrase becomes one group.
  const groupOf: number[] = display.map(() => -1);
  const groups: number[][] = [];
  const cleaned = display.map(clean);
  const phrases = props.emphasis.length === 0 && props.variant === "term" ? [props.text] : props.emphasis;
  phrases.forEach((ph) => {
    const parts = ph.split(/\s+/).filter(Boolean).map(clean);
    if (!parts.length) return;
    for (let i = 0; i + parts.length <= cleaned.length; i++) {
      if (parts.every((pt, k) => cleaned[i + k] === pt && groupOf[i + k] === -1)) {
        const g = groups.length;
        const idxs = parts.map((_, k) => i + k);
        idxs.forEach((x) => (groupOf[x] = g));
        groups.push(idxs);
        return;
      }
    }
  });

  // Tokens: emphasised groups are unbreakable units
  const tokens: Token[] = [];
  for (let i = 0; i < display.length; i++) {
    if (groupOf[i] >= 0) {
      const g = groups[groupOf[i]];
      if (g[0] === i) tokens.push({ idx: g, words: g.map((x) => display[x]), emphasised: true });
    } else tokens.push({ idx: [i], words: [display[i]], emphasised: false });
  }

  const availH = props.definition ? 560 : 700;
  const { size, lines } = fit(tokens, cfg, availH);
  const upper = cfg.upper;
  const centered = cfg.align === "center";

  const lastEnd = Math.max(...times.map((t) => t.end));
  const defAt = cueFrame(s, props.definitionAt, -0.08) ?? lastEnd + s.sec(0.3);
  const defIn = ease.outExpo(p(frame, defAt, defAt + s.sec(0.75)));

  const barIn = ease.outExpo(p(frame, s.voiceStart - s.sec(0.25), s.voiceStart + s.sec(0.6)));
  const gapPx = size * 0.26;
  const ulH = Math.max(8, size * 0.05);
  const drift = Math.sin((frame / s.fps) * 0.5) * 24;

  const renderWord = (i: number, emphasised: boolean) => {
    const t = times[i];
    const r = ease.outExpo(p(frame, t.start - s.sec(0.07), t.start + s.sec(0.5)));
    return (
      <span
        key={i}
        style={{
          display: "inline-block",
          whiteSpace: "nowrap",
          fontFamily: FONT_TOKENS.display,
          fontWeight: emphasised || props.variant === "term" ? 800 : 600,
          fontSize: size,
          lineHeight: cfg.lineHeight,
          letterSpacing: "-0.02em",
          textTransform: upper ? "uppercase" : undefined,
          color: emphasised ? accent : COLOR_TOKENS.text,
          // Unspoken words stay hidden: at display sizes even a faint ghost is readable and gives the line away.
          opacity: r,
          transform: `translateY(${(1 - r) * 0.3 * size}px)`,
        }}
      >
        {display[i]}
      </span>
    );
  };

  return (
    <ArchetypeFrame kicker={props.kicker} source={props.source} accent={props.accent} fullBleed>
      {/* soft accent glow that drifts slowly behind the type */}
      <div
        style={{
          position: "absolute",
          left: centered ? "50%" : "30%",
          top: "52%",
          width: 1500,
          height: 900,
          transform: `translate(-50%, -50%) translateX(${drift}px)`,
          background: `radial-gradient(ellipse at center, ${alpha(accent, 0.1)} 0%, transparent 62%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          paddingLeft: 120,
          paddingRight: 120,
          paddingTop: 150,
          paddingBottom: props.source ? 150 : 110,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: cfg.align,
          textAlign: centered ? "center" : "left",
        }}
      >
        {props.variant === "stacked-left" && (
          <div
            style={{
              width: 150,
              height: 10,
              borderRadius: 5,
              background: accent,
              marginBottom: 40,
              transformOrigin: "left center",
              transform: `scaleX(${barIn})`,
            }}
          />
        )}

        <div style={{ display: "flex", flexDirection: "column", alignItems: cfg.align, gap: size * (cfg.lineHeight - 1) + size * 0.04 }}>
          {lines.map((line, li) => (
            <div key={li} style={{ display: "flex", flexDirection: "row", gap: gapPx, justifyContent: cfg.align, whiteSpace: "nowrap" }}>
              {line.map((tok) => {
                if (!tok.emphasised) return renderWord(tok.idx[0], false);
                const first = times[tok.idx[0]];
                const last = times[tok.idx[tok.idx.length - 1]];
                const sweepStart = first.start + s.sec(0.05);
                const sweepEnd = Math.max(last.end, first.start + s.sec(0.35)) + s.sec(0.3);
                const sweep = ease.outCubic(p(frame, sweepStart, sweepEnd));
                const marker = props.emphasisStyle === "marker";
                return (
                  <span key={tok.idx[0]} style={{ position: "relative", display: "inline-flex", gap: gapPx, whiteSpace: "nowrap" }}>
                    {marker ? (
                      <span
                        style={{
                          position: "absolute",
                          left: -size * 0.06,
                          right: -size * 0.06,
                          bottom: size * 0.17,
                          height: size * 0.4,
                          borderRadius: size * 0.06,
                          background: alpha(accent, 0.26),
                          transformOrigin: "left center",
                          transform: `scaleX(${sweep})`,
                        }}
                      />
                    ) : (
                      <span
                        style={{
                          position: "absolute",
                          left: 0,
                          right: 0,
                          bottom: -ulH * 0.2 - size * 0.02,
                          height: ulH,
                          borderRadius: ulH / 2,
                          background: accent,
                          transformOrigin: "left center",
                          transform: `scaleX(${sweep})`,
                        }}
                      />
                    )}
                    {tok.idx.map((wi) => renderWord(wi, true))}
                  </span>
                );
              })}
            </div>
          ))}
        </div>

        {props.definition && (
          <div style={{ marginTop: props.variant === "term" ? 44 : 52, display: "flex", flexDirection: "column", alignItems: cfg.align }}>
            {props.variant === "term" && (
              <div
                style={{
                  width: 120 * defIn,
                  height: 6,
                  borderRadius: 3,
                  background: alpha(accent, 0.9),
                  marginBottom: 30,
                }}
              />
            )}
            <div
              style={{
                maxWidth: cfg.defMaxW,
                fontFamily: FONT_TOKENS.body,
                fontWeight: 500,
                fontSize: cfg.defSize,
                lineHeight: 1.3,
                textWrap: "balance",
                color: alpha(COLOR_TOKENS.text, 0.82),
                opacity: defIn,
                transform: `translateY(${(1 - defIn) * 26}px)`,
              }}
            >
              {props.definition}
            </div>
          </div>
        )}
      </div>
    </ArchetypeFrame>
  );
};

registerArchetype({
  name: "KineticHeadline",
  useWhen: "A key phrase or term deserves the whole frame as animated typography (a thesis line, a punchline, or a dictionary-style definition) with no chart or diagram.",
  schema: KineticHeadlineSchema,
  component: KineticHeadline,
  examples: [
    {
      narration: "Inflation means prices rise, and your purchasing power falls.",
      props: {
        variant: "center-large",
        kicker: "Inflation",
        text: "Prices rise, purchasing power falls.",
        emphasis: ["purchasing power"],
        definition: "Each unit of money buys a little less than it did before.",
        accent: "butter",
      },
    },
    {
      narration:
        "In nineteen seventy one the United States ended gold convertibility of the dollar, and money became a pure promise.",
      props: {
        variant: "stacked-left",
        kicker: "1971",
        text: "In 1971 the US ended gold convertibility",
        emphasis: ["gold convertibility"],
        emphasisStyle: "marker",
        source: "Historical record: the Nixon shock, August 1971",
        accent: "peach",
      },
    },
    {
      narration:
        "Liquidity is how quickly an asset can be turned into cash without losing much of its value.",
      props: {
        variant: "term",
        kicker: "Key term",
        text: "Liquidity",
        definition: "How quickly an asset can be turned into cash without losing much of its value.",
        definitionAt: "how",
        accent: "mint",
      },
    },
  ],
});
