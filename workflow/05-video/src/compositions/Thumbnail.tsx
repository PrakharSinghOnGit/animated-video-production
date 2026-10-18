import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { COLOR_TOKENS, FONTS } from "../design/tokens";
import { UnifiedBackground } from "../backgrounds/UnifiedBackground";

export interface ThumbnailProps {
  variant?: "a" | "b" | "c";
  title?: string;
  number?: string;
  label?: string;
}

export const Thumbnail: React.FC<ThumbnailProps> = ({
  variant = "a",
  title = "THE INVISIBLE RIVER",
  number = "$9.6T",
  label = "DAILY CURRENCY VOLUME",
}) => {
  const { width, height } = useVideoConfig();

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLOR_TOKENS.bg,
        width,
        height,
        fontFamily: FONTS.sans,
        overflow: "hidden",
      }}
    >
      {/* Background with dramatic glow */}
      <UnifiedBackground
        glowHue={variant === "b" ? "accent2" : "accent"}
        glowIntensity={0.35}
        gridIntensity={1.0}
      />

      {variant === "a" && (
        <AbsoluteFill
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            textAlign: "center",
            padding: "0 60px",
          }}
        >
          {/* Eyebrow Pill */}
          <div
            style={{
              padding: "10px 28px",
              backgroundColor: "rgba(245, 184, 61, 0.15)",
              border: `2px solid ${COLOR_TOKENS.accent}`,
              borderRadius: 999,
              color: COLOR_TOKENS.accent,
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              marginBottom: 24,
            }}
          >
            {label}
          </div>

          {/* Hero Huge Numeral */}
          <div
            style={{
              fontFamily: FONTS.mono,
              fontSize: 160,
              fontWeight: 900,
              color: COLOR_TOKENS.accent,
              letterSpacing: "-0.04em",
              lineHeight: 0.9,
              textShadow: "0 10px 40px rgba(245, 184, 61, 0.4)",
              marginBottom: 30,
            }}
          >
            {number}
          </div>

          {/* Punchy Title */}
          <div
            style={{
              fontSize: 64,
              fontWeight: 800,
              color: COLOR_TOKENS.text,
              letterSpacing: "-0.02em",
              textTransform: "uppercase",
              textShadow: "0 6px 20px rgba(0,0,0,0.8)",
            }}
          >
            {title}
          </div>
        </AbsoluteFill>
      )}

      {variant === "b" && (
        <AbsoluteFill
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-around",
            alignItems: "center",
            padding: "0 80px",
          }}
        >
          {/* Left Hero Circle */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 20,
            }}
          >
            <div
              style={{
                width: 380,
                height: 380,
                borderRadius: "50%",
                backgroundColor: COLOR_TOKENS.accent,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                boxShadow: "0 12px 50px rgba(245, 184, 61, 0.45)",
              }}
            >
              <span
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 76,
                  fontWeight: 900,
                  color: "#0B0F14",
                }}
              >
                $9.6T
              </span>
            </div>
            <span
              style={{
                fontSize: 32,
                fontWeight: 700,
                color: COLOR_TOKENS.text,
                letterSpacing: "0.05em",
              }}
            >
              CURRENCY
            </span>
          </div>

          {/* Middle 10x Tag */}
          <div
            style={{
              fontSize: 84,
              fontWeight: 900,
              color: COLOR_TOKENS.text,
              fontStyle: "italic",
              textShadow: "0 8px 30px rgba(0,0,0,0.9)",
            }}
          >
            10×
          </div>

          {/* Right Smaller Circle */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 20,
            }}
          >
            <div
              style={{
                width: 140,
                height: 140,
                borderRadius: "50%",
                backgroundColor: COLOR_TOKENS.accent2,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                boxShadow: "0 8px 30px rgba(46, 196, 182, 0.35)",
              }}
            >
              <span
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 32,
                  fontWeight: 800,
                  color: "#0B0F14",
                }}
              >
                $0.95T
              </span>
            </div>
            <span
              style={{
                fontSize: 26,
                fontWeight: 600,
                color: COLOR_TOKENS.muted,
                letterSpacing: "0.05em",
              }}
            >
              ALL STOCKS
            </span>
          </div>
        </AbsoluteFill>
      )}

      {variant === "c" && (
        <AbsoluteFill
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            textAlign: "center",
            padding: "0 80px",
          }}
        >
          <div
            style={{
              fontSize: 40,
              fontWeight: 700,
              color: COLOR_TOKENS.accent,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: 20,
            }}
          >
            THE SHADOW NETWORK
          </div>
          <div
            style={{
              fontSize: 88,
              fontWeight: 900,
              color: COLOR_TOKENS.text,
              letterSpacing: "-0.03em",
              lineHeight: 1.05,
              textShadow: "0 10px 40px rgba(0,0,0,0.9)",
              maxWidth: 960,
            }}
          >
            WHO CONTROLS THE MONEY?
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
