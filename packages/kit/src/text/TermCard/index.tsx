import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { Underline } from "@remotion/rough-notation";
import { type TermCardProps } from "./schema";
import { COLOR_TOKENS, FONTS, scaleFontSize, RADII_TOKENS } from "../../tokens";
import { EASINGS, MOTION_DURATIONS } from "../../motion";

export const TermCard: React.FC<TermCardProps> = ({
  term,
  definition,
  category = "FINANCIAL CONCEPT",
  highlightWord,
  accentColor = COLOR_TOKENS.accent,
  enterAtFrame = 0,
  exitAtFrame,
}) => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();

  const containerEnter = interpolate(
    frame,
    [enterAtFrame, enterAtFrame + MOTION_DURATIONS.enterSupportFrames],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASINGS.outExpo,
    }
  );

  let exitProgress = 0;
  if (exitAtFrame !== undefined) {
    exitProgress = interpolate(
      frame,
      [exitAtFrame, exitAtFrame + MOTION_DURATIONS.exitSupportFrames],
      [0, 1],
      {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: EASINGS.inCubic,
      }
    );
  }

  const opacity = interpolate(containerEnter - exitProgress, [0, 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const translateY = interpolate(containerEnter, [0, 1], [30, 0]) + interpolate(exitProgress, [0, 1], [0, -20]);

  // Rough notation draws smoothly after card enters
  const notationProgress = interpolate(
    frame,
    [enterAtFrame + 10, enterAtFrame + 28],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASINGS.outExpo,
    }
  );

  const termSize = scaleFontSize(72, width);
  const defSize = scaleFontSize(40, width);
  const categorySize = scaleFontSize(24, width);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        maxWidth: 1100,
        margin: "0 auto",
        backgroundColor: COLOR_TOKENS.surface,
        border: `1px solid ${COLOR_TOKENS.surfaceBorder}`,
        borderRadius: RADII_TOKENS.xl,
        padding: "44px 56px",
        opacity,
        translate: `0px ${translateY}px`,
        boxShadow: "0 12px 36px rgba(0, 0, 0, 0.5)",
      }}
    >
      {/* Category Pill */}
      <div
        style={{
          display: "inline-flex",
          alignSelf: "flex-start",
          padding: "6px 14px",
          backgroundColor: COLOR_TOKENS.surface2,
          borderRadius: RADII_TOKENS.sm,
          fontSize: categorySize,
          fontFamily: FONTS.mono,
          fontWeight: 700,
          color: accentColor,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          marginBottom: 16,
        }}
      >
        {category}
      </div>

      {/* Term */}
      <div
        style={{
          fontSize: termSize,
          fontWeight: 800,
          color: COLOR_TOKENS.text,
          letterSpacing: "-0.02em",
          lineHeight: 1.15,
          marginBottom: 20,
        }}
      >
        {term}
      </div>

      {/* Definition with optional rough-notation underline */}
      <div
        style={{
          fontSize: defSize,
          fontWeight: 400,
          color: COLOR_TOKENS.muted,
          lineHeight: 1.45,
        }}
      >
        {highlightWord && definition.includes(highlightWord) ? (
          <>
            {definition.split(highlightWord).map((part, i, arr) => (
              <React.Fragment key={i}>
                {part}
                {i < arr.length - 1 && (
                  <Underline
                    progress={notationProgress}
                    color={accentColor}
                    strokeWidth={3}
                    iterations={2}
                  >
                    <span style={{ color: COLOR_TOKENS.text, fontWeight: 600 }}>
                      {highlightWord}
                    </span>
                  </Underline>
                )}
              </React.Fragment>
            ))}
          </>
        ) : (
          definition
        )}
      </div>
    </div>
  );
};
