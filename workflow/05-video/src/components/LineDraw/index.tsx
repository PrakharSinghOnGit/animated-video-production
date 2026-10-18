import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { line as d3Line, area as d3Area, curveMonotoneX } from "d3-shape";
import { scaleLinear } from "d3-scale";
import { type LineDrawProps } from "./schema";
import { COLOR_TOKENS, FONTS, scaleFontSize, RADII_TOKENS } from "../../design/tokens";
import { EASINGS, MOTION_DURATIONS } from "../../design/motion";

export const LineDraw: React.FC<LineDrawProps> = ({
  title,
  subtitle,
  data,
  unitPrefix = "",
  unitSuffix = "",
  color = COLOR_TOKENS.accent,
  peakCallout,
  enterAtFrame = 0,
  exitAtFrame,
}) => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();

  const chartWidth = 1100;
  const chartHeight = 440;
  const padding = { top: 40, right: 50, bottom: 50, left: 70 };

  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;

  // Precompute scales and path generators
  const { linePath, areaPath, points, peakPoint } = useMemo(() => {
    const yValues = data.map((d) => d.y);
    const minY = Math.min(...yValues) * 0.9;
    const maxY = Math.max(...yValues) * 1.1;

    const xScale = scaleLinear()
      .domain([0, data.length - 1])
      .range([0, innerWidth]);

    const yScale = scaleLinear()
      .domain([minY, maxY])
      .range([innerHeight, 0]);

    const pts = data.map((d, i) => ({
      x: xScale(i),
      y: yScale(d.y),
      rawX: d.x,
      rawY: d.y,
    }));

    // Find peak point for annotation
    let peak = pts[0];
    for (const p of pts) {
      if (p.rawY > peak.rawY) peak = p;
    }

    const lineGen = d3Line<{ x: number; y: number }>()
      .x((d) => d.x)
      .y((d) => d.y)
      .curve(curveMonotoneX);

    const areaGen = d3Area<{ x: number; y: number }>()
      .x((d) => d.x)
      .y0(innerHeight)
      .y1((d) => d.y)
      .curve(curveMonotoneX);

    return {
      linePath: lineGen(pts) || "",
      areaPath: areaGen(pts) || "",
      points: pts,
      maxY,
      peakPoint: peak,
    };
  }, [data, innerWidth, innerHeight]);

  // Animation Timings
  const lineStart = enterAtFrame + 6;
  const lineEnd = lineStart + MOTION_DURATIONS.lineDrawFrames;

  const drawProgress = interpolate(frame, [lineStart, lineEnd], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASINGS.outCubic,
  });

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

  // Approximate path length for strokeDashoffset
  const estimatedPathLength = 2200;
  const strokeDashoffset = (1 - drawProgress) * estimatedPathLength;

  // Peak callout entrance (after line reaches peak point)
  const peakCalloutProgress = interpolate(frame, [lineStart + 22, lineStart + 36], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASINGS.outExpo,
  });

  const titleSize = scaleFontSize(52, width);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        maxWidth: chartWidth,
        margin: "0 auto",
        opacity,
        translate: `0px ${translateY}px`,
      }}
    >
      {/* Title */}
      {title && (
        <div style={{ marginBottom: 24 }}>
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

      {/* SVG Chart Container */}
      <div
        style={{
          backgroundColor: COLOR_TOKENS.surface,
          borderRadius: RADII_TOKENS.lg,
          border: `1px solid ${COLOR_TOKENS.surfaceBorder}`,
          padding: 20,
          position: "relative",
        }}
      >
        <svg width={chartWidth} height={chartHeight} style={{ overflow: "visible" }}>
          <defs>
            <linearGradient id="lineAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={color} stopOpacity="0.0" />
            </linearGradient>
            <clipPath id="chartClip">
              <rect x="0" y="0" width={innerWidth * drawProgress} height={innerHeight + 40} />
            </clipPath>
          </defs>

          <g transform={`translate(${padding.left}, ${padding.top})`}>
            {/* Horizontal Grid lines */}
            {[0.25, 0.5, 0.75, 1.0].map((ratio) => (
              <line
                key={ratio}
                x1="0"
                y1={innerHeight * ratio}
                x2={innerWidth}
                y2={innerHeight * ratio}
                stroke={COLOR_TOKENS.surfaceBorder}
                strokeWidth="1"
                strokeDasharray="4 4"
              />
            ))}

            {/* Gradient Area fill */}
            <path
              d={areaPath}
              fill="url(#lineAreaGrad)"
              clipPath="url(#chartClip)"
              opacity={drawProgress}
            />

            {/* Animated Stroke Line */}
            <path
              d={linePath}
              fill="none"
              stroke={color}
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={estimatedPathLength}
              strokeDashoffset={strokeDashoffset}
            />

            {/* Peak Point Annotation Pin */}
            {peakPoint && (
              <g
                transform={`translate(${peakPoint.x}, ${peakPoint.y})`}
                style={{
                  opacity: peakCalloutProgress,
                  scale: `${peakCalloutProgress}`,
                }}
              >
                <circle r="7" fill={color} stroke={COLOR_TOKENS.bg} strokeWidth="3" />
                <circle r="14" fill="none" stroke={color} strokeWidth="1.5" opacity="0.6" />

                {/* Callout Tag */}
                <g transform="translate(0, -32)">
                  <rect
                    x="-80"
                    y="-28"
                    width="160"
                    height="32"
                    rx="6"
                    fill={COLOR_TOKENS.surface2}
                    stroke={color}
                    strokeWidth="1"
                  />
                  <text
                    x="0"
                    y="-8"
                    fill={color}
                    fontSize="18"
                    fontFamily={FONTS.mono}
                    fontWeight="700"
                    textAnchor="middle"
                  >
                    {peakCallout || `${unitPrefix}${peakPoint.rawY}${unitSuffix}`}
                  </text>
                </g>
              </g>
            )}

            {/* X-axis labels */}
            {points.map((p, idx) => (
              <text
                key={idx}
                x={p.x}
                y={innerHeight + 30}
                fill={COLOR_TOKENS.muted}
                fontSize="18"
                fontFamily={FONTS.mono}
                textAnchor="middle"
                opacity={drawProgress}
              >
                {String(p.rawX)}
              </text>
            ))}
          </g>
        </svg>
      </div>
    </div>
  );
};
