import React, { useId, useMemo } from "react";
import { polarToSvgPath, shapes } from "../shapes";
import { COLOR_TOKENS, PASTEL_TOKENS, resolveColorToken, alpha } from "../tokens";

export interface MorphRimConfig {
  width?: number;
  spin?: number;
  colors?: string[];
  glow?: number;
}

export interface MorphContoursConfig {
  count?: number;
  gap?: number;
  lag?: number;
  t?: number;
  alpha?: number;
}

export interface MorphGlowConfig {
  color?: string;
  blur?: number;
  alpha?: number;
}

export interface MorphShapeProps {
  cx?: number;
  cy?: number;
  radius?: number;
  shape?: number[];
  rot?: number;
  fill?: "shadow" | string | { radial: Array<[number, string]> };
  rim?: MorphRimConfig;
  contours?: MorphContoursConfig;
  glow?: MorphGlowConfig;
  className?: string;
  style?: React.CSSProperties;
}

export const MorphShape: React.FC<MorphShapeProps> = ({
  cx = 0,
  cy = 0,
  radius = 300,
  shape,
  rot = 0,
  fill = "shadow",
  rim,
  contours,
  glow,
  style,
}) => {
  const id = useId().replace(/:/g, "_");
  const baseShape = useMemo(() => shape ?? shapes.circle(), [shape]);
  const rotRad = (rot * Math.PI) / 180;

  // Main shape path
  const mainPath = useMemo(() => {
    return polarToSvgPath(baseShape, cx, cy, radius, rotRad);
  }, [baseShape, cx, cy, radius, rotRad]);

  // Inner highlight path slightly smaller
  const highlightPath = useMemo(() => {
    return polarToSvgPath(baseShape, cx, cy, radius * 0.992, rotRad);
  }, [baseShape, cx, cy, radius, rotRad]);

  // Contours (topographic echo rings)
  const contourPaths = useMemo(() => {
    if (!contours) return [];
    const count = contours.count ?? 10;
    const gap = contours.gap ?? 0.074;
    const lag = contours.lag ?? 0.115;
    const t = contours.t ?? 0;
    const contourAlpha = contours.alpha ?? 0.4;

    const paths: Array<{ d: string; opacity: number }> = [];
    for (let k = 1; k <= count; k++) {
      const scale = Math.max(0.05, 1 - gap * k);
      // If time provided, sample blob at time lag; otherwise scale baseShape
      const cShape = contours.t !== undefined
        ? shapes.blob(t, { phase: -lag * k })
        : baseShape;
      const d = polarToSvgPath(cShape, cx, cy, radius * scale, rotRad);
      const op = contourAlpha * (1 - k / (count + 1.5));
      paths.push({ d, opacity: op });
    }
    return paths;
  }, [contours, baseShape, cx, cy, radius, rotRad]);

  // Colors for rim
  const rimColors = useMemo(() => {
    if (rim?.colors && rim.colors.length > 0) {
      return rim.colors.map(resolveColorToken);
    }
    return [
      PASTEL_TOKENS.lav,
      PASTEL_TOKENS.rose,
      PASTEL_TOKENS.peach,
      PASTEL_TOKENS.butter,
      PASTEL_TOKENS.mint,
      PASTEL_TOKENS.sky,
      PASTEL_TOKENS.lav,
    ];
  }, [rim?.colors]);

  const spin = rim?.spin ?? 0;
  const rimWidth = rim?.width ?? 8;

  // Bounding box for SVG
  const padding = (glow?.blur ?? 44) * 2 + rimWidth * 2 + 100;
  const svgWidth = (radius + padding) * 2;
  const svgHeight = (radius + padding) * 2;
  const viewBox = `${cx - radius - padding} ${cy - radius - padding} ${svgWidth} ${svgHeight}`;

  return (
    <svg
      width={svgWidth}
      height={svgHeight}
      viewBox={viewBox}
      style={{
        position: "absolute",
        left: cx - radius - padding,
        top: cy - radius - padding,
        overflow: "visible",
        pointerEvents: "none",
        ...style,
      }}
    >
      <defs>
        {/* Glow Filter */}
        {glow && (
          <filter id={`glow_${id}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={glow.blur ?? 30} result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        )}

        {/* Rim Gradient rotated by spin */}
        <linearGradient
          id={`rimGrad_${id}`}
          gradientTransform={`rotate(${spin}, ${cx}, ${cy})`}
          x1="0%"
          y1="0%"
          x2="100%"
          y2="100%"
        >
          {rimColors.map((col, idx) => (
            <stop
              key={idx}
              offset={`${(idx / (rimColors.length - 1)) * 100}%`}
              stopColor={col}
            />
          ))}
        </linearGradient>

        {/* Radial Fill */}
        {fill === "shadow" && (
          <radialGradient
            id={`fillGrad_${id}`}
            cx="40%"
            cy="36%"
            r="80%"
            fx="40%"
            fy="36%"
          >
            <stop offset="0%" stopColor="#26203E" />
            <stop offset="55%" stopColor="#110F1A" />
            <stop offset="100%" stopColor="#08080B" />
          </radialGradient>
        )}

        {typeof fill === "object" && "radial" in fill && (
          <radialGradient id={`fillGrad_${id}`} cx="50%" cy="50%" r="50%">
            {fill.radial.map(([stop, col], i) => (
              <stop
                key={i}
                offset={`${stop * 100}%`}
                stopColor={resolveColorToken(col)}
              />
            ))}
          </radialGradient>
        )}
      </defs>

      {/* 1. Ambient Outer Rim Glow */}
      {glow && (
        <path
          d={mainPath}
          fill="none"
          stroke={resolveColorToken(glow.color ?? "lav")}
          strokeWidth={rimWidth * 3.5}
          opacity={glow.alpha ?? 0.4}
          filter={`url(#glow_${id})`}
        />
      )}

      {/* 2. Main Body Fill */}
      <path
        d={mainPath}
        fill={
          fill === "shadow" || (typeof fill === "object" && "radial" in fill)
            ? `url(#fillGrad_${id})`
            : resolveColorToken(fill as string)
        }
      />

      {/* 3. Topographic Echo Contours */}
      {contourPaths.map((c, i) => (
        <path
          key={i}
          d={c.d}
          fill="none"
          stroke={`url(#rimGrad_${id})`}
          strokeWidth={2}
          opacity={c.opacity}
        />
      ))}

      {/* 4. Rotating Pastel Rim Stroke */}
      {rim && (
        <path
          d={mainPath}
          fill="none"
          stroke={`url(#rimGrad_${id})`}
          strokeWidth={rimWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {/* 5. Delicate Inner Highlight Rim */}
      <path
        d={highlightPath}
        fill="none"
        stroke={COLOR_TOKENS.text}
        strokeWidth={1.8}
        opacity={0.45}
      />
    </svg>
  );
};
