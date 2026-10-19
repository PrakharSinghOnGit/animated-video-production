import React, { useId } from "react";
import { resolveColorToken, COLOR_TOKENS } from "../tokens";

export interface SparkleProps {
  cx?: number;
  cy?: number;
  size?: number; // overall radius of the 4-point flare
  color?: string;
  rot?: number; // rotation degrees
  style?: React.CSSProperties;
}

export const Sparkle: React.FC<SparkleProps> = ({
  cx = 0,
  cy = 0,
  size = 28,
  color = "butter",
  rot = 0,
  style,
}) => {
  const id = useId().replace(/:/g, "_");
  const resolvedColor = resolveColorToken(color);
  const s = size;

  if (s <= 0.5) return null;

  // 4-point diamond star path
  const w = s * 0.15; // beam thickness
  const starPath = `M ${cx} ${cy - s} Q ${cx} ${cy} ${cx + s} ${cy} Q ${cx} ${cy} ${cx} ${
    cy + s
  } Q ${cx} ${cy} ${cx - s} ${cy} Q ${cx} ${cy} ${cx} ${cy - s} Z`;

  return (
    <svg
      width={s * 3}
      height={s * 3}
      viewBox={`${cx - s * 1.5} ${cy - s * 1.5} ${s * 3} ${s * 3}`}
      style={{
        position: "absolute",
        left: cx - s * 1.5,
        top: cy - s * 1.5,
        overflow: "visible",
        pointerEvents: "none",
        ...style,
      }}
    >
      <defs>
        <filter id={`spkGlow_${id}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={s * 0.25} result="blur" />
        </filter>
      </defs>

      <g transform={`rotate(${rot}, ${cx}, ${cy})`}>
        {/* Flare Aura */}
        <path
          d={starPath}
          fill={resolvedColor}
          opacity={0.6}
          filter={`url(#spkGlow_${id})`}
        />

        {/* Sharp Center Flare */}
        <path d={starPath} fill={resolvedColor} opacity={0.95} />

        {/* Center Bright Core */}
        <circle cx={cx} cy={cy} r={s * 0.2} fill={COLOR_TOKENS.text} opacity={0.95} />
      </g>
    </svg>
  );
};
