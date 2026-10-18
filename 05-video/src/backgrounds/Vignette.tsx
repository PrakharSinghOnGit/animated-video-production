import React from "react";
import { AbsoluteFill } from "remotion";
import { COLOR_TOKENS } from "../design/tokens";

export interface VignetteProps {
  intensity?: number;
  falloff?: number; // percentage where darkening starts
}

export const Vignette: React.FC<VignetteProps> = ({
  intensity = 0.65,
  falloff = 55,
}) => {
  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        background: `radial-gradient(ellipse at center, rgba(11, 15, 20, 0) ${falloff}%, ${COLOR_TOKENS.bg} 100%)`,
        opacity: intensity,
      }}
    />
  );
};
