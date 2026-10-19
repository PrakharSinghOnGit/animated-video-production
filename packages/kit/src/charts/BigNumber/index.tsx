import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { type BigNumberProps } from "./schema";
import { COLOR_TOKENS, FONTS, scaleFontSize } from "../../tokens";
import { EASINGS, MOTION_DURATIONS } from "../../motion";

export const BigNumber: React.FC<BigNumberProps> = ({
  value,
  startValue = 0,
  prefix = "",
  suffix = "",
  decimals = 1,
  label,
  sublabel,
  accentColor = COLOR_TOKENS.accent,
  countUpDurationFrames = 32,
  enterAtFrame = 0,
  exitAtFrame,
  landingFrame,
}) => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();

  // Entrance timing
  const enterStart = enterAtFrame;
  const enterEnd = enterStart + MOTION_DURATIONS.enterHeroFrames;

  const enterProgress = interpolate(frame, [enterStart, enterEnd], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASINGS.outExpo,
  });

  // Exit timing (if specified)
  let exitProgress = 0;
  if (exitAtFrame !== undefined) {
    const exitEnd = exitAtFrame + MOTION_DURATIONS.exitHeroFrames;
    exitProgress = interpolate(frame, [exitAtFrame, exitEnd], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASINGS.inCubic,
    });
  }

  // Count-up calculation:
  // If landingFrame is specified, count-up lands exactly on landingFrame.
  const countStartFrame = enterStart + 4;
  const targetEndFrame = landingFrame !== undefined ? landingFrame : countStartFrame + countUpDurationFrames;
  const effectiveEnd = Math.max(countStartFrame + 10, targetEndFrame);

  const countProgress = interpolate(frame, [countStartFrame, effectiveEnd], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASINGS.outCubic,
  });

  const currentVal = startValue + (value - startValue) * countProgress;
  const formattedVal = currentVal.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  // Opacity & transform with individual CSS properties (strictly no CSS transform string strings)
  const opacity = interpolate(enterProgress - exitProgress, [0, 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const translateY = interpolate(enterProgress, [0, 1], [40, 0]) + interpolate(exitProgress, [0, 1], [0, -30]);
  const scale = interpolate(enterProgress, [0, 1], [0.94, 1.0]) * interpolate(exitProgress, [0, 1], [1.0, 0.96]);

  const numFontSize = scaleFontSize(240, width);
  const suffixFontSize = scaleFontSize(90, width);
  const labelFontSize = scaleFontSize(44, width);
  const sublabelFontSize = scaleFontSize(32, width);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        opacity,
        translate: `0px ${translateY}px`,
        scale: `${scale}`,
        width: "100%",
      }}
    >
      {/* Big Number Row */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "center",
          fontFamily: FONTS.mono,
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "-0.04em",
          lineHeight: 1,
        }}
      >
        {prefix && (
          <span
            style={{
              fontSize: numFontSize * 0.85,
              fontWeight: 800,
              color: accentColor,
              marginRight: 4,
            }}
          >
            {prefix}
          </span>
        )}
        <span
          style={{
            fontSize: numFontSize,
            fontWeight: 800,
            color: accentColor,
          }}
        >
          {formattedVal}
        </span>
        {suffix && (
          <span
            style={{
              fontSize: suffixFontSize,
              fontWeight: 700,
              color: COLOR_TOKENS.text,
              marginLeft: 16,
              letterSpacing: "-0.02em",
            }}
          >
            {suffix}
          </span>
        )}
      </div>

      {/* Semantic Label */}
      <div
        style={{
          fontSize: labelFontSize,
          fontWeight: 600,
          color: COLOR_TOKENS.text,
          marginTop: 18,
          letterSpacing: "-0.01em",
          maxWidth: "85%",
          lineHeight: 1.25,
        }}
      >
        {label}
      </div>

      {/* Optional Context Sublabel */}
      {sublabel && (
        <div
          style={{
            fontSize: sublabelFontSize,
            fontWeight: 500,
            color: COLOR_TOKENS.muted,
            marginTop: 8,
            letterSpacing: "0.02em",
          }}
        >
          {sublabel}
        </div>
      )}
    </div>
  );
};
