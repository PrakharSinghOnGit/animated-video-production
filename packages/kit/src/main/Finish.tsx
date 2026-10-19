import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

export interface FinishProps {
  fadeFrames?: number;
}

export const Finish: React.FC<FinishProps> = ({ fadeFrames = 15 }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const fadeStart = Math.max(0, durationInFrames - fadeFrames);
  const opacity = interpolate(frame, [fadeStart, durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  if (opacity <= 0) return null;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#101010",
        opacity,
        pointerEvents: "none",
        zIndex: 9999,
      }}
    />
  );
};
