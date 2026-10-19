import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { COLOR_TOKENS, resolveColorToken, tokens } from "../tokens";
import { p, ease } from "../motion";

export interface LabelProps {
  text: string;
  x?: number;
  y?: number;
  size?: number;
  in?: number;
  out?: number;
  accent?: string;
  stag?: number; // seconds or frames per letter in (default ~0.028s)
  stagOut?: number; // seconds or frames per letter out (default ~0.020s)
  track?: number; // letter spacing ratio (default 0.075)
  align?: "left" | "center" | "right";
  fontFamily?: string;
  weight?: number | string;
  className?: string;
  style?: React.CSSProperties;
}

export const Label: React.FC<LabelProps> = ({
  text,
  x = 960,
  y = 540,
  size = 132,
  in: enterFrame = 0,
  out: exitFrame,
  accent = "rose",
  stag = 0.028,
  stagOut = 0.02,
  track = 0.075,
  align = "center",
  fontFamily = tokens.font.display,
  weight = 700,
  style,
}) => {
  const currentFrame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Convert seconds or frames to frame counts
  const stagFrames = stag < 1 ? stag * fps : stag;
  const stagOutFrames = stagOut < 1 ? stagOut * fps : stagOut;
  const dinFrames = 0.45 * fps;
  const doutFrames = 0.28 * fps;

  // Split text into characters
  const chars = useMemo(() => Array.from(text), [text]);
  const totalLetters = chars.length;

  // Visibility check
  const latestExitFrame = exitFrame !== undefined
    ? exitFrame + totalLetters * stagOutFrames + doutFrames + 5
    : Infinity;

  if (currentFrame < enterFrame - 2 || currentFrame > latestExitFrame) {
    return null;
  }

  // Accent underline progress
  const ulEnterProg = p(currentFrame, enterFrame + 2, enterFrame + 0.5 * fps);
  const ulInEased = ease.outExpo(ulEnterProg);
  const ulExitProg = exitFrame !== undefined
    ? p(currentFrame, exitFrame, exitFrame + 0.35 * fps)
    : 0;
  const ulOutEased = ease.inCubic(ulExitProg);

  // Underline positions (0..100%)
  const ulLeft = ulOutEased * 100;
  const ulRight = ulInEased * 100;
  const ulWidth = Math.max(0, ulRight - ulLeft);

  const resolvedAccent = resolveColorToken(accent);
  const trackingPx = size * track;

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform:
          align === "center"
            ? "translate(-50%, -50%)"
            : align === "right"
            ? "translate(-100%, -50%)"
            : "translate(0, -50%)",
        display: "inline-flex",
        flexDirection: "column",
        alignItems: align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start",
        pointerEvents: "none",
        ...style,
      }}
    >
      {/* Letter clip container */}
      <div
        style={{
          display: "flex",
          overflow: "hidden",
          paddingBottom: size * 0.1,
          paddingTop: size * 0.1,
          marginTop: -size * 0.1,
          marginBottom: -size * 0.05,
        }}
      >
        {chars.map((char, i) => {
          const charIn = enterFrame + i * stagFrames;
          const uIn = p(currentFrame, charIn, charIn + dinFrames);
          const inOvershoot = ease.outBack(1.18)(uIn);

          let outY = 0;
          if (exitFrame !== undefined) {
            const charOut = exitFrame + i * stagOutFrames;
            const uOut = p(currentFrame, charOut, charOut + doutFrames);
            outY = ease.inCubic(uOut) * size * 1.25;
          }

          // Rise from bottom (+size * 1.25 to 0), overshoot slightly, exit upward
          const dy = (1 - inOvershoot) * size * 1.25 - outY;

          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                fontFamily: `${fontFamily}, sans-serif`,
                fontSize: size,
                fontWeight: weight,
                color: COLOR_TOKENS.text,
                lineHeight: 1,
                letterSpacing: `${trackingPx}px`,
                transform: `translate3d(0, ${dy}px, 0)`,
                whiteSpace: "pre",
              }}
            >
              {char}
            </span>
          );
        })}
      </div>

      {/* Accent Underline */}
      <div
        style={{
          position: "relative",
          width: "100%",
          height: Math.max(3, size * 0.045),
          marginTop: size * 0.08,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: `${ulLeft}%`,
            width: `${ulWidth}%`,
            height: "100%",
            backgroundColor: resolvedAccent,
            borderRadius: 99,
          }}
        />
      </div>
    </div>
  );
};
