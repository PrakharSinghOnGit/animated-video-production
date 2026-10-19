import React, { useId } from "react";
import { resolveColorToken, alpha as toAlpha } from "../tokens";

export interface GlowProps {
  cx?: number;
  cy?: number;
  radius?: number;
  color?: string;
  alpha?: number;
  style?: React.CSSProperties;
}

export const Glow: React.FC<GlowProps> = ({
  cx = 0,
  cy = 0,
  radius = 250,
  color = "lav",
  alpha: glowAlpha = 0.25,
  style,
}) => {
  const id = useId().replace(/:/g, "_");
  const resolvedColor = resolveColorToken(color);

  return (
    <div
      style={{
        position: "absolute",
        left: cx - radius,
        top: cy - radius,
        width: radius * 2,
        height: radius * 2,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${toAlpha(resolvedColor, glowAlpha)} 0%, ${toAlpha(
          resolvedColor,
          glowAlpha * 0.4
        )} 40%, rgba(0, 0, 0, 0) 70%)`,
        pointerEvents: "none",
        ...style,
      }}
    />
  );
};
