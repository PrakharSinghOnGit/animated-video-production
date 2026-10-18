import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { COLOR_TOKENS, TYPE_SCALE_1080P, SPACING_TOKENS, RADII_TOKENS } from "../design/tokens";
import { UnifiedBackground } from "../backgrounds/UnifiedBackground";
import { getSafeBounds } from "../design/layout";
import { useFontsLoaded, FONTS } from "../design/fonts";

export const Gallery: React.FC = () => {
  const { width, height } = useVideoConfig();
  const fontsLoaded = useFontsLoaded();
  const safe = getSafeBounds(width, height);

  const paletteSwatches = [
    { name: "bg", hex: COLOR_TOKENS.bg, label: "Obsidian Base" },
    { name: "surface", hex: COLOR_TOKENS.surface, label: "Surface Panel" },
    { name: "surface2", hex: COLOR_TOKENS.surface2, label: "Elevated Surface" },
    { name: "text", hex: COLOR_TOKENS.text, label: "Primary Text" },
    { name: "muted", hex: COLOR_TOKENS.muted, label: "Secondary / Axes" },
    { name: "accent", hex: COLOR_TOKENS.accent, label: "Gold Accent" },
    { name: "accent2", hex: COLOR_TOKENS.accent2, label: "Teal Comparative" },
    { name: "positive", hex: COLOR_TOKENS.positive, label: "Positive Inflow" },
    { name: "negative", hex: COLOR_TOKENS.negative, label: "Negative Deficit" },
  ];

  return (
    <AbsoluteFill
      style={{
        fontFamily: FONTS.sans,
        color: COLOR_TOKENS.text,
        opacity: fontsLoaded ? 1 : 0,
      }}
    >
      {/* 1. Unified Background Stack */}
      <UnifiedBackground glowHue="accent" glowIntensity={0.25} />

      {/* Safe Area Container */}
      <div
        style={{
          position: "absolute",
          top: safe.safeTop,
          left: safe.safeLeft,
          width: safe.contentWidth,
          height: safe.contentHeight,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        {/* Header / Brand */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            borderBottom: `1px solid ${COLOR_TOKENS.surfaceBorder}`,
            paddingBottom: SPACING_TOKENS.md,
          }}
        >
          <div>
            <div
              style={{
                fontSize: TYPE_SCALE_1080P.source,
                color: COLOR_TOKENS.accent,
                fontWeight: 700,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                marginBottom: 4,
              }}
            >
              The Wealth Gap • Design System
            </div>
            <div
              style={{
                fontSize: 64,
                fontWeight: 800,
                letterSpacing: "-0.02em",
                color: COLOR_TOKENS.text,
              }}
            >
              Motion Engine Gallery
            </div>
          </div>

          <div
            style={{
              padding: "10px 18px",
              backgroundColor: COLOR_TOKENS.surface,
              border: `1px solid ${COLOR_TOKENS.surfaceBorder}`,
              borderRadius: RADII_TOKENS.md,
              fontSize: 28,
              fontFamily: FONTS.mono,
              color: COLOR_TOKENS.muted,
            }}
          >
            1920 × 1080 • 30 FPS
          </div>
        </div>

        {/* Center Showcase: Color Swatches & Typographic Hierarchy */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.1fr 0.9fr",
            gap: SPACING_TOKENS.xl,
            alignItems: "center",
          }}
        >
          {/* Left: Typography Scale & Hero Sample */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: SPACING_TOKENS.md,
            }}
          >
            {/* Hero Number Card */}
            <div
              style={{
                backgroundColor: COLOR_TOKENS.surface,
                border: `1px solid ${COLOR_TOKENS.surfaceBorder}`,
                borderRadius: RADII_TOKENS.lg,
                padding: `${SPACING_TOKENS.lg}px ${SPACING_TOKENS.xl}px`,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  fontFamily: FONTS.mono,
                  letterSpacing: "-0.04em",
                }}
              >
                <span
                  style={{
                    fontSize: 160,
                    fontWeight: 800,
                    color: COLOR_TOKENS.accent,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  $9.6
                </span>
                <span
                  style={{
                    fontSize: 70,
                    fontWeight: 700,
                    color: COLOR_TOKENS.text,
                    marginLeft: 16,
                  }}
                >
                  TRILLION
                </span>
              </div>
              <div
                style={{
                  fontSize: 36,
                  color: COLOR_TOKENS.muted,
                  fontWeight: 500,
                  marginTop: -8,
                }}
              >
                traded across global foreign exchange every single day
              </div>
            </div>

            {/* Headline and Subhead Hierarchy */}
            <div>
              <div
                style={{
                  fontSize: 68,
                  fontWeight: 700,
                  color: COLOR_TOKENS.text,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.1,
                }}
              >
                The Invisible River of Global Liquidity
              </div>
              <div
                style={{
                  fontSize: 34,
                  fontWeight: 400,
                  color: COLOR_TOKENS.muted,
                  marginTop: 8,
                }}
              >
                Grounded in institutional central bank surveys and market architecture.
              </div>
            </div>
          </div>

          {/* Right: Palette Swatches Grid */}
          <div
            style={{
              backgroundColor: "rgba(18, 25, 35, 0.7)",
              border: `1px solid ${COLOR_TOKENS.surfaceBorder}`,
              borderRadius: RADII_TOKENS.lg,
              padding: SPACING_TOKENS.lg,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div
              style={{
                fontSize: 26,
                fontWeight: 600,
                color: COLOR_TOKENS.muted,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 6,
              }}
            >
              Core Palette Tokens
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 12,
              }}
            >
              {paletteSwatches.map((swatch) => (
                <div
                  key={swatch.name}
                  style={{
                    backgroundColor: COLOR_TOKENS.surface2,
                    borderRadius: RADII_TOKENS.md,
                    padding: 12,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    border: `1px solid ${COLOR_TOKENS.surfaceBorder}`,
                  }}
                >
                  <div
                    style={{
                      height: 48,
                      borderRadius: RADII_TOKENS.sm,
                      backgroundColor: swatch.hex,
                      border: "1px solid rgba(255,255,255,0.1)",
                    }}
                  />
                  <div>
                    <div
                      style={{
                        fontSize: 22,
                        fontWeight: 700,
                        color: COLOR_TOKENS.text,
                      }}
                    >
                      {swatch.name}
                    </div>
                    <div
                      style={{
                        fontSize: 16,
                        fontFamily: FONTS.mono,
                        color: COLOR_TOKENS.muted,
                      }}
                    >
                      {swatch.hex}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer: Citation / Source Tag Bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: `1px solid ${COLOR_TOKENS.surfaceBorder}`,
            paddingTop: SPACING_TOKENS.md,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                backgroundColor: COLOR_TOKENS.positive,
                marginTop: 8,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: TYPE_SCALE_1080P.source,
                color: COLOR_TOKENS.muted,
                fontWeight: 600,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              SOURCE: BANK FOR INTERNATIONAL SETTLEMENTS (BIS) TRIENNIAL SURVEY 2025
            </span>
          </div>

          <div
            style={{
              fontSize: 24,
              fontFamily: FONTS.mono,
              color: COLOR_TOKENS.muted,
            }}
          >
            SAFE ZONE: 80PX SIDES • 100PX VERTICAL
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
