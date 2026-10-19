import React, { useId, useMemo } from "react";
import { COLOR_TOKENS, PASTEL_TOKENS, resolveColorToken, alpha } from "../tokens";

export interface PanelProps {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  radius?: number;
  color?: string; // background surface color
  rimColors?: string[];
  stitch?: boolean; // dashed stitched seam
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

export const Panel: React.FC<PanelProps> = ({
  x = 0,
  y = 0,
  w = 600,
  h = 400,
  radius = 24,
  color = COLOR_TOKENS.surface,
  rimColors,
  stitch = false,
  children,
  style,
}) => {
  const id = useId().replace(/:/g, "_");
  const resolvedColor = resolveColorToken(color);

  const resolvedRim = useMemo(() => {
    if (rimColors && rimColors.length > 0) return rimColors.map(resolveColorToken);
    return [PASTEL_TOKENS.lav, PASTEL_TOKENS.sky];
  }, [rimColors]);

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        height: h,
        borderRadius: radius,
        backgroundColor: resolvedColor,
        boxShadow: "0 24px 64px rgba(0, 0, 0, 0.6), 0 4px 16px rgba(0, 0, 0, 0.4)",
        overflow: "hidden",
        pointerEvents: "none",
        ...style,
      }}
    >
      <svg
        width="100%"
        height="100%"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      >
        <defs>
          <linearGradient id={`panelRim_${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
            {resolvedRim.map((col, idx) => (
              <stop
                key={idx}
                offset={`${(idx / (resolvedRim.length - 1)) * 100}%`}
                stopColor={col}
              />
            ))}
          </linearGradient>
        </defs>

        {/* Outer Rim Light */}
        <rect
          x={1}
          y={1}
          width={w - 2}
          height={h - 2}
          rx={radius}
          ry={radius}
          fill="none"
          stroke={`url(#panelRim_${id})`}
          strokeWidth={1.8}
          opacity={0.5}
        />

        {/* Optional Stitched Seam */}
        {stitch && (
          <rect
            x={10}
            y={10}
            width={w - 20}
            height={h - 20}
            rx={Math.max(4, radius - 10)}
            ry={Math.max(4, radius - 10)}
            fill="none"
            stroke={alpha(COLOR_TOKENS.text, 0.18)}
            strokeWidth={1.5}
            strokeDasharray="6 6"
          />
        )}
      </svg>

      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          zIndex: 1,
        }}
      >
        {children}
      </div>
    </div>
  );
};
