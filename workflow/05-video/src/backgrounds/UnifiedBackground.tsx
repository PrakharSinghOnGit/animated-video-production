import React from "react";
import { AbsoluteFill } from "remotion";
import { COLOR_TOKENS, type ColorToken } from "../design/tokens";
import { GridDrift } from "./GridDrift";
import { GlowBlobs } from "./GlowBlobs";
import { Vignette } from "./Vignette";
import { Grain } from "./Grain";

export interface UnifiedBackgroundProps {
  glowHue?: ColorToken | string;
  glowIntensity?: number;
  glowPosition?: "top-right" | "center" | "bottom-left" | "split";
  gridIntensity?: number;
  showGrain?: boolean;
}

export const UnifiedBackground: React.FC<UnifiedBackgroundProps> = ({
  glowHue = "accent",
  glowIntensity = 0.22,
  glowPosition = "top-right",
  gridIntensity = 0.8,
  showGrain = true,
}) => {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLOR_TOKENS.bg,
        overflow: "hidden",
      }}
    >
      {/* Layer 1: Ambient Grid Drift */}
      <GridDrift intensity={gridIntensity} />

      {/* Layer 2: Subtle Focal Glow */}
      <GlowBlobs
        hue={glowHue}
        intensity={glowIntensity}
        position={glowPosition}
      />

      {/* Layer 3: Vignette Edge Falloff */}
      <Vignette intensity={0.7} falloff={50} />

      {/* Layer 4: Micro Grain Texture */}
      {showGrain && <Grain opacity={0.04} />}
    </AbsoluteFill>
  );
};
