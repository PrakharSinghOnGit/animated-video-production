import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { type BarCompareProps } from "./schema";
import { COLOR_TOKENS, FONTS, scaleFontSize, RADII_TOKENS } from "../../design/tokens";
import { EASINGS, MOTION_DURATIONS, STAGGER_RULES } from "../../design/motion";

export const BarCompare: React.FC<BarCompareProps> = ({
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

  // Find maximum value to normalize bar lengths
  const maxValue = Math.max(...items.map((it) => it.value), 1);

  // Overall container entrance
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

  // Overall container exit
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

  const labelSize = scaleFontSize(38, width);
  const valueSize = scaleFontSize(44, width);
  const titleSize = scaleFontSize(54, width);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        maxWidth: 1200,
        margin: "0 auto",
        opacity,
        translate: `0px ${translateY}px`,
      }}
    >
      {/* Title & Subtitle */}
      {title && (
        <div style={{ marginBottom: 32 }}>
          <div
            style={{
              fontSize: titleSize,
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

      {/* Bar List */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 28,
          width: "100%",
        }}
      >
        {items.map((item, index) => {
          // Staggered entrance for each bar
          const barEnterStart = enterAtFrame + index * STAGGER_RULES.framesPerItem;
          const barGrowProgress = interpolate(
            frame,
            [barEnterStart, barEnterStart + MOTION_DURATIONS.barGrowFrames],
            [0, 1],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: EASINGS.outExpo,
            }
          );

          const proportion = item.value / maxValue;
          const barWidthPercent = proportion * barGrowProgress * 100;

          // Animated number display during grow
          const displayedVal = item.value * barGrowProgress;
          const formattedText =
            item.formattedValue ||
            `${unitPrefix}${displayedVal.toFixed(1)}${unitSuffix}`;

          const barColor = item.color || (item.highlight ? COLOR_TOKENS.accent : COLOR_TOKENS.accent2);

          return (
            <div
              key={item.label}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                width: "100%",
              }}
            >
              {/* Top row: Label + Metric value */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                }}
              >
                <span
                  style={{
                    fontSize: labelSize,
                    fontWeight: item.highlight ? 700 : 500,
                    color: item.highlight ? COLOR_TOKENS.text : COLOR_TOKENS.muted,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {item.label}
                </span>

                <span
                  style={{
                    fontSize: valueSize,
                    fontFamily: FONTS.mono,
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums",
                    color: item.highlight ? barColor : COLOR_TOKENS.text,
                  }}
                >
                  {formattedText}
                </span>
              </div>

              {/* Progress track & filled bar */}
              <div
                style={{
                  width: "100%",
                  height: 24,
                  backgroundColor: COLOR_TOKENS.surface,
                  borderRadius: RADII_TOKENS.sm,
                  overflow: "hidden",
                  border: `1px solid ${COLOR_TOKENS.surfaceBorder}`,
                }}
              >
                <div
                  style={{
                    width: `${barWidthPercent}%`,
                    height: "100%",
                    backgroundColor: barColor,
                    borderRadius: RADII_TOKENS.sm,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
