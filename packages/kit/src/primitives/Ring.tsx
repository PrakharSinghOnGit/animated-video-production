import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { resolveColorToken, alpha } from "../tokens";
import { p, ease } from "../motion";

export interface RingProps {
  at: number; // Trigger frame
  cx?: number;
  cy?: number;
  maxRadius?: number;
  color?: string;
  width?: number;
  dur?: number; // duration in seconds or frames (default ~0.95s)
  style?: React.CSSProperties;
}

export const Ring: React.FC<RingProps> = ({
  at: triggerFrame,
  cx = 0,
  cy = 0,
  maxRadius = 350,
  color = "lav",
  width = 4.0,
  dur = 0.95,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const durFrames = dur < 3 ? Math.round(dur * fps) : dur;
  const progress = p(frame, triggerFrame, triggerFrame + durFrames);

  if (progress <= 0 || progress >= 1) return null;

  const currentRadius = ease.outExpo(progress) * maxRadius;
  const opacity = Math.pow(1 - progress, 1.4) * 0.85;
  const currentStroke = width * (1 - progress) + 0.6;
  const resolvedColor = resolveColorToken(color);

  return (
    <svg
      width={maxRadius * 2 + width * 4}
      height={maxRadius * 2 + width * 4}
      viewBox={`${cx - maxRadius - width * 2} ${cy - maxRadius - width * 2} ${
        (maxRadius + width * 2) * 2
      } ${(maxRadius + width * 2) * 2}`}
      style={{
        position: "absolute",
        left: cx - maxRadius - width * 2,
        top: cy - maxRadius - width * 2,
        overflow: "visible",
        pointerEvents: "none",
        ...style,
      }}
    >
      <circle
        cx={cx}
        cy={cy}
        r={currentRadius}
        fill="none"
        stroke={resolvedColor}
        strokeWidth={currentStroke}
        opacity={opacity}
      />
    </svg>
  );
};
