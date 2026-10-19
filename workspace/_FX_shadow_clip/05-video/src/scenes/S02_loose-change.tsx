import React, { useId } from "react";
import { useCurrentFrame } from "remotion";
import {
  useScene,
  Camera,
  Label,
  Ring,
  Gem,
  Coin,
  Sparkle,
  Particles,
  ease,
  p,
  keys,
  pulse,
  tokens,
  lighten,
  darken,
  alpha,
} from "@wealthgap/kit";

export const meta = {
  id: "S02",
  title: "Loose Change Under Cushion",
  numbers: [],
  sfx: [
    {
      anchor: "cushion",
      occurrence: 1,
      sound: "switch",
      volume: 0.15,
      offsetMs: 0,
    },
  ],
};

const COIN_CONFIG = [
  { offset: [-118, -34], radius: 24, color: tokens.color.pastel.butter, tilt: -12 },
  { offset: [-52, 44], radius: 22, color: tokens.color.pastel.peach, tilt: 24 },
  { offset: [6, -58], radius: 25, color: tokens.color.pastel.butter, tilt: -8 },
  { offset: [66, 26], radius: 23, color: tokens.color.pastel.sky, tilt: 18 },
  { offset: [118, -22], radius: 22, color: tokens.color.pastel.butter, tilt: -20 },
  { offset: [-8, 12], radius: 26, color: tokens.color.pastel.peach, tilt: 10 },
  { offset: [160, 82], radius: 24, color: tokens.color.pastel.butter, tilt: 32 }, // peeks under cushion
];

export default function S02_LooseChange() {
  const frame = useCurrentFrame();
  const s = useScene();
  const cushionId = useId().replace(/:/g, "_");

  // -------------------------------------------------------------
  // Word Anchors & Timing
  // -------------------------------------------------------------
  const tLook = s.word("look").start; // ~f=6
  const tLoose = s.word("loose").start - s.ms(60); // ~f=29
  const tUnder = s.word("under").start - s.ms(80); // ~f=59
  const tCushion = s.word("cushion").start; // ~f=83

  // -------------------------------------------------------------
  // Camera Dive & Drift
  // Seamless continuation from S01 (starts zoom 0.85, focus [0, 0])
  // Dives onto Gem at [60, 130], scaling up to 2.95x
  // -------------------------------------------------------------
  const diveProgress = p(frame, 0, 26, ease.io);
  const zoom = keys(
    frame,
    [
      [0, 0.85, "io"],
      [26, 2.95, "io"],
      [103, 3.08, "lin"],
    ],
    "io"
  ) as number;

  const focusX = keys(
    frame,
    [
      [0, 0, "io"],
      [26, 60, "io"],
      [103, 72, "lin"],
    ],
    "io"
  ) as number;

  const focusY = keys(
    frame,
    [
      [0, 0, "io"],
      [26, 130, "io"],
      [103, 138, "lin"],
    ],
    "io"
  ) as number;

  const driftX = Math.sin(frame * 0.04) * 3;
  const driftY = Math.cos(frame * 0.035) * 2.5;

  const camFx = focusX + driftX;
  const camFy = focusY + driftY;

  // -------------------------------------------------------------
  // 1. Gem Swell & Burst
  // -------------------------------------------------------------
  const gemX = 60;
  const gemY = 130;
  const gemSwell = pulse(frame, tLook, 6, 0.4);
  const gemBurstP = p(frame, tLook + 3, tLook + 8, ease.inExpo);
  const gemSize = Math.max(0, 34 * (1 + gemSwell) * (1 - gemBurstP));

  // Gem burst shockwave ring
  const burstRingP = p(frame, tLook + 3, tLook + 22, ease.outExpo);

  // -------------------------------------------------------------
  // 2. Coins Scattering Physics & Bounces
  // -------------------------------------------------------------
  const coinStates = COIN_CONFIG.map((cfg, idx) => {
    const tSpawn = tLook + 4 + idx * 1.1;
    const progress = p(frame, tSpawn, tSpawn + 17, ease.outCubic);
    const hasSpawned = frame >= tSpawn;

    // Ground position
    const gx = gemX + cfg.offset[0] * progress;
    const gy = gemY + cfg.offset[1] * progress;

    // Parabolic arc height
    const mainArc = 85 * 4 * progress * (1 - progress);

    // Secondary bounce
    const tBounce = tSpawn + 17;
    const bounceP = p(frame, tBounce, tBounce + 10, ease.lin);
    const secondaryBounce =
      bounceP > 0 && bounceP < 1 ? 18 * Math.sin(Math.PI * bounceP) * (1 - bounceP) : 0;

    const h = mainArc + secondaryBounce;
    const cx = gx;
    const cy = gy - h;

    // Rotation & flip
    const spin = (1 - progress) * (720 + idx * 45);
    const scale = Math.min(1, progress * 4);

    // Sparkle trigger after settling
    const tSparkle = tLoose + idx * 2.8;
    const spkP = p(frame, tSparkle, tSparkle + 12, ease.lin);
    const spkSize = spkP > 0 && spkP < 1 ? cfg.radius * 1.5 * Math.sin(Math.PI * spkP) : 0;

    return {
      idx,
      gx,
      gy,
      cx,
      cy,
      h,
      spin,
      scale,
      radius: cfg.radius,
      color: cfg.color,
      tilt: cfg.tilt,
      hasSpawned,
      spkSize,
    };
  });

  // -------------------------------------------------------------
  // 3. Stitched Cushion Drop & Squash-and-Stretch
  // -------------------------------------------------------------
  const cushionTargetX = gemX + 8;
  const cushionTargetY = gemY + 6;
  const cushionW = 360;
  const cushionH = 214;
  const cushionR = 80;

  const isDropping = frame >= tUnder;
  const dropP = p(frame, tUnder, tCushion, ease.inQuad);
  const cushionYOff = -520 * (1 - dropP);

  // Impact oscillation (squash and stretch)
  let sx = 1.0;
  let sy = 1.0;
  let cushionRot = -7 * (1 - dropP);

  if (frame >= tCushion) {
    const dt = (frame - tCushion) / 30;
    const damp = Math.exp(-9 * dt) * Math.cos(22 * dt);
    sx = 1.0 + 0.16 * damp;
    sy = 1.0 - 0.24 * damp;
    cushionRot = 2.2 * damp;
  }

  // Shadow under cushion expands on approach
  const shadowAlpha = isDropping ? Math.min(0.65, dropP * 0.65) : 0;

  // Impact ripple ring
  const impactRingP = p(frame, tCushion, tCushion + 28, ease.outExpo);

  // Separate Coin #6 (peeks out) from coins 0..5 (crushed under cushion)
  const coveredCoins = coinStates.slice(0, 6);
  const peekingCoin = coinStates[6];

  return (
    <>
      <Camera scale={zoom} focus={[camFx, camFy]} origin={[960, 540]}>
        {/* Layer 2: Atmospheric Dust Particles */}
        <Particles count={28} color={tokens.color.text} opacity={0.2} speed={0.25} seed={99} />

        {/* Burst Ripple Ring */}
        {burstRingP > 0 && burstRingP < 1 && (
          <Ring
            cx={gemX}
            cy={gemY}
            radius={25 + burstRingP * 210}
            strokeWidth={4}
            color={tokens.color.pastel.butter}
            progress={1 - burstRingP}
            opacity={(1 - burstRingP) * 0.85}
          />
        )}

        {/* Crypto Gem before burst */}
        {gemSize > 0.5 && (
          <Gem
            cx={gemX}
            cy={gemY}
            radius={gemSize}
            color={tokens.color.pastel.peach}
            style={{ opacity: Math.min(1, gemSize / 20) }}
          />
        )}

        {/* Covered Coins (rendered under the cushion) */}
        {coveredCoins.map((c) => {
          if (!c.hasSpawned) return null;
          const shadowK = Math.max(0.15, 1 - 0.35 * Math.min(1, c.h / 100));
          return (
            <React.Fragment key={c.idx}>
              {/* Ground Shadow */}
              <svg
                width={c.radius * 3}
                height={c.radius * 2}
                viewBox={`${c.gx - c.radius * 1.5} ${c.gy - c.radius} ${c.radius * 3} ${c.radius * 2}`}
                style={{
                  position: "absolute",
                  left: c.gx - c.radius * 1.5,
                  top: c.gy - c.radius + 4,
                  overflow: "visible",
                  pointerEvents: "none",
                }}
              >
                <ellipse
                  cx={c.gx}
                  cy={c.gy + 4}
                  rx={c.radius * shadowK * c.scale}
                  ry={c.radius * 0.45 * shadowK * c.scale}
                  fill="black"
                  opacity={0.45 * shadowK}
                />
              </svg>

              {/* Coin Body */}
              <Coin
                cx={c.cx}
                cy={c.cy}
                radius={c.radius * c.scale}
                color={c.color}
                spin={c.spin}
                tilt={c.tilt}
              />

              {/* Sparkle */}
              {c.spkSize > 0.5 && (
                <Sparkle
                  cx={c.cx + c.radius * 0.35}
                  cy={c.cy - c.radius * 0.35}
                  size={c.spkSize}
                  color={tokens.color.text}
                />
              )}
            </React.Fragment>
          );
        })}

        {/* Peeking Coin #6 Ground Shadow & Body (rendered so it peeks out at edge) */}
        {peekingCoin && peekingCoin.hasSpawned && (
          <React.Fragment key="peeking-coin">
            <svg
              width={peekingCoin.radius * 3}
              height={peekingCoin.radius * 2}
              viewBox={`${peekingCoin.gx - peekingCoin.radius * 1.5} ${peekingCoin.gy - peekingCoin.radius} ${peekingCoin.radius * 3} ${peekingCoin.radius * 2}`}
              style={{
                position: "absolute",
                left: peekingCoin.gx - peekingCoin.radius * 1.5,
                top: peekingCoin.gy - peekingCoin.radius + 4,
                overflow: "visible",
                pointerEvents: "none",
              }}
            >
              <ellipse
                cx={peekingCoin.gx}
                cy={peekingCoin.gy + 4}
                rx={peekingCoin.radius * peekingCoin.scale}
                ry={peekingCoin.radius * 0.45 * peekingCoin.scale}
                fill="black"
                opacity={0.4}
              />
            </svg>
            <Coin
              cx={peekingCoin.cx}
              cy={peekingCoin.cy}
              radius={peekingCoin.radius * peekingCoin.scale}
              color={peekingCoin.color}
              spin={peekingCoin.spin}
              tilt={peekingCoin.tilt}
            />
            {peekingCoin.spkSize > 0.5 && (
              <Sparkle
                cx={peekingCoin.cx + peekingCoin.radius * 0.35}
                cy={peekingCoin.cy - peekingCoin.radius * 0.35}
                size={peekingCoin.spkSize}
                color={tokens.color.text}
              />
            )}
          </React.Fragment>
        )}

        {/* Impact Ripple Ring */}
        {impactRingP > 0 && impactRingP < 1 && (
          <Ring
            cx={cushionTargetX}
            cy={cushionTargetY}
            radius={40 + impactRingP * 320}
            strokeWidth={5}
            color={tokens.color.pastel.rose}
            progress={1 - impactRingP}
            opacity={(1 - impactRingP) * 0.85}
          />
        )}

        {/* Cushion Shadow on Floor */}
        {isDropping && (
          <svg
            width={cushionW * 2}
            height={cushionH * 2}
            viewBox={`${cushionTargetX - cushionW} ${cushionTargetY - cushionH} ${cushionW * 2} ${cushionH * 2}`}
            style={{
              position: "absolute",
              left: cushionTargetX - cushionW,
              top: cushionTargetY - cushionH + 60,
              overflow: "visible",
              pointerEvents: "none",
            }}
          >
            <defs>
              <filter id={`cushionShadowFilter_${cushionId}`}>
                <feGaussianBlur stdDeviation={30} />
              </filter>
            </defs>
            <ellipse
              cx={cushionTargetX}
              cy={cushionTargetY + 50}
              rx={cushionW * 0.55 * sx}
              ry={cushionH * 0.35 * sy}
              fill="black"
              opacity={shadowAlpha}
              filter={`url(#cushionShadowFilter_${cushionId})`}
            />
          </svg>
        )}

        {/* Stitched Pink Cushion Body */}
        {isDropping && (
          <svg
            width={cushionW * 1.6}
            height={cushionH * 1.6}
            viewBox={`${-cushionW * 0.8} ${-cushionH * 0.8} ${cushionW * 1.6} ${cushionH * 1.6}`}
            style={{
              position: "absolute",
              left: cushionTargetX - cushionW * 0.8,
              top: cushionTargetY + cushionYOff - cushionH * 0.8,
              overflow: "visible",
              pointerEvents: "none",
              transform: `rotate(${cushionRot}deg) scale(${sx}, ${sy})`,
              transformOrigin: "center center",
            }}
          >
            <defs>
              <linearGradient
                id={`cushionGrad_${cushionId}`}
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
              >
                <stop
                  offset="0%"
                  stopColor={lighten(tokens.color.pastel.rose, 0.4)}
                />
                <stop offset="50%" stopColor={tokens.color.pastel.rose} />
                <stop
                  offset="100%"
                  stopColor={darken(tokens.color.pastel.rose, 0.35)}
                />
              </linearGradient>

              <filter id={`cushionGlow_${cushionId}`}>
                <feDropShadow
                  dx={0}
                  dy={16}
                  stdDeviation={24}
                  floodColor={darken(tokens.color.pastel.rose, 0.5)}
                  floodOpacity={0.4}
                />
              </filter>
            </defs>

            {/* Cushion Base Rounded Rect */}
            <rect
              x={-cushionW / 2}
              y={-cushionH / 2}
              width={cushionW}
              height={cushionH}
              rx={cushionR}
              ry={cushionR}
              fill={`url(#cushionGrad_${cushionId})`}
              filter={`url(#cushionGlow_${cushionId})`}
              stroke={alpha(tokens.color.text, 0.55)}
              strokeWidth={2.5}
            />

            {/* Top Specular Pill Highlight */}
            <ellipse
              cx={-cushionW * 0.16}
              cy={-cushionH * 0.22}
              rx={cushionW * 0.28}
              ry={cushionH * 0.18}
              fill={tokens.color.text}
              opacity={0.22}
            />

            {/* Inset Stitched Seam */}
            <rect
              x={-cushionW / 2 + 22}
              y={-cushionH / 2 + 22}
              width={cushionW - 44}
              height={cushionH - 44}
              rx={cushionR - 18}
              ry={cushionR - 18}
              fill="none"
              stroke={darken(tokens.color.pastel.rose, 0.45)}
              strokeWidth={3}
              strokeDasharray="10 8"
              opacity={0.65}
            />

            {/* Center Tufting Crease Lines */}
            <line
              x1={-58}
              y1={-36}
              x2={0}
              y2={0}
              stroke={darken(tokens.color.pastel.rose, 0.5)}
              strokeWidth={4.5}
              strokeLinecap="round"
              opacity={0.25}
            />
            <line
              x1={58}
              y1={-36}
              x2={0}
              y2={0}
              stroke={darken(tokens.color.pastel.rose, 0.5)}
              strokeWidth={4.5}
              strokeLinecap="round"
              opacity={0.25}
            />
            <line
              x1={-58}
              y1={36}
              x2={0}
              y2={0}
              stroke={darken(tokens.color.pastel.rose, 0.5)}
              strokeWidth={4.5}
              strokeLinecap="round"
              opacity={0.25}
            />
            <line
              x1={58}
              y1={36}
              x2={0}
              y2={0}
              stroke={darken(tokens.color.pastel.rose, 0.5)}
              strokeWidth={4.5}
              strokeLinecap="round"
              opacity={0.25}
            />

            {/* Center Tufting Button */}
            <circle
              cx={0}
              cy={0}
              r={13}
              fill={darken(tokens.color.pastel.rose, 0.35)}
            />
            <circle
              cx={-3}
              cy={-3}
              r={4.5}
              fill={tokens.color.text}
              opacity={0.4}
            />
          </svg>
        )}
      </Camera>

      {/* Layer 3: Kinetic Typographic Label in Screen Space */}
      <Label
        text="LOOSE CHANGE"
        x={960}
        y={175}
        size={74}
        in={tLoose}
        out={tUnder}
        accent={tokens.color.pastel.butter}
        align="center"
      />
    </>
  );
}
