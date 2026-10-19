import React from "react";
import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import { Backdrop, Finish, VoiceOver, SceneProvider, tokens } from "@wealthgap/kit";
import { SCENE_REGISTRY } from "./scenes";

export interface TimelineScene {
  id: string;
  slug?: string;
  windowStartFrame: number;
  windowEndFrame: number;
  durationFrames?: number;
  leadFrames?: number;
  voiceStartFrame?: number;
  voiceEndFrame?: number;
  words?: Array<{ text: string; startFrame: number; endFrame: number }>;
}

export interface MainProps {
  timeline?: {
    fps: number;
    width: number;
    height: number;
    durationFrames: number;
    leadMs?: number;
    audioFile?: string;
    scenes: TimelineScene[];
  };
  showVoiceOver?: boolean;
}

export const Main: React.FC<MainProps> = ({ timeline, showVoiceOver = false }) => {
  const { fps, width, height } = useVideoConfig();
  const scenes = timeline?.scenes ?? [];

  return (
    <AbsoluteFill style={{ backgroundColor: tokens.color.bg }}>
      {/* 1. Persistent Backdrop across all scenes */}
      <Backdrop />

      {/* 2. Audio VoiceOver for Studio preview (video-only chunks ignore audio) */}
      {showVoiceOver && timeline?.audioFile && (
        <VoiceOver src={timeline.audioFile} />
      )}

      {/* 3. Sequence per Scene */}
      {scenes.length === 0 ? (
        <AbsoluteFill
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: tokens.color.text,
            fontSize: tokens.type.title,
            fontFamily: tokens.font.display,
          }}
        >
          <span>The Wealth Gap</span>
        </AbsoluteFill>
      ) : (
        scenes.map((sceneData) => {
          const regEntry = SCENE_REGISTRY.find((s) => s.id === sceneData.id);
          const SceneComponent = regEntry ? regEntry.component : () => (
            <AbsoluteFill
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: tokens.color.muted,
                fontSize: 36,
                fontFamily: tokens.font.body,
              }}
            >
              <span>{sceneData.id} — {sceneData.slug || "Scene"}</span>
            </AbsoluteFill>
          );

          const from = sceneData.windowStartFrame ?? 0;
          const windowDuration = Math.max(
            1,
            (sceneData.windowEndFrame ?? (from + 90)) - from
          );

          return (
            <Sequence
              key={sceneData.id}
              from={from}
              durationInFrames={windowDuration}
              premountFor={Math.round(fps * 1)}
              name={sceneData.id}
            >
              <SceneProvider
                value={{
                  id: sceneData.id,
                  fps,
                  width,
                  height,
                  durationFrames: windowDuration,
                  leadFrames: sceneData.leadFrames,
                  voiceStart: sceneData.voiceStartFrame,
                  voiceEnd: sceneData.voiceEndFrame,
                  words: sceneData.words,
                  meta: regEntry?.meta,
                }}
              >
                <SceneComponent />
              </SceneProvider>
            </Sequence>
          );
        })
      )}

      {/* 4. Video Finish Fadeout */}
      <Finish fadeFrames={15} />
    </AbsoluteFill>
  );
};
