import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { COLOR_TOKENS } from "../design/tokens";

export interface GridDriftProps {
  gridSize?: number;
  intensity?: number;
  color?: string;
  speedX?: number;
  speedY?: number;
}

export const GridDrift: React.FC<GridDriftProps> = ({
  gridSize = 64,
  intensity = 1.0,
  color = COLOR_TOKENS.grid,
  speedX = 0.2,
  speedY = 0.4,
}) => {
  const frame = useCurrentFrame();

  const offsetX = (frame * speedX) % gridSize;
  const offsetY = (frame * speedY) % gridSize;

  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      <svg
        width="100%"
        height="100%"
        style={{
          opacity: intensity,
        }}
      >
        <defs>
          <pattern
            id="grid-pattern"
            width={gridSize}
            height={gridSize}
            patternUnits="userSpaceOnUse"
            patternTransform={`translate(${offsetX}, ${offsetY})`}
          >
            <path
              d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`}
              fill="none"
              stroke={color}
              strokeWidth="1"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid-pattern)" />
      </svg>
    </AbsoluteFill>
  );
};
