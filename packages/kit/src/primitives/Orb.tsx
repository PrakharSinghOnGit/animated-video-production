import React, { useId, useMemo } from "react";
import { polarToSvgPath, shapes } from "../shapes";
import { resolveColorToken, lighten, darken, alpha, COLOR_TOKENS } from "../tokens";

export interface OrbProps {
  cx?: number;
  cy?: number;
  radius?: number;
  color?: string;
  shape?: number[];
  spin?: number; // radians or degrees for orbit ring tilt
  ring?: boolean; // whether to draw planetary orbit ring and satellite bead
  style?: React.CSSProperties;
}

export const Orb: React.FC<OrbProps> = ({
  cx = 0,
  cy = 0,
  radius = 60,
  color = "mint",
  shape,
  spin = 0,
  ring = true,
  style,
}) => {
  const id = useId().replace(/:/g, "_");
  const resolvedColor = resolveColorToken(color);
  const baseShape = useMemo(() => shape ?? shapes.circle(), [shape]);

  const spinDeg = spin < 10 && spin > -10 ? (spin * 180) / Math.PI : spin;

  const R = radius;
  const padding = R * 1.8;
  const svgWidth = (R + padding) * 2;
  const svgHeight = (R + padding) * 2;
  const viewBox = `${cx - R - padding} ${cy - R - padding} ${svgWidth} ${svgHeight}`;

  const orbPath = useMemo(() => {
    return polarToSvgPath(baseShape, cx, cy, R);
  }, [baseShape, cx, cy, R]);

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
        {/* Glow blur filter */}
        <filter id={`orbGlow_${id}`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation={R * 0.45} result="blur" />
        </filter>

        {/* 3D Sphere Radial Gradient */}
        <radialGradient
          id={`sphereGrad_${id}`}
          cx="35%"
          cy="32%"
          r="80%"
          fx="35%"
          fy="32%"
        >
          <stop offset="0%" stopColor={lighten(resolvedColor, 0.65)} />
          <stop offset="50%" stopColor={resolvedColor} />
          <stop offset="100%" stopColor={darken(resolvedColor, 0.45)} />
        </radialGradient>
      </defs>

      {/* 1. Outer Ambient Aura */}
      <path
        d={orbPath}
        fill={resolvedColor}
        opacity={0.45}
        filter={`url(#orbGlow_${id})`}
      />

      {/* 2. 3D Shaded Body */}
      <path d={orbPath} fill={`url(#sphereGrad_${id})`} />

      {/* 3. Specular Reflection Highlight */}
      <ellipse
        cx={cx - 0.28 * R}
        cy={cy - 0.35 * R}
        rx={0.28 * R}
        ry={0.16 * R}
        fill={COLOR_TOKENS.text}
        opacity={0.45}
        transform={`rotate(-25, ${cx - 0.28 * R}, ${cy - 0.35 * R})`}
      />

      {/* 4. Orbit Ring & Satellite Bead */}
      {ring && (
        <g transform={`rotate(${spinDeg}, ${cx}, ${cy})`}>
          {/* Orbit Ellipse */}
          <ellipse
            cx={cx}
            cy={cy}
            rx={1.62 * R}
            ry={0.52 * R}
            fill="none"
            stroke={resolvedColor}
            strokeWidth={2}
            opacity={0.35}
          />
          {/* Orbiting Satellite Moon */}
          <circle
            cx={cx + 1.62 * R}
            cy={cy}
            r={R * 0.08}
            fill={lighten(resolvedColor, 0.5)}
            opacity={0.95}
          />
        </g>
      )}
    </svg>
  );
};
