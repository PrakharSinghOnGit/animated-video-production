import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { PASTEL_TOKENS, resolveColorToken } from "../tokens";
import { seeded } from "../motion";

export interface ParticlesProps {
  seed?: number | string;
  count?: number;
  region?: [number, number, number, number]; // [x, y, w, h]
  colors?: string[];
  drift?: [number, number]; // [driftX, driftY] px per second
  style?: React.CSSProperties;
}

export const Particles: React.FC<ParticlesProps> = ({
  seed = 42,
  count = 90,
  region = [0, 0, 1920, 1080],
  colors,
  drift = [6, -10],
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  const [rx, ry, rw, rh] = region;

  const palette = useMemo(() => {
    if (colors && colors.length > 0) return colors.map(resolveColorToken);
    return Object.values(PASTEL_TOKENS);
  }, [colors]);

  const particleData = useMemo(() => {
    const list = [];
    for (let i = 0; i < count; i++) {
      const px = seeded(`${seed}_x_${i}`) * rw;
      const py = seeded(`${seed}_y_${i}`) * rh;
      const pz = 0.25 + seeded(`${seed}_z_${i}`) * 0.75;
      const ps = 1.2 + seeded(`${seed}_s_${i}`) * 2.8;
      const colorIndex = Math.floor(seeded(`${seed}_c_${i}`) * palette.length);
      const phase = seeded(`${seed}_ph_${i}`) * Math.PI * 2;
      list.push({ px, py, pz, ps, col: palette[colorIndex], phase });
    }
    return list;
  }, [seed, count, rw, rh, palette]);

  return (
    <div
      style={{
        position: "absolute",
        left: rx,
        top: ry,
        width: rw,
        height: rh,
        overflow: "hidden",
        pointerEvents: "none",
        ...style,
      }}
    >
      {particleData.map((p, i) => {
        // Continuous wrapping drift
        const dx = (p.px + t * drift[0] * p.pz) % rw;
        const x = dx < 0 ? dx + rw : dx;

        const dy = (p.py + t * drift[1] * p.pz) % rh;
        const y = dy < 0 ? dy + rh : dy;

        // Twinkle factor
        const twinkle = 0.45 + 0.55 * Math.sin(t * 1.8 + p.phase);
        const opacity = (0.2 + 0.6 * p.pz) * twinkle;

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: p.ps * p.pz,
              height: p.ps * p.pz,
              borderRadius: "50%",
              backgroundColor: p.col,
              opacity,
              boxShadow: `0 0 ${p.ps * 2}px ${p.col}`,
              transform: "translate(-50%, -50%)",
            }}
          />
        );
      })}
    </div>
  );
};
