import React, { useId, useMemo } from "react";
import { resolveColorToken, lighten, darken } from "../tokens";

export interface GemProps {
  cx?: number;
  cy?: number;
  radius?: number;
  color?: string;
  rot?: number; // degrees
  style?: React.CSSProperties;
}

export const Gem: React.FC<GemProps> = ({
  cx = 0,
  cy = 0,
  radius = 50,
  color = "peach",
  rot = 0,
  style,
}) => {
  const id = useId().replace(/:/g, "_");
  const resolvedColor = resolveColorToken(color);
  const R = radius;

  // 6 vertices of hexagon at 30, 90, 150, 210, 270, 330 deg
  const vertices = useMemo(() => {
    const list: Array<[number, number]> = [];
    for (let k = 0; k < 6; k++) {
      const ang = ((30 + 60 * k) * Math.PI) / 180;
      list.push([cx + R * Math.cos(ang), cy + R * Math.sin(ang)]);
    }
    return list;
  }, [cx, cy, R]);

  const facetShades = [0.45, 0.1, -0.25, -0.05, 0.3, 0.6];
  const facetColors = useMemo(() => {
    return facetShades.map((shade) =>
      shade > 0 ? lighten(resolvedColor, shade) : darken(resolvedColor, -shade)
    );
  }, [resolvedColor]);

  const hexOutline = vertices.map(([x, y]) => `${x},${y}`).join(" ");

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
        <filter id={`gemGlow_${id}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={R * 0.45} result="blur" />
        </filter>
      </defs>

      <g transform={`rotate(${rot}, ${cx}, ${cy})`}>
        {/* 1. Ambient Glow */}
        <polygon
          points={hexOutline}
          fill={resolvedColor}
          opacity={0.4}
          filter={`url(#gemGlow_${id})`}
        />

        {/* 2. 6 Faceted Triangles */}
        {vertices.map(([vx, vy], k) => {
          const nextV = vertices[(k + 1) % 6];
          const pathD = `M ${cx} ${cy} L ${vx} ${vy} L ${nextV[0]} ${nextV[1]} Z`;
          return <path key={k} d={pathD} fill={facetColors[k]} />;
        })}

        {/* 3. Crisp Facet Edge Wireframe & Rim */}
        <polygon
          points={hexOutline}
          fill="none"
          stroke={lighten(resolvedColor, 0.8)}
          strokeWidth={Math.max(1.8, R * 0.06)}
          opacity={0.9}
        />
      </g>
    </svg>
  );
};
