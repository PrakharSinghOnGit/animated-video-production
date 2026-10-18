import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { type IconGridProps } from "./schema";
import { COLOR_TOKENS, FONTS, scaleFontSize, RADII_TOKENS } from "../../design/tokens";
import { EASINGS, MOTION_DURATIONS } from "../../design/motion";

export const IconGrid: React.FC<IconGridProps> = ({
  title,
  subtitle,
  totalCount = 100,
  highlightCount = 1,
  highlightLabel = "Top 1%",
  remainingLabel = "Remaining 99%",
  highlightColor = COLOR_TOKENS.accent,
  baseColor = "#243242",
  iconType = "person",
  enterAtFrame = 0,
  exitAtFrame,
}) => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();

  const containerEnter = interpolate(
    frame,
    [enterAtFrame, enterAtFrame + MOTION_DURATIONS.enterSupportFrames],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASINGS.outExpo,
    }
  );

  let exitProgress = 0;
  if (exitAtFrame !== undefined) {
    exitProgress = interpolate(
      frame,
      [exitAtFrame, exitAtFrame + MOTION_DURATIONS.exitSupportFrames],
      [0, 1],
      {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: EASINGS.inCubic,
      }
    );
  }

  const opacity = interpolate(containerEnter - exitProgress, [0, 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const translateY = interpolate(containerEnter, [0, 1], [30, 0]) + interpolate(exitProgress, [0, 1], [0, -20]);

  // Render a clean SVG person glyph
  const renderIcon = (isHighlight: boolean, key: number) => {
    const color = isHighlight ? highlightColor : baseColor;
    if (iconType === "square") {
      return (
        <div
          key={key}
          style={{
            width: 24,
            height: 24,
            borderRadius: 4,
            backgroundColor: color,
            boxShadow: isHighlight ? `0 0 16px ${highlightColor}88` : "none",
          }}
        />
      );
    }

    return (
      <svg
        key={key}
        width="26"
        height="38"
        viewBox="0 0 24 36"
        fill={color}
        style={{
          filter: isHighlight ? `drop-shadow(0px 0px 8px ${highlightColor})` : "none",
        }}
      >
        {/* Head */}
        <circle cx="12" cy="7" r="5" />
        {/* Torso & Legs */}
        <path d="M4 16 C4 14, 20 14, 20 16 L18 26 L15 26 L15 36 L9 36 L9 26 L6 26 Z" />
      </svg>
    );
  };

  const icons = [];
  for (let i = 0; i < totalCount; i++) {
    const isHighlight = i < highlightCount;
    icons.push(renderIcon(isHighlight, i));
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: "100%",
        maxWidth: 1100,
        margin: "0 auto",
        opacity,
        translate: `0px ${translateY}px`,
      }}
    >
      {/* Title */}
      {title && (
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div
            style={{
              fontSize: scaleFontSize(52, width),
              fontWeight: 700,
              color: COLOR_TOKENS.text,
              letterSpacing: "-0.02em",
            }}
          >
            {title}
          </div>
          {subtitle && (
            <div
              style={{
                fontSize: scaleFontSize(30, width),
                color: COLOR_TOKENS.muted,
                marginTop: 6,
              }}
            >
              {subtitle}
            </div>
          )}
        </div>
      )}

      {/* 10x10 Icon Grid in Surface Panel */}
      <div
        style={{
          backgroundColor: COLOR_TOKENS.surface,
          border: `1px solid ${COLOR_TOKENS.surfaceBorder}`,
          borderRadius: RADII_TOKENS.lg,
          padding: 32,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 28,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(10, 1fr)",
            gap: 16,
            justifyItems: "center",
            alignItems: "center",
          }}
        >
          {icons}
        </div>

        {/* Legend */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 48,
            borderTop: `1px solid ${COLOR_TOKENS.surfaceBorder}`,
            paddingTop: 20,
            width: "100%",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                backgroundColor: highlightColor,
                boxShadow: `0 0 10px ${highlightColor}`,
              }}
            />
            <span
              style={{
                fontSize: scaleFontSize(32, width),
                fontWeight: 700,
                color: COLOR_TOKENS.text,
                fontFamily: FONTS.mono,
              }}
            >
              {highlightLabel} ({highlightCount}%)
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                backgroundColor: baseColor,
              }}
            />
            <span
              style={{
                fontSize: scaleFontSize(32, width),
                fontWeight: 500,
                color: COLOR_TOKENS.muted,
                fontFamily: FONTS.mono,
              }}
            >
              {remainingLabel} ({totalCount - highlightCount}%)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
