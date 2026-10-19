import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { type MoneyFlowProps } from "./schema";
import { COLOR_TOKENS, FONTS, scaleFontSize, RADII_TOKENS } from "../../tokens";
import { EASINGS, MOTION_DURATIONS } from "../../motion";

export const MoneyFlow: React.FC<MoneyFlowProps> = ({
  title,
  subtitle,
  nodes,
  transfers,
  flowColor = COLOR_TOKENS.accent,
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
  const translateY = interpolate(containerEnter, [0, 1], [30, 0]) + interpolate(exitProgress, [0, 1], [0, -20]);

  // Node position coordinates across a horizontal layout
  const diagramWidth = 1200;
  const diagramHeight = 440;
  const nodeWidth = 220;
  const nodeHeight = 130;

  // Evenly space nodes
  const nodePositions: Record<string, { x: number; y: number }> = {};

  nodes.forEach((node, i) => {
    nodePositions[node.id] = {
      x: nodeWidth / 2 + 50 + i * ((diagramWidth - 100 - nodeWidth) / (nodes.length - 1)),
      y: diagramHeight / 2 + 40,
    };
  });

  // Animated particle dash offset
  const dashOffset = (frame * 3.5) % 40;

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
        <div style={{ textAlign: "center", marginBottom: 32 }}>
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

      {/* SVG Diagram Canvas */}
      <div
        style={{
          position: "relative",
          width: diagramWidth,
          height: diagramHeight,
          backgroundColor: COLOR_TOKENS.surface,
          borderRadius: RADII_TOKENS.xl,
          border: `1px solid ${COLOR_TOKENS.surfaceBorder}`,
          overflow: "visible",
        }}
      >
        <svg
          width={diagramWidth}
          height={diagramHeight}
          style={{ position: "absolute", top: 0, left: 0, overflow: "visible" }}
        >
          {/* Transfer Arcs */}
          {transfers.map((t, idx) => {
            const from = nodePositions[t.fromId];
            const to = nodePositions[t.toId];
            if (!from || !to) return null;

            // Start from top edge of source node and land on top edge of target node
            const startX = from.x;
            const endX = to.x;
            const startY = from.y - nodeHeight / 2;
            const endY = to.y - nodeHeight / 2;

            const midX = (startX + endX) / 2;
            const archHeight = 85;
            const peakY = startY - archHeight;

            const pathD = `M ${startX} ${startY} C ${startX + 50} ${peakY}, ${endX - 50} ${peakY}, ${endX} ${endY}`;

            return (
              <g key={idx}>
                {/* Background Guide Line */}
                <path
                  d={pathD}
                  fill="none"
                  stroke={COLOR_TOKENS.surfaceBorder}
                  strokeWidth="4"
                />

                {/* Flowing animated particle dashes */}
                <path
                  d={pathD}
                  fill="none"
                  stroke={flowColor}
                  strokeWidth="4"
                  strokeDasharray="10 10"
                  strokeDashoffset={-dashOffset}
                  strokeLinecap="round"
                />

                {/* Amount Pill floating gracefully above the arch peak */}
                <g transform={`translate(${midX}, ${peakY - 10})`}>
                  <rect
                    x="-80"
                    y="-18"
                    width="160"
                    height="36"
                    rx="8"
                    fill={COLOR_TOKENS.surface2}
                    stroke={flowColor}
                    strokeWidth="1.5"
                  />
                  <text
                    x="0"
                    y="5"
                    fill={flowColor}
                    fontSize="18"
                    fontFamily={FONTS.mono}
                    fontWeight="700"
                    textAnchor="middle"
                  >
                    {t.amountLabel}
                  </text>
                </g>
              </g>
            );
          })}
        </svg>

        {/* Node Cards */}
        {nodes.map((node) => {
          const pos = nodePositions[node.id];
          if (!pos) return null;

          return (
            <div
              key={node.id}
              style={{
                position: "absolute",
                left: pos.x - nodeWidth / 2,
                top: pos.y - nodeHeight / 2,
                width: nodeWidth,
                height: nodeHeight,
                backgroundColor: COLOR_TOKENS.surface2,
                border: `2px solid ${node.color || COLOR_TOKENS.surfaceBorder}`,
                borderRadius: RADII_TOKENS.lg,
                boxShadow: `0 8px 24px rgba(0, 0, 0, 0.45)`,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "12px 18px",
                textAlign: "center",
                zIndex: 2,
              }}
            >
              <div
                style={{
                  fontSize: scaleFontSize(30, width),
                  fontWeight: 700,
                  color: COLOR_TOKENS.text,
                  lineHeight: 1.2,
                }}
              >
                {node.label}
              </div>
              {node.subtext && (
                <div
                  style={{
                    fontSize: scaleFontSize(22, width),
                    color: COLOR_TOKENS.muted,
                    marginTop: 4,
                  }}
                >
                  {node.subtext}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
