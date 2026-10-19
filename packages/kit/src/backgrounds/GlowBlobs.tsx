import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { COLOR_TOKENS, type ColorToken } from "../tokens";

export interface GlowBlobsProps {
  hue?: ColorToken | string;
  intensity?: number;
  position?: "top-right" | "center" | "bottom-left" | "split";
}

export const GlowBlobs: React.FC<GlowBlobsProps> = ({
  hue = "accent",
  intensity = 0.25,
  position = "top-right",
}) => {
  const frame = useCurrentFrame();

  const colorHex = (COLOR_TOKENS as any)[hue] || hue;

  // Gentle ambient breathing pulse (period of 120 frames / 4 seconds)
  const pulse = interpolate(
    Math.sin((frame / 120) * Math.PI * 2),
    [-1, 1],
    [0.85, 1.15]
  );

  const driftX = interpolate(
    Math.sin((frame / 180) * Math.PI * 2),
    [-1, 1],
    [-20, 20]
  );
  const driftY = interpolate(
    Math.cos((frame / 180) * Math.PI * 2),
    [-1, 1],
    [-15, 15]
  );

  const getBlobStyles = () => {
    switch (position) {
      case "center":
        return {
          left: `calc(50% + ${driftX}px)`,
          top: `calc(50% + ${driftY}px)`,
          transform: `translate(-50%, -50%) scale(${pulse})`,
          width: 900,
          height: 900,
        };
      case "bottom-left":
        return {
          left: `calc(10% + ${driftX}px)`,
          bottom: `calc(5% + ${driftY}px)`,
          transform: `scale(${pulse})`,
          width: 800,
          height: 800,
        };
      case "split":
        return {
          left: `calc(50% + ${driftX}px)`,
          top: `calc(40% + ${driftY}px)`,
          transform: `translate(-50%, -50%) scale(${pulse})`,
          width: 1000,
          height: 1000,
        };
      case "top-right":
      default:
        return {
          right: `calc(5% + ${driftX}px)`,
          top: `calc(10% + ${driftY}px)`,
          transform: `scale(${pulse})`,
          width: 850,
          height: 850,
        };
    }
  };

  const style = getBlobStyles();

  return (
    <AbsoluteFill style={{ pointerEvents: "none", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          borderRadius: "50%",
          filter: "blur(140px)",
          opacity: intensity,
          background: `radial-gradient(circle, ${colorHex} 0%, rgba(11, 15, 20, 0) 70%)`,
          pointerEvents: "none",
          ...style,
        }}
      />
    </AbsoluteFill>
  );
};
