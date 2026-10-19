import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { tokens } from "../tokens";
import { FONTS } from "../fonts";
import { Backdrop } from "../main/Backdrop";
import { Finish } from "../main/Finish";
import { shapes } from "../shapes";
import { Camera } from "../primitives/Camera";
import { MorphShape } from "../primitives/MorphShape";
import { Label } from "../primitives/Label";
import { Ring } from "../primitives/Ring";
import { Glow } from "../primitives/Glow";
import { Particles } from "../primitives/Particles";
import { Orb } from "../primitives/Orb";
import { Gem } from "../primitives/Gem";
import { Coin } from "../primitives/Coin";
import { Sparkle } from "../primitives/Sparkle";
import { Panel } from "../primitives/Panel";
import { Counter } from "../primitives/Counter";
import { Trail } from "../primitives/Trail";

// Shortcuts
import { BigNumber } from "../charts/BigNumber";
import { BarCompare } from "../charts/BarCompare";
import { LineDraw } from "../charts/LineDraw";
import { SizeCompare } from "../charts/SizeCompare";
import { IconGrid } from "../charts/IconGrid";
import { MoneyFlow } from "../charts/MoneyFlow";
import { TitleCard } from "../text/TitleCard";
import { TermCard } from "../text/TermCard";
import { SourceTag } from "../text/SourceTag";
import { Globe3D } from "../three/Globe3D";

import { GALLERY_FIXTURES } from "./fixtures";

export interface GalleryProps {
  slide?: number;
}

export const Gallery: React.FC<GalleryProps> = ({ slide }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  // Slide duration: 30 frames (1.0 second)
  const slideDuration = 30;
  const currentSlide =
    slide !== undefined ? slide : Math.min(8, Math.floor(frame / slideDuration));
  const slideFrame = slide !== undefined ? frame : frame % slideDuration;
  const t = slideFrame / fps;

  const slideTitles = [
    "01 • Primitives & Geometry (MorphShape, Camera, Trail)",
    "02 • 3D Shaded Objects (Orb, Gem, Coin, Sparkle)",
    "03 • Text Reveals & Ripples (Label, Panel, Ring)",
    "04 • Dynamic Counters & Stress Fixtures (Counter, Glow, Particles)",
    "05 • Data Shortcuts I (BigNumber & BarCompare)",
    "06 • Data Shortcuts II (LineDraw & SizeCompare)",
    "07 • Data Shortcuts III (IconGrid & MoneyFlow)",
    "08 • Editorial Cards (TitleCard, TermCard, SourceTag)",
    "09 • 3D Geography (Globe3D)",
  ];

  return (
    <AbsoluteFill
      style={{
        backgroundColor: tokens.color.bg,
        fontFamily: FONTS.sans,
        color: tokens.color.text,
        overflow: "hidden",
      }}
    >
      <Backdrop />

      {/* Gallery Header Bar */}
      <div
        style={{
          position: "absolute",
          top: 40,
          left: 80,
          right: 80,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          paddingBottom: 16,
          zIndex: 100,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
          <span
            style={{
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: "0.15em",
              color: tokens.color.accent,
              textTransform: "uppercase",
            }}
          >
            @wealthgap/kit
          </span>
          <span style={{ fontSize: 28, fontWeight: 700, color: tokens.color.text }}>
            {slideTitles[currentSlide]}
          </span>
        </div>
        <div
          style={{
            fontFamily: FONTS.mono,
            fontSize: 20,
            color: tokens.color.muted,
            backgroundColor: tokens.color.surface,
            padding: "6px 14px",
            borderRadius: 8,
            border: "1px solid rgba(255, 255, 255, 0.08)",
          }}
        >
          SLIDE {currentSlide + 1} / 9 • FRAME {slideFrame} ({t.toFixed(2)}s)
        </div>
      </div>

      {/* Slide Content Area */}
      <AbsoluteFill style={{ top: 90, height: height - 140 }}>
        {/* Slide 0: Primitives & Geometry */}
        {currentSlide === 0 && (
          <AbsoluteFill>
            <Camera scale={1.05 + 0.05 * Math.sin(t * 2)} focus={[0, 0]}>
              <MorphShape
                cx={-320}
                cy={0}
                radius={240}
                shape={shapes.blob(t * 1.5, { amp: 0.8, phase: 0, seed: 42 })}
                fill="shadow"
                rim={{ width: 8, spin: t * 45, colors: ["lav", "sky", "mint", "peach"] }}
                contours={{ count: 8, gap: 0.08, lag: 0.12, t: t * 1.5, alpha: 0.4 }}
                glow={{ color: "lav", blur: 32, alpha: 0.4 }}
              />
              <MorphShape
                cx={340}
                cy={0}
                radius={210}
                shape={shapes.lerp(shapes.squircle(4), shapes.star(6, 0.55), 0.5 + 0.5 * Math.sin(t * 3))}
                fill="surface"
                rim={{ width: 6, spin: -t * 30, colors: ["peach", "butter", "rose"] }}
                glow={{ color: "peach", blur: 28, alpha: 0.35 }}
              />
            </Camera>
            {/* Luminous Trail Demo */}
            <Trail
              points={[
                [-500, 260],
                [-300, 220],
                [-100, 270],
                [100, 200],
                [300, 250],
                [500, 180],
                [700, 240],
              ].map(([x, y]) => [x + 960, y + 260])}
              width={7}
              color="sky"
              fade={true}
              glow={true}
            />
          </AbsoluteFill>
        )}

        {/* Slide 1: 3D Shaded Objects */}
        {currentSlide === 1 && (
          <AbsoluteFill>
            {/* Orb */}
            <Orb cx={280} cy={420} radius={95} color="mint" ring={true} spin={t * 2} />
            <div
              style={{
                position: "absolute",
                left: 140,
                top: 600,
                width: 280,
                textAlign: "center",
                fontSize: 24,
                fontWeight: 700,
                color: tokens.color.pastel.mint,
              }}
            >
              Orb (Shaded Sphere)
            </div>

            {/* Gem */}
            <Gem cx={730} cy={420} radius={85} color="peach" rot={t * 40} />
            <div
              style={{
                position: "absolute",
                left: 590,
                top: 600,
                width: 280,
                textAlign: "center",
                fontSize: 24,
                fontWeight: 700,
                color: tokens.color.pastel.peach,
              }}
            >
              Gem (Faceted Hexagon)
            </div>

            {/* Coin */}
            <Coin cx={1180} cy={420} radius={80} color="butter" spin={t * 3.5} />
            <div
              style={{
                position: "absolute",
                left: 1040,
                top: 600,
                width: 280,
                textAlign: "center",
                fontSize: 24,
                fontWeight: 700,
                color: tokens.color.pastel.butter,
              }}
            >
              Coin (3D Perspective Spin)
            </div>

            {/* Sparkle */}
            <Sparkle cx={1600} cy={400} size={54 * (0.8 + 0.3 * Math.sin(t * 6))} color="butter" />
            <Sparkle cx={1670} cy={440} size={38 * (0.8 + 0.3 * Math.cos(t * 6))} color="rose" />
            <Sparkle cx={1640} cy={360} size={30 * (0.8 + 0.3 * Math.sin(t * 8))} color="sky" />
            <div
              style={{
                position: "absolute",
                left: 1490,
                top: 600,
                width: 280,
                textAlign: "center",
                fontSize: 24,
                fontWeight: 700,
                color: tokens.color.pastel.butter,
              }}
            >
              Sparkle (Glint Starlight)
            </div>
          </AbsoluteFill>
        )}

        {/* Slide 2: Text Reveals & Ripples */}
        {currentSlide === 2 && (
          <AbsoluteFill>
            {/* Standard Label */}
            <div style={{ position: "absolute", top: 110, left: 100, fontSize: 18, color: tokens.color.muted, textTransform: "uppercase" }}>
              Standard Reveal:
            </div>
            <Label
              text={GALLERY_FIXTURES.label.standard.text}
              x={960}
              y={170}
              size={84}
              in={0}
              accent="rose"
              align="center"
            />

            {/* Stress Fixture: Very Long Label */}
            <div style={{ position: "absolute", top: 300, left: 100, fontSize: 18, color: tokens.color.muted, textTransform: "uppercase" }}>
              Stress Fixture (Very Long Financial Title):
            </div>
            <Label
              text={GALLERY_FIXTURES.label.stressLong.text}
              x={960}
              y={360}
              size={34}
              in={4}
              accent="mint"
              align="center"
            />

            {/* Panel & Ripples */}
            <Ring at={0} cx={960} cy={640} maxRadius={360} color="lav" dur={24} />
            <Panel
              x={680}
              y={520}
              w={560}
              h={240}
              radius={20}
              color="surface"
              stitch={true}
              rimColors={["lav", "sky", "mint"]}
            >
              <div style={{ textAlign: "center", width: "100%", padding: 24 }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: tokens.color.text }}>
                  Elevated Cushion Panel
                </div>
                <div style={{ fontSize: 20, color: tokens.color.muted, marginTop: 12 }}>
                  Soft rim lighting with continuous stitched perimeter
                </div>
              </div>
            </Panel>
          </AbsoluteFill>
        )}

        {/* Slide 3: Dynamic Counters & Stress Fixtures */}
        {currentSlide === 3 && (
          <AbsoluteFill style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
            <Glow cx={400} cy={300} radius={320} color="lav" alpha={0.25} />
            <Glow cx={1400} cy={600} radius={320} color="mint" alpha={0.22} />
            <Particles seed={101} count={40} region={[100, 100, 1720, 800]} />

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: 50,
                width: 1400,
              }}
            >
              {/* Standard Counter */}
              <div
                style={{
                  backgroundColor: tokens.color.surface,
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: 20,
                  padding: "36px 48px",
                }}
              >
                <div style={{ fontSize: 20, color: tokens.color.muted, textTransform: "uppercase" }}>
                  Standard Eased Count:
                </div>
                <div style={{ marginTop: 10 }}>
                  <Counter
                    from={GALLERY_FIXTURES.counter.standard.from}
                    to={GALLERY_FIXTURES.counter.standard.to}
                    start={0}
                    end={25}
                    decimals={GALLERY_FIXTURES.counter.standard.decimals}
                    prefix={GALLERY_FIXTURES.counter.standard.prefix}
                    suffix={GALLERY_FIXTURES.counter.standard.suffix}
                    size={84}
                    color="accent"
                  />
                </div>
                <div style={{ fontSize: 22, color: tokens.color.text, marginTop: 10 }}>
                  {GALLERY_FIXTURES.counter.standard.sublabel}
                </div>
              </div>

              {/* Stress Huge Number Counter */}
              <div
                style={{
                  backgroundColor: tokens.color.surface,
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: 20,
                  padding: "36px 48px",
                }}
              >
                <div style={{ fontSize: 20, color: tokens.color.muted, textTransform: "uppercase" }}>
                  Stress Fixture (Huge Integer):
                </div>
                <div style={{ marginTop: 10 }}>
                  <Counter
                    from={GALLERY_FIXTURES.counter.stressHuge.from}
                    to={GALLERY_FIXTURES.counter.stressHuge.to}
                    start={0}
                    end={25}
                    decimals={GALLERY_FIXTURES.counter.stressHuge.decimals}
                    prefix={GALLERY_FIXTURES.counter.stressHuge.prefix}
                    suffix={GALLERY_FIXTURES.counter.stressHuge.suffix}
                    size={64}
                    color="mint"
                  />
                </div>
                <div style={{ fontSize: 22, color: tokens.color.text, marginTop: 10 }}>
                  {GALLERY_FIXTURES.counter.stressHuge.sublabel}
                </div>
              </div>

              {/* Stress Zero Counter */}
              <div
                style={{
                  backgroundColor: tokens.color.surface,
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: 20,
                  padding: "36px 48px",
                }}
              >
                <div style={{ fontSize: 20, color: tokens.color.muted, textTransform: "uppercase" }}>
                  Stress Fixture (Zero Baseline):
                </div>
                <div style={{ marginTop: 10 }}>
                  <Counter
                    from={GALLERY_FIXTURES.counter.stressZero.from}
                    to={GALLERY_FIXTURES.counter.stressZero.to}
                    start={0}
                    end={25}
                    decimals={GALLERY_FIXTURES.counter.stressZero.decimals}
                    prefix={GALLERY_FIXTURES.counter.stressZero.prefix}
                    suffix={GALLERY_FIXTURES.counter.stressZero.suffix}
                    size={64}
                    color="muted"
                  />
                </div>
                <div style={{ fontSize: 22, color: tokens.color.text, marginTop: 10 }}>
                  {GALLERY_FIXTURES.counter.stressZero.sublabel}
                </div>
              </div>

              {/* Stress Negative Counter */}
              <div
                style={{
                  backgroundColor: tokens.color.surface,
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: 20,
                  padding: "36px 48px",
                }}
              >
                <div style={{ fontSize: 20, color: tokens.color.muted, textTransform: "uppercase" }}>
                  Stress Fixture (Negative Deficit):
                </div>
                <div style={{ marginTop: 10 }}>
                  <Counter
                    from={GALLERY_FIXTURES.counter.stressNegative.from}
                    to={GALLERY_FIXTURES.counter.stressNegative.to}
                    start={0}
                    end={25}
                    decimals={GALLERY_FIXTURES.counter.stressNegative.decimals}
                    prefix={GALLERY_FIXTURES.counter.stressNegative.prefix}
                    suffix={GALLERY_FIXTURES.counter.stressNegative.suffix}
                    size={64}
                    color="negative"
                  />
                </div>
                <div style={{ fontSize: 22, color: tokens.color.text, marginTop: 10 }}>
                  {GALLERY_FIXTURES.counter.stressNegative.sublabel}
                </div>
              </div>
            </div>
          </AbsoluteFill>
        )}

        {/* Slide 4: Data Shortcuts I (BigNumber & BarCompare) */}
        {currentSlide === 4 && (
          <AbsoluteFill
            style={{
              padding: "40px 100px",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 60,
              alignItems: "center",
            }}
          >
            {/* BigNumber */}
            <div style={{ display: "flex", flexDirection: "column", gap: 30 }}>
              <BigNumber {...GALLERY_FIXTURES.shortcuts.bigNumber.standard} enterAtFrame={0} />
            </div>

            {/* BarCompare */}
            <div>
              <BarCompare {...GALLERY_FIXTURES.shortcuts.barCompare.standard} enterAtFrame={0} />
            </div>
          </AbsoluteFill>
        )}

        {/* Slide 5: Data Shortcuts II (LineDraw & SizeCompare) */}
        {currentSlide === 5 && (
          <AbsoluteFill
            style={{
              padding: "40px 100px",
              display: "grid",
              gridTemplateColumns: "1.1fr 0.9fr",
              gap: 60,
              alignItems: "center",
            }}
          >
            <div>
              <LineDraw {...GALLERY_FIXTURES.shortcuts.lineDraw.standard} enterAtFrame={0} />
            </div>
            <div style={{ transform: "scale(0.85)", transformOrigin: "center center" }}>
              <SizeCompare {...GALLERY_FIXTURES.shortcuts.sizeCompare.standard} enterAtFrame={0} />
            </div>
          </AbsoluteFill>
        )}

        {/* Slide 6: Data Shortcuts III (IconGrid & MoneyFlow) */}
        {currentSlide === 6 && (
          <AbsoluteFill
            style={{
              padding: "40px 100px",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 60,
              alignItems: "center",
            }}
          >
            <div>
              <IconGrid {...GALLERY_FIXTURES.shortcuts.iconGrid.standard} enterAtFrame={0} />
            </div>
            <div>
              <MoneyFlow {...GALLERY_FIXTURES.shortcuts.moneyFlow.standard} enterAtFrame={0} />
            </div>
          </AbsoluteFill>
        )}

        {/* Slide 7: Editorial Cards (TitleCard, TermCard, SourceTag) */}
        {currentSlide === 7 && (
          <AbsoluteFill
            style={{
              padding: "40px 100px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-around",
            }}
          >
            <div style={{ width: "100%" }}>
              <TitleCard {...GALLERY_FIXTURES.shortcuts.cards.titleCard} enterAtFrame={0} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.6fr", gap: 40, alignItems: "center" }}>
              <TermCard {...GALLERY_FIXTURES.shortcuts.cards.termCard} enterAtFrame={0} />
              <div>
                <SourceTag {...GALLERY_FIXTURES.shortcuts.cards.sourceTag} />
              </div>
            </div>
          </AbsoluteFill>
        )}

        {/* Slide 8: 3D Geography (Globe3D) */}
        {currentSlide === 8 && (
          <AbsoluteFill style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
            <div style={{ width: 1200, height: 750 }}>
              <Globe3D
                {...GALLERY_FIXTURES.shortcuts.globe3d.standard}
                enterAtFrame={0}
              />
            </div>
          </AbsoluteFill>
        )}
      </AbsoluteFill>

      {/* Global Finishing Layer */}
      <Finish fadeFrames={15} />
    </AbsoluteFill>
  );
};
