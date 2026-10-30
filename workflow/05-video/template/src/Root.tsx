import React, { useEffect } from "react";
import { Composition } from "remotion";
import { END_HOLD_S, ensureFontsLoaded, SceneProvider, Backdrop } from "@wealthgap/kit";
import { Main } from "./Main";
import { SCENE_REGISTRY } from "./scenes";

function loadTimeline(): any {
  try {
    return require("../timeline.json");
  } catch {
    return {
      fps: 30,
      width: 1920,
      height: 1080,
      leadMs: 200,
      durationFrames: 150,
      scenes: [],
    };
  }
}

const timelineData = loadTimeline();

export const RemotionRoot: React.FC = () => {
  useEffect(() => {
    ensureFontsLoaded();
  }, []);

  const fps = timelineData.fps || 30;
  const width = timelineData.width || 1920;
  const height = timelineData.height || 1080;
  const durationInFrames = Math.max(1, timelineData.durationFrames || 150) + Math.round(fps * (timelineData.endHoldS ?? END_HOLD_S));   // + end-card hold (see Main); 0 for shorts

  return (
    <>
      {/* 1. Master Composition */}
      <Composition
        id="Main"
        component={Main}
        durationInFrames={durationInFrames}
        fps={fps}
        width={width}
        height={height}
        defaultProps={{
          timeline: timelineData,
          showVoiceOver: false,
        }}
      />

      {/* 2. One Composition per Scene for isolated preview & per-scene rendering */}
      {timelineData.scenes.map((sceneSlice: any) => {
        const regEntry = SCENE_REGISTRY.find((s) => s.id === sceneSlice.id);
        const SceneComponent = regEntry ? regEntry.component : PlaceholderScene;
        const from = sceneSlice.windowStartFrame ?? 0;
        const to = sceneSlice.windowEndFrame ?? (from + (sceneSlice.durationFrames ?? 90));
        const sceneDuration = Math.max(1, to - from);

        return (
          <Composition
            key={sceneSlice.id}
            id={sceneSlice.id}
            component={() => (
              <SceneProvider
                value={{
                  id: sceneSlice.id,
                  fps,
                  width,
                  height,
                  durationFrames: sceneDuration,
                  leadFrames: sceneSlice.leadFrames,
                  voiceStart: sceneSlice.voiceStartFrame,
                  voiceEnd: sceneSlice.voiceEndFrame,
                  words: sceneSlice.words,
                  meta: regEntry?.meta,
                }}
              >
                <Backdrop />
                <SceneComponent />
              </SceneProvider>
            )}
            durationInFrames={sceneDuration}
            fps={fps}
            width={width}
            height={height}
          />
        );
      })}
    </>
  );
};

const PlaceholderScene: React.FC = () => {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#F4F4F8",
        fontSize: 48,
        fontFamily: "Inter, sans-serif",
      }}
    >
      Scene In Development
    </div>
  );
};
