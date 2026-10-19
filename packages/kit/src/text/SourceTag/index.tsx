import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { type SourceTagProps } from "./schema";
import { COLOR_TOKENS, scaleFontSize } from "../../tokens";
import { EASINGS, MOTION_DURATIONS } from "../../motion";

export const SourceTag: React.FC<SourceTagProps> = ({
  text,
  color = COLOR_TOKENS.muted,
  dotColor = COLOR_TOKENS.positive,
  enterAtFrame = 0,
}) => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();

  const enterProgress = interpolate(
    frame,
    [enterAtFrame, enterAtFrame + MOTION_DURATIONS.enterSupportFrames],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASINGS.outExpo,
    }
  );

  const fontSize = scaleFontSize(30, width);

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "flex-start",
        gap: 10,
        opacity: enterProgress,
        translate: `0px ${interpolate(enterProgress, [0, 1], [15, 0])}px`,
      }}
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          backgroundColor: dotColor,
          marginTop: 6,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontSize,
          fontWeight: 600,
          color,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        SOURCE: {text}
      </span>
    </div>
  );
};
