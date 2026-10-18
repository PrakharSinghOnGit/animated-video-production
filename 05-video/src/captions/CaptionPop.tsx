import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { createTikTokStyleCaptions } from "@remotion/captions";
import type { NormalizedCaption } from "../lib/schema";
import { COLOR_TOKENS, FONTS, scaleFontSize } from "../design/tokens";
import { EASINGS } from "../design/motion";

export interface CaptionPopProps {
  captions: NormalizedCaption[];
  combineMs?: number;
}

export const CaptionPop: React.FC<CaptionPopProps> = ({
  captions,
  combineMs = 1200,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const currentMs = (frame / fps) * 1000;

  const { pages } = useMemo(() => {
    if (!captions || captions.length === 0) {
      return { pages: [] };
    }
    return createTikTokStyleCaptions({
      captions,
      combineTokensWithinMilliseconds: combineMs,
    });
  }, [captions, combineMs]);

  const activePage = useMemo(() => {
    return pages.find((page) => {
      const pageEnd = page.startMs + page.durationMs;
      return currentMs >= page.startMs && currentMs < pageEnd;
    });
  }, [pages, currentMs]);

  if (!activePage) {
    return null;
  }

  const fontSize = scaleFontSize(54, width);

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: Math.round(height * 0.68),
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        pointerEvents: "none",
        zIndex: 50,
        padding: "0 40px",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "center",
          gap: 14,
          fontFamily: FONTS.sans,
          fontSize,
          fontWeight: 800,
          textTransform: "uppercase",
          lineHeight: 1.2,
          textAlign: "center",
          filter: "drop-shadow(0 6px 16px rgba(0,0,0,0.85))",
        }}
      >
        {activePage.tokens.map((token, idx) => {
          const isSpoken = currentMs >= token.fromMs && currentMs < token.toMs;
          const isPast = currentMs >= token.toMs;

          let color = "rgba(255, 255, 255, 0.4)";
          let scale = 1.0;

          if (isSpoken) {
            color = COLOR_TOKENS.accent;
            const tokenStartFrame = Math.round((token.fromMs / 1000) * fps);
            scale = interpolate(
              frame,
              [tokenStartFrame, tokenStartFrame + 4],
              [1.25, 1.0],
              {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: EASINGS.outExpo,
              }
            );
          } else if (isPast) {
            color = COLOR_TOKENS.text;
          }

          return (
            <span
              key={`${token.text}-${idx}`}
              style={{
                color,
                transform: `scale(${scale})`,
                display: "inline-block",
                transformOrigin: "center center",
                whiteSpace: "pre-wrap",
              }}
            >
              {token.text}
            </span>
          );
        })}
      </div>
    </div>
  );
};
