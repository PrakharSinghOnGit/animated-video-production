import React, { useId, useMemo } from "react";
import { resolveColorToken, lighten, darken, COLOR_TOKENS } from "../tokens";

export interface CoinProps {
  cx?: number;
  cy?: number;
  radius?: number;
  color?: string;
  spin?: number; // angle in radians or degrees (flips coin)
  tilt?: number; // tilt angle degrees
  style?: React.CSSProperties;
}

export const Coin: React.FC<CoinProps> = ({
  cx = 0,
  cy = 0,
  radius = 35,
  color = "butter",
  spin = 0,
  tilt = 0,
  style,
}) => {
  const id = useId().replace(/:/g, "_");
  const resolvedColor = resolveColorToken(color);
  const R = radius;

  // Spin creates horizontal foreshortening (cos of angle)
  const spinRad = spin > 10 || spin < -10 ? (spin * Math.PI) / 180 : spin;
  const aspectX = Math.max(0.08, Math.abs(Math.cos(spinRad)));
  const rx = R * aspectX;
  const ry = R;

  const padding = R * 1.5;
  const svgWidth = (R + padding) * 2;
  const svgHeight = (R + padding) * 2;
  const viewBox = `${cx - R - padding} ${cy - R - padding} ${svgWidth} ${svgHeight}`;

  return (
    <svg
      width={svgWidth}
      height={svgHeight}
      viewBox={viewBox}
      style={{
        position: "absolute",
        left: cx - R - padding,
        top: cy - R - padding,
        overflow: "visible",
        pointerEvents: "none",
        ...style,
      }}
    >
      <defs>
        {/* Coin face gradient */}
        <radialGradient id={`coinGrad_${id}`} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor={lighten(resolvedColor, 0.7)} />
          <stop offset="60%" stopColor={resolvedColor} />
          <stop offset="100%" stopColor={darken(resolvedColor, 0.45)} />
        </radialGradient>

        {/* Rim edge gradient */}
        <linearGradient id={`coinRim_${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={lighten(resolvedColor, 0.8)} />
          <stop offset="50%" stopColor={resolvedColor} />
          <stop offset="100%" stopColor={darken(resolvedColor, 0.5)} />
        </linearGradient>
      </defs>

      <g transform={`rotate(${tilt}, ${cx}, ${cy})`}>
        {/* 1. Outer Coin Base */}
        <ellipse
          cx={cx}
          cy={cy}
          rx={rx}
          ry={ry}
          fill={`url(#coinGrad_${id})`}
          stroke={`url(#coinRim_${id})`}
          strokeWidth={Math.max(2, R * 0.08)}
        />

        {/* 2. Inner Decorative Ring */}
        <ellipse
          cx={cx}
          cy={cy}
          rx={rx * 0.82}
          ry={ry * 0.82}
          fill="none"
          stroke={darken(resolvedColor, 0.25)}
          strokeWidth={1.5}
          opacity={0.65}
        />

        {/* 3. Central Dollar / Bullion Symbol */}
        <text
          x={cx}
          y={cy + ry * 0.3}
          textAnchor="middle"
          fill={darken(resolvedColor, 0.35)}
          fontSize={ry * 0.9}
          fontWeight="bold"
          fontFamily="Inter, sans-serif"
          transform={`scale(${aspectX}, 1)`}
          style={{ transformOrigin: `${cx}px ${cy}px` }}
        >
          $
        </text>

        {/* 4. Top Glint Reflection */}
        <ellipse
          cx={cx - rx * 0.2}
          cy={cy - ry * 0.4}
          rx={rx * 0.45}
          ry={ry * 0.2}
          fill={COLOR_TOKENS.text}
          opacity={0.38}
        />
      </g>
    </svg>
  );
};
