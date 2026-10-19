import React from "react";
import { useCurrentFrame } from "remotion";
import {
  useScene,
  Camera,
  MorphShape,
  shapes,
  Label,
  Ring,
  Orb,
  Gem,
  Particles,
  ease,
  p,
  keys,
  pulse,
  tokens,
} from "@wealthgap/kit";

export const meta = {
  id: "S01",
  title: "Giant Shadow Market",
  numbers: [],
  sfx: [
    {
      anchor: "bigger",
      occurrence: 1,
      sound: "whoosh",
      volume: 0.2,
      offsetMs: -80,
    },
  ],
};

export default function S01_GiantShadow() {
  const frame = useCurrentFrame();
  const s = useScene();

  // -------------------------------------------------------------
  // Timeline Constants (Anchored to spoken words with lead)
  // -------------------------------------------------------------
  const tShadow = s.word("shadow").start - s.sec(0.1);
  const tBigger1 = s.word("bigger", 1).start;
  const tStock = s.word("stock").start - s.sec(0.17);
  const tBigger2 = s.word("bigger", 2).start;
  const tBond = s.word("bond").start - s.sec(0.19);
  const tEntire = s.word("entire").start;
  const tCrypto = s.word("crypto").start - s.sec(0.22);

  // -------------------------------------------------------------
  // Camera & Coordinate Rig
  // -------------------------------------------------------------
  // Macro pull-back from 2.3x down to 1.0x by 3.2s, settling to 0.85x
  const zoom = keys(
    frame,
    [
      [0, 2.3, "outExpo"],
      [s.sec(3.2), 1.0, "outCubic"],
      [s.sec(8.5), 0.85, "io"],
    ],
    "outExpo"
  ) as number;

  // Macro focus starts tight on top-left rim (-160, -140), settling to center (0, 0)
  const focusX = keys(
    frame,
    [
      [0, -160, "outExpo"],
      [s.sec(3.2), 0, "outCubic"],
    ],
    "outExpo"
  ) as number;

  const focusY = keys(
    frame,
    [
      [0, -140, "outExpo"],
      [s.sec(3.2), 0, "outCubic"],
    ],
    "outExpo"
  ) as number;

  // Subtle ambient camera drift
  const driftX = Math.sin(frame * 0.03) * 6;
  const driftY = Math.cos(frame * 0.025) * 5;

  const camFx = focusX + driftX;
  const camFy = focusY + driftY;

  // -------------------------------------------------------------
  // Central Shadow Mass & Swell Impulses
  // -------------------------------------------------------------
  const swell1 = pulse(frame, tBigger1, s.sec(0.7), 0.06);
  const swell2 = pulse(frame, tBigger2, s.sec(0.9), 0.11);
  const swell3 = p(frame, tEntire, tEntire + s.sec(1.2), ease.outExpo) * 0.14;

  const baseRadius = (350 + swell3 * 180) * (1 + swell1 + swell2);
  const blobShape = shapes.blob(frame / 25);

  // -------------------------------------------------------------
  // Entities: Stock Market (Mint Orb), Bond Market (Lavender Squircle), Crypto (Peach Gem)
  // -------------------------------------------------------------
  // 1. Stock Market Orb (left rim spawn)
  const stockSpawnP = p(frame, tStock, tStock + s.sec(0.7), ease.outExpo);
  const stockX = keys(
    frame,
    [
      [tStock, -baseRadius * 0.85, "outExpo"],
      [tStock + s.sec(0.7), -480, "outBack"],
      [tBigger2, -480, "io"],
      [tBigger2 + s.sec(0.6), -560, "outExpo"],
    ],
    "outExpo"
  ) as number;
  const stockY = -60 + Math.sin(frame * 0.04) * 8;
  const stockRadius = 74 * stockSpawnP;

  // 2. Bond Market Squircle (right rim spawn)
  const bondSpawnP = p(frame, tBond, tBond + s.sec(0.75), ease.outExpo);
  const bondX = keys(
    frame,
    [
      [tBond, baseRadius * 0.85, "outExpo"],
      [tBond + s.sec(0.75), 500, "outBack"],
      [tEntire, 500, "io"],
      [tEntire + s.sec(0.6), 570, "outExpo"],
    ],
    "outExpo"
  ) as number;
  const bondY = 80 + Math.cos(frame * 0.035) * 10;
  const bondRadius = 66 * bondSpawnP;
  const bondMorph = (Math.sin(frame * 0.06) + 1) / 2;

  // 3. Crypto Gem (tiny peach gem low inside the mass)
  const cryptoSpawnP = p(frame, tCrypto, tCrypto + s.sec(0.5), ease.outBack);
  const cryptoX = 60 + Math.sin(frame * 0.03) * 5;
  const cryptoY = 130 + Math.cos(frame * 0.03) * 5;
  const gemSize = 34 * cryptoSpawnP;

  // Screen space projection for labels
  const stockScreenX = 960 + (stockX - camFx) * zoom;
  const stockScreenY = 540 + (stockY - camFy) * zoom;

  const bondScreenX = 960 + (bondX - camFx) * zoom;
  const bondScreenY = 540 + (bondY - camFy) * zoom;

  const cryptoScreenX = 960 + (cryptoX - camFx) * zoom;
  const cryptoScreenY = 540 + (cryptoY - camFy) * zoom;

  // -------------------------------------------------------------
  // Ripple Rings (Triggered on swells and births)
  // -------------------------------------------------------------
  const rBigger1 = p(frame, tBigger1, tBigger1 + s.sec(1.1), ease.outExpo);
  const rBigger2 = p(frame, tBigger2, tBigger2 + s.sec(1.3), ease.outExpo);
  const rStockBirth = p(frame, tStock, tStock + s.sec(0.8), ease.outExpo);
  const rCryptoBirth = p(frame, tCrypto, tCrypto + s.sec(0.7), ease.outExpo);

  return (
    <>
      <Camera scale={zoom} focus={[camFx, camFy]} origin={[960, 540]}>
        {/* Layer 2: Midground Atmospheric Texture */}
        <Particles count={35} color={tokens.color.text} opacity={0.25} speed={0.35} seed={42} />

        {/* Ripple Rings in World Space */}
        {rBigger1 > 0 && rBigger1 < 1 && (
          <Ring
            cx={0}
            cy={0}
            radius={baseRadius * (1 + rBigger1 * 1.2)}
            strokeWidth={3}
            color={tokens.color.pastel.lav}
            progress={1 - rBigger1}
            opacity={(1 - rBigger1) * 0.7}
          />
        )}
        {rBigger2 > 0 && rBigger2 < 1 && (
          <Ring
            cx={0}
            cy={0}
            radius={baseRadius * (1 + rBigger2 * 1.4)}
            strokeWidth={4}
            color={tokens.color.pastel.rose}
            progress={1 - rBigger2}
            opacity={(1 - rBigger2) * 0.8}
          />
        )}
        {rStockBirth > 0 && rStockBirth < 1 && (
          <Ring
            cx={stockX}
            cy={stockY}
            radius={stockRadius * (1 + rStockBirth * 1.8)}
            strokeWidth={2}
            color={tokens.color.pastel.mint}
            progress={1 - rStockBirth}
            opacity={(1 - rStockBirth) * 0.9}
          />
        )}
        {rCryptoBirth > 0 && rCryptoBirth < 1 && (
          <Ring
            cx={cryptoX}
            cy={cryptoY}
            radius={gemSize * (1 + rCryptoBirth * 2.2)}
            strokeWidth={2}
            color={tokens.color.pastel.peach}
            progress={1 - rCryptoBirth}
            opacity={(1 - rCryptoBirth) * 0.9}
          />
        )}

        {/* Central Morphing Shadow Mass with Contours, Rainbow Rim, and Depth */}
        <MorphShape
          cx={0}
          cy={0}
          radius={baseRadius}
          shape={blobShape}
          fill="shadow"
          rim={{
            width: 8,
            spin: (frame / 30) * 26,
            glow: 14,
          }}
          contours={{
            count: 10,
            gap: 0.075,
            lag: 0.115,
            t: frame / 30,
            alpha: 0.35,
          }}
          glow={{
            color: tokens.color.pastel.lav,
            blur: 28,
            alpha: 0.45,
          }}
        />

        {/* Stock Market Mint Orb */}
        {stockSpawnP > 0 && (
          <Orb
            cx={stockX}
            cy={stockY}
            radius={stockRadius}
            color={tokens.color.pastel.mint}
            ring={true}
            ringTilt={25}
            glow={true}
            glowRadius={20}
            opacity={Math.min(1, stockSpawnP * 1.5)}
          />
        )}

        {/* Bond Market Lavender Squircle */}
        {bondSpawnP > 0 && (
          <MorphShape
            cx={bondX}
            cy={bondY}
            radius={bondRadius}
            shape={shapes.lerp(shapes.circle(), shapes.squircle(), bondMorph)}
            fill={tokens.color.pastel.lav}
            rim={{ width: 3, glow: 10 }}
            opacity={Math.min(1, bondSpawnP * 1.5)}
          />
        )}

        {/* Crypto Peach Gem */}
        {cryptoSpawnP > 0 && (
          <Gem
            cx={cryptoX}
            cy={cryptoY}
            size={gemSize}
            color={tokens.color.pastel.peach}
            shimmer={true}
            glow={true}
            opacity={Math.min(1, cryptoSpawnP * 1.8)}
          />
        )}
      </Camera>

      {/* Layer 3: Kinetic Typographic Labels in Screen Space */}
      <Label
        text="SHADOW MARKET"
        x={960}
        y={520}
        size={110}
        in={tShadow}
        out={tStock - s.sec(0.25)}
        accent={tokens.color.pastel.rose}
        align="center"
      />

      {stockSpawnP > 0.05 && (
        <Label
          text="STOCK MARKET"
          x={Math.max(280, Math.min(1640, stockScreenX))}
          y={stockScreenY + stockRadius * zoom + 54}
          size={50}
          in={tStock}
          out={tBigger2}
          accent={tokens.color.pastel.mint}
          align="center"
        />
      )}

      {bondSpawnP > 0.05 && (
        <Label
          text="BOND MARKET"
          x={Math.max(280, Math.min(1640, bondScreenX))}
          y={bondScreenY + bondRadius * zoom + 54}
          size={50}
          in={tBond}
          out={tEntire}
          accent={tokens.color.pastel.lav}
          align="center"
        />
      )}

      {cryptoSpawnP > 0.05 && (
        <Label
          text="CRYPTO MARKET"
          x={Math.max(280, Math.min(1640, cryptoScreenX))}
          y={cryptoScreenY - gemSize * zoom - 38}
          size={44}
          in={tCrypto}
          accent={tokens.color.pastel.peach}
          align="center"
        />
      )}
    </>
  );
}
