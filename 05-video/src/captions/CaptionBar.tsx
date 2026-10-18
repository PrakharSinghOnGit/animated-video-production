import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { createTikTokStyleCaptions } from "@remotion/captions";
import type { NormalizedCaption } from "../lib/schema";
import { COLOR_TOKENS, FONTS, scaleFontSize } from "../design/tokens";
import { getSafeBounds } from "../design/layout";

export interface CaptionBarProps {
  captions: NormalizedCaption[];
  combineMs?: number;
  showBackdrop?: boolean;
}

export const CaptionBar: React.FC<CaptionBarProps> = ({
  captions,
  combineMs = 1800,
  showBackdrop = true,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const currentMs = (frame / fps) * 1000;

  // Memoize TikTok style chunked caption pages
  const { pages } = useMemo(() => {
    if (!captions || captions.length === 0) {
      return { pages: [] };
    }
    return createTikTokStyleCaptions({
      captions,
      combineTokensWithinMilliseconds: combineMs,
    });
  }, [captions, combineMs]);

  // Find the currently active page
  const activePage = useMemo(() => {
    return pages.find((page) => {
      const pageEnd = page.startMs + page.durationMs;
      return currentMs >= page.startMs && currentMs < pageEnd;
    });
  }, [pages, currentMs]);

  if (!activePage) {
    return null;
  }

  const safe = getSafeBounds(width, height);
  const fontSize = scaleFontSize(32, width);

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: Math.round(36 * (height / 1080)),
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        pointerEvents: "none",
        zIndex: 50,
      }}
    >
      <div
        style={{
          display: "inline-flex",
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "center",
          gap: 8,
          maxWidth: Math.round(safe.contentWidth * 0.75),
          padding: showBackdrop ? "12px 28px" : 0,
          backgroundColor: showBackdrop ? "rgba(11, 15, 20, 0.82)" : "transparent",
          backdropFilter: showBackdrop ? "blur(12px)" : "none",
          border: showBackdrop ? `1px solid rgba(255, 255, 255, 0.1)` : "none",
          borderRadius: 999,
          boxShadow: showBackdrop ? "0 8px 32px rgba(0, 0, 0, 0.45)" : "none",
          fontFamily: FONTS.sans,
          fontSize,
          fontWeight: 600,
          lineHeight: 1.25,
          letterSpacing: "-0.01em",
          textAlign: "center",
        }}
      >
        {activePage.tokens.map((token, idx) => {
          const isSpoken = currentMs >= token.fromMs && currentMs < token.toMs;
          const isPast = currentMs >= token.toMs;

          let color: string = COLOR_TOKENS.muted; // Default upcoming word
          let fontWeight = 600;

          if (isSpoken) {
            color = COLOR_TOKENS.accent; // Spoken word highlighted in Gold
            fontWeight = 700;
          } else if (isPast) {
            color = COLOR_TOKENS.text; // Spoken past word in crisp white
          }

          return (
            <span
              key={`${token.text}-${idx}`}
              style={{
                color,
                fontWeight,
                transition: "color 0.1s ease",
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
