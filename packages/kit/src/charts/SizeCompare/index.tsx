import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { type SizeCompareProps } from "./schema";
import { COLOR_TOKENS, FONTS, scaleFontSize } from "../../tokens";
import { EASINGS, MOTION_DURATIONS, STAGGER_RULES } from "../../motion";

export const SizeCompare: React.FC<SizeCompareProps> = ({
  title,
  subtitle,
  items,
  unitPrefix = "",
  unitSuffix = "",
  enterAtFrame = 0,
  exitAtFrame,
}) => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();

  // Find maximum value
  const maxVal = Math.max(...items.map((i) => i.value), 1);

  const containerEnter = interpolate(
    frame,
    [enterAtFrame, enterAtFrame + MOTION_DURATIONS.enterHeroFrames],
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
      [exitAtFrame, exitAtFrame + MOTION_DURATIONS.exitHeroFrames],
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

  const maxCircleRadius = 220;
  const minCircleRadius = 55;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: "100%",
        maxWidth: 1300,
        margin: "0 auto",
        opacity,
        translate: `0px ${translateY}px`,
      }}
    >
      {/* Title */}
      {title && (
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div
            style={{
              fontSize: scaleFontSize(54, width),
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
                fontSize: scaleFontSize(32, width),
                color: COLOR_TOKENS.muted,
                marginTop: 6,
              }}
            >
              {subtitle}
            </div>
          )}
        </div>
      )}

      {/* Proportional Circles Container */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-around",
          alignItems: "center",
          width: "100%",
          gap: 40,
        }}
      >
        {items.map((item, index) => {
          // Staggered pop for each shape
          const itemStart = enterAtFrame + index * (STAGGER_RULES.framesPerItem + 2);
          const itemProgress = interpolate(
            frame,
            [itemStart, itemStart + MOTION_DURATIONS.enterHeroFrames],
            [0, 1],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: EASINGS.outExpo,
            }
          );

          // Area-proportional radius calculation: r = sqrt(value / maxVal)
          const areaRatio = Math.sqrt(Math.max(item.value, 0.05) / maxVal);
          const currentRadius = Math.max(minCircleRadius, maxCircleRadius * areaRatio);
          const diameter = currentRadius * 2;

          const formatted =
            item.displayValue || `${unitPrefix}${item.value.toFixed(1)}${unitSuffix}`;

          const isLarge = diameter >= 220;

          return (
            <div
              key={item.label}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                textAlign: "center",
                scale: `${itemProgress}`,
                opacity: itemProgress,
              }}
            >
              {/* Proportional Bubble */}
              <div
                style={{
                  width: diameter,
                  height: diameter,
                  borderRadius: "50%",
                  backgroundColor: item.color,
                  border: `2px solid ${item.color}`,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: `0 0 ${diameter * 0.25}px ${item.color}44`,
                  padding: 16,
                }}
              >
                {isLarge ? (
                  <>
                    <span
                      style={{
                        fontSize: Math.min(64, diameter * 0.22),
                        fontWeight: 800,
                        fontFamily: FONTS.mono,
                        fontVariantNumeric: "tabular-nums",
                        color: COLOR_TOKENS.bg,
                        lineHeight: 1,
                      }}
                    >
                      {formatted}
                    </span>
                  </>
                ) : null}
              </div>

              {/* External Label (always legible below shape) */}
              <div style={{ marginTop: 20 }}>
                <div
                  style={{
                    fontSize: scaleFontSize(36, width),
                    fontWeight: 700,
                    color: COLOR_TOKENS.text,
                    maxWidth: 320,
                  }}
                >
                  {item.label}
                </div>

                {!isLarge && (
                  <div
                    style={{
                      fontSize: scaleFontSize(34, width),
                      fontFamily: FONTS.mono,
                      fontWeight: 700,
                      color: item.color,
                      marginTop: 4,
                    }}
                  >
                    {formatted}
                  </div>
                )}

                {item.subtext && (
                  <div
                    style={{
                      fontSize: scaleFontSize(26, width),
                      color: COLOR_TOKENS.muted,
                      marginTop: 4,
                    }}
                  >
                    {item.subtext}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
