import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { Scene, NormalizedCaption } from "../lib/schema";
import { COMPONENT_REGISTRY } from "../lib/registry";
import { UnifiedBackground } from "../backgrounds/UnifiedBackground";
import { SourceTag } from "../components/SourceTag";
import { getSafeBounds } from "../design/layout";
import { CAMERA_RULES, EASINGS } from "../design/motion";
import { msToFrames, resolveAnchorMs } from "../lib/timing";

export interface DynamicSceneProps {
  scene: Scene;
  captions?: NormalizedCaption[];
  hasCaptions?: boolean;
}

export const DynamicScene: React.FC<DynamicSceneProps> = ({
  scene,
  captions = [],
  hasCaptions = false,
}) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();

  const durFrames = Math.max(1, msToFrames(scene.endMs - scene.startMs, fps));

  // Subtle ambient camera push-in
  const cameraScale = interpolate(
    frame,
    [0, durFrames],
    [CAMERA_RULES.startScale, CAMERA_RULES.endScale],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASINGS.outCubic,
    }
  );

  const safe = getSafeBounds(width, height, hasCaptions);

  // Background layers configuration
  const bgProps = scene.layers.background?.props || {};
  const midProps = scene.layers.midground?.props || {};

  const glowHue = (midProps.hue as any) || "accent";
  const glowIntensity = typeof midProps.intensity === "number" ? midProps.intensity : 0.22;
  const gridIntensity = typeof bgProps.intensity === "number" ? bgProps.intensity : 0.8;

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {/* Layer 1: Unified Atmospheric Background */}
      <UnifiedBackground
        glowHue={glowHue}
        glowIntensity={glowIntensity}
        gridIntensity={gridIntensity}
      />

      {/* Layer 2: Foreground Motion Group with Camera Push */}
      <div
        style={{
          width: "100%",
          height: "100%",
          transform: `scale(${cameraScale})`,
          transformOrigin: "center center",
          position: "relative",
        }}
      >
        {scene.layers.foreground?.map((elem, idx) => {
          const entry = COMPONENT_REGISTRY[elem.component];
          if (!entry) {
            console.warn(`[DynamicScene] Unregistered component: ${elem.component}`);
            return null;
          }

          const Component = entry.component;

          // Anchor frame resolution
          const resolvedAnchorFrames: Record<string, number> = {};
          if (elem.anchors && captions.length > 0) {
            for (const anchor of elem.anchors) {
              const { resolvedMs } = resolveAnchorMs(
                anchor.word,
                anchor.occurrence ?? 1,
                captions,
                scene.startMs,
                scene.endMs
              );
              const relMs = resolvedMs - scene.startMs;
              const anchorFrame = msToFrames(relMs, fps) + (anchor.offsetFrames ?? 0);
              resolvedAnchorFrames[anchor.action] = anchorFrame;
            }
          }

          const componentProps: Record<string, any> = {
            ...elem.props,
            anchorFrames: resolvedAnchorFrames,
          };

          // Wire count-up landing if countUp.end anchor is present
          if (resolvedAnchorFrames["countUp.end"] !== undefined) {
            componentProps.landingFrame = resolvedAnchorFrames["countUp.end"];
          }

          // Relative enter timing
          if (elem.enterAtMs !== undefined) {
            componentProps.enterAtFrame = msToFrames(elem.enterAtMs - scene.startMs, fps);
          }

          // Relative exit timing
          if (elem.exitAtMs !== undefined) {
            componentProps.exitAtFrame = msToFrames(elem.exitAtMs - scene.startMs, fps);
          }

          return (
            <Component
              key={`${elem.component}-${idx}`}
              {...componentProps}
            />
          );
        })}
      </div>

      {/* Institutional Citation Source Tag */}
      {scene.sourceTag && (
        <div
          style={{
            position: "absolute",
            bottom: safe.safeBottom + 8,
            right: safe.safeRight,
            zIndex: 40,
          }}
        >
          <SourceTag
            text={scene.sourceTag.text}
            dataRef={scene.sourceTag.dataRef}
            enterAtFrame={15}
          />
        </div>
      )}
    </AbsoluteFill>
  );
};
