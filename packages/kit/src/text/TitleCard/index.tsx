import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { type TitleCardProps } from "./schema";
import { COLOR_TOKENS, FONTS, scaleFontSize, RADII_TOKENS } from "../../tokens";
import { EASINGS, MOTION_DURATIONS } from "../../motion";

export const TitleCard: React.FC<TitleCardProps> = ({
  title,
  subtitle,
  chapterBadge,
  accentColor = COLOR_TOKENS.accent,
  enterAtFrame = 0,
  exitAtFrame,
}) => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();

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
  const translateY = interpolate(containerEnter, [0, 1], [40, 0]) + interpolate(exitProgress, [0, 1], [0, -30]);
  const scale = interpolate(containerEnter, [0, 1], [0.95, 1.0]) * interpolate(exitProgress, [0, 1], [1.0, 0.97]);

  const titleSize = scaleFontSize(84, width);
  const subtitleSize = scaleFontSize(42, width);
  const badgeSize = scaleFontSize(26, width);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        width: "100%",
        maxWidth: 1300,
        margin: "0 auto",
        opacity,
        translate: `0px ${translateY}px`,
        scale: `${scale}`,
      }}
    >
      {/* Chapter Badge */}
      {chapterBadge && (
        <div
          style={{
            padding: "8px 20px",
            backgroundColor: COLOR_TOKENS.surface,
            border: `1px solid ${accentColor}66`,
            borderRadius: RADII_TOKENS.full,
            fontSize: badgeSize,
            fontFamily: FONTS.mono,
            fontWeight: 700,
            color: accentColor,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            marginBottom: 24,
            boxShadow: `0 0 20px ${accentColor}22`,
          }}
        >
          {chapterBadge}
        </div>
      )}

      {/* Main Title */}
      <div
        style={{
          fontSize: titleSize,
          fontWeight: 800,
          color: COLOR_TOKENS.text,
          letterSpacing: "-0.03em",
          lineHeight: 1.15,
          maxWidth: "90%",
        }}
      >
        {title}
      </div>

      {/* Supporting Subtitle */}
      {subtitle && (
        <div
          style={{
            fontSize: subtitleSize,
            fontWeight: 400,
            color: COLOR_TOKENS.muted,
            marginTop: 18,
            maxWidth: "75%",
            lineHeight: 1.35,
          }}
        >
          {subtitle}
        </div>
      )}
    </div>
  );
};
