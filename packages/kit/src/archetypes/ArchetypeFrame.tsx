import React from "react";
import { AbsoluteFill } from "remotion";
import { z } from "zod";
import { COLOR_TOKENS, FONT_TOKENS, PASTEL_TOKENS, alpha, resolveColorToken } from "../tokens";
import { useLifecycle } from "./cues";

/**
 * Common frame every archetype renders inside: kicker + title (top-left), a body
 * region that fills the rest of the 1920x1080 frame, and a source line (bottom-left).
 * It owns enter/exit and the slow camera push, so archetypes only animate content.
 */

export const ColorNameSchema = z
  .enum(["lav", "mint", "peach", "sky", "butter", "rose", "positive", "negative", "text", "muted"])
  .describe("Design token name; raw hex is not allowed");
export type ColorName = z.infer<typeof ColorNameSchema>;

export const FrameTextSchema = z.object({
  kicker: z.string().max(40).optional().describe("Small uppercase label above the title, e.g. 'THE BOND MARKET'"),
  title: z.string().max(70).optional().describe("Headline, max ~8 words"),
  source: z.string().max(120).optional().describe("Citation for any number on screen, e.g. 'BIS Triennial Survey, 2025'"),
  accent: ColorNameSchema.default("butter"),
});
export type FrameText = z.input<typeof FrameTextSchema>;

export const FRAME = {
  width: 1920,
  height: 1080,
  marginX: 120,
  top: 96,
  bottom: 88,
  /** Top of the body region when a title is shown. */
  bodyTopWithTitle: 280,
} as const;

export function colorOf(name: ColorName | string | undefined, fallback: ColorName = "butter"): string {
  return resolveColorToken(name ?? fallback);
}

export const ArchetypeFrame: React.FC<FrameText & { children: React.ReactNode; fullBleed?: boolean }> = ({
  kicker,
  title,
  source,
  accent = "butter",
  fullBleed = false,
  children,
}) => {
  const { enter, exit, push, visible } = useLifecycle();
  const accentColor = colorOf(accent);
  const hasHeader = Boolean(kicker || title);
  const bodyTop = fullBleed || !hasHeader ? FRAME.top : FRAME.bodyTopWithTitle;

  return (
    <AbsoluteFill style={{ opacity: visible }}>
      <AbsoluteFill style={{ transform: `scale(${push})`, transformOrigin: "50% 55%" }}>
        <div
          style={{
            position: "absolute",
            left: fullBleed ? 0 : FRAME.marginX,
            right: fullBleed ? 0 : FRAME.marginX,
            top: fullBleed ? 0 : bodyTop,
            bottom: fullBleed ? 0 : FRAME.bottom + (source ? 40 : 0),
          }}
        >
          {children}
        </div>
      </AbsoluteFill>

      {hasHeader && (
        <div
          style={{
            position: "absolute",
            left: FRAME.marginX,
            top: FRAME.top,
            maxWidth: 1300,
            transform: `translateY(${(1 - enter) * 24 - exit * 12}px)`,
          }}
        >
          {kicker && (
            <div
              style={{
                fontFamily: FONT_TOKENS.mono,
                fontSize: 24,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: accentColor,
                marginBottom: 14,
              }}
            >
              {kicker}
            </div>
          )}
          {title && (
            <div
              style={{
                fontFamily: FONT_TOKENS.display,
                fontWeight: FONT_TOKENS.weights.bold,
                fontSize: 68,
                lineHeight: 1.08,
                letterSpacing: "-0.02em",
                color: COLOR_TOKENS.text,
              }}
            >
              {title}
            </div>
          )}
        </div>
      )}

      {source && (
        <div
          style={{
            position: "absolute",
            left: FRAME.marginX,
            bottom: FRAME.bottom - 40,
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontFamily: FONT_TOKENS.mono,
            fontSize: 22,
            color: COLOR_TOKENS.muted,
            opacity: enter,
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: 4, background: alpha(PASTEL_TOKENS.mint, 0.9) }} />
          Source: {source}
        </div>
      )}
    </AbsoluteFill>
  );
};
