import React from "react";
import { useCurrentFrame } from "remotion";
import { COLOR_TOKENS, resolveColorToken, tokens } from "../tokens";
import { p, ease, lerp } from "../motion";

export interface CounterProps {
  from?: number;
  to: number;
  start: number; // frame to start count
  end: number; // frame to land on final value
  decimals?: number;
  prefix?: string;
  suffix?: string;
  size?: number;
  color?: string;
  fontFamily?: string;
  weight?: number | string;
  commaSeparate?: boolean;
  style?: React.CSSProperties;
}

export const Counter: React.FC<CounterProps> = ({
  from = 0,
  to,
  start,
  end,
  decimals = 0,
  prefix = "",
  suffix = "",
  size = 180,
  color = "text",
  fontFamily = tokens.font.display,
  weight = 800,
  commaSeparate = true,
  style,
}) => {
  const currentFrame = useCurrentFrame();

  const progress = p(currentFrame, start, end);
  const eased = ease.outCubic(progress);
  const currentVal = lerp(from, to, eased);

  let formattedNumber = currentVal.toFixed(decimals);
  if (commaSeparate) {
    const parts = formattedNumber.split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    formattedNumber = parts.join(".");
  }

  const resolvedColor = resolveColorToken(color);

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        fontFamily: `${fontFamily}, sans-serif`,
        fontSize: size,
        fontWeight: weight,
        color: resolvedColor,
        lineHeight: 1,
        letterSpacing: "-0.02em",
        pointerEvents: "none",
        ...style,
      }}
    >
      {prefix && (
        <span
          style={{
            marginRight: "0.08em",
            fontSize: "0.85em",
            fontWeight: 700,
            color: resolveColorToken("accent"),
          }}
        >
          {prefix}
        </span>
      )}
      <span>{formattedNumber}</span>
      {suffix && (
        <span
          style={{
            marginLeft: "0.06em",
            fontSize: "0.65em",
            fontWeight: 700,
            color: COLOR_TOKENS.muted,
          }}
        >
          {suffix}
        </span>
      )}
    </div>
  );
};
