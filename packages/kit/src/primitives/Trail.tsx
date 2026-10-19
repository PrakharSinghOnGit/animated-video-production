import React from "react";
import { resolveColorToken, alpha as toAlpha } from "../tokens";

export interface TrailProps {
  points: ([number, number] | { x: number; y: number })[];
  width?: number;
  color?: string;
  fade?: boolean | number;
  glow?: boolean | number;
  style?: React.CSSProperties;
}

export const Trail: React.FC<TrailProps> = ({
  points,
  width = 6,
  color = "sky",
  fade = true,
  glow = false,
  style,
}) => {
  if (!points || points.length < 2) {
    return null;
  }

  const resolvedColor = resolveColorToken(color);
  const pts: [number, number][] = points.map((p) =>
    Array.isArray(p) ? p : [p.x, p.y]
  );

  const n = pts.length - 1;
  const fadeAmount = typeof fade === "number" ? fade : fade ? 1 : 0;
  const glowRadius = typeof glow === "number" ? glow : glow ? 8 : 0;

  return (
    <svg
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: "100%",
        height: "100%",
        overflow: "visible",
        pointerEvents: "none",
        filter:
          glowRadius > 0
            ? `drop-shadow(0 0 ${glowRadius}px ${toAlpha(resolvedColor, 0.6)})`
            : undefined,
        ...style,
      }}
    >
      {pts.slice(0, -1).map((p0, i) => {
        const p1 = pts[i + 1];
        const progress = (i + 1) / n; // 0 (tail) -> 1 (head)
        
        // When fade is 1, tail alpha is 0.05, head alpha is 1
        const tailAlpha = Math.max(0.02, 1 - fadeAmount);
        const segAlpha = tailAlpha + (1 - tailAlpha) * Math.pow(progress, 1.2);
        const segWidth = Math.max(1, width * (fadeAmount > 0 ? 0.3 + 0.7 * progress : 1));

        return (
          <line
            key={i}
            x1={p0[0]}
            y1={p0[1]}
            x2={p1[0]}
            y2={p1[1]}
            stroke={toAlpha(resolvedColor, segAlpha)}
            strokeWidth={segWidth}
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
};
