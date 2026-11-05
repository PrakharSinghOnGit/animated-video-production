import React from "react";
import { AbsoluteFill, Freeze, Sequence, useVideoConfig } from "remotion";
import { Backdrop, END_HOLD_S, Finish, VoiceOver, SceneProvider, tokens, type SceneContextData } from "@wealthgap/kit";
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
  /** seam plan from `bun run seams` (one owner per seam, neighbour frames in public/seams/) */
  seams?: SceneContextData["seams"];
  /** the music's beats in the scene's seconds (bun run music:beat) */
  music?: SceneContextData["music"];
}

export interface MainProps {
  timeline?: {
    fps: number;
    width: number;
    height: number;
    durationFrames: number;
    leadMs?: number;
    /** seconds the last frame holds after the narration (default END_HOLD_S; shorts use 0 so they loop) */
    endHoldS?: number;
    /** frames of fade to black at the very end (default 15; shorts use 0) */
    fadeOutFrames?: number;
    audioFile?: string;
    scenes: TimelineScene[];
  };
  showVoiceOver?: boolean;
}

export const Main: React.FC<MainProps> = ({ timeline, showVoiceOver = false }) => {
  const { fps, width, height } = useVideoConfig();
  const scenes = timeline?.scenes ?? [];
  // The timeline ends at endFrame; the root adds END_HOLD_S after it. The last scene (clipped at endFrame) runs on through the hold, frozen on its final frame (a Freeze only reaches frames inside its Sequence, so one Sequence covers both).
  const endFrame = timeline?.durationFrames ?? 0;
  const lastScene = scenes.reduce<TimelineScene | undefined>((m, x) => (!m || (x.windowEndFrame ?? 0) > (m.windowEndFrame ?? 0) ? x : m), undefined);
  const lastDur = lastScene ? Math.max(1, Math.min(lastScene.windowEndFrame, endFrame) - lastScene.windowStartFrame) : 1;

  const renderScene = (sceneData: TimelineScene, durOverride?: number, freezeAt?: number) => {
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
        (sceneData.windowEndFrame ?? ((sceneData.windowStartFrame ?? 0) + 90)) - (sceneData.windowStartFrame ?? 0)
      );

      return (
        <Sequence
          key={sceneData.id}
          from={from}
          durationInFrames={durOverride ?? windowDuration}
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
              seams: sceneData.seams,
              music: sceneData.music,
              meta: regEntry?.meta,
            }}
          >
            {freezeAt === undefined ? <SceneComponent /> : <Freeze frame={freezeAt} active={(f) => f >= freezeAt}><SceneComponent /></Freeze>}
          </SceneProvider>
        </Sequence>
      );
  };

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
        <>
          {scenes.map((sceneData) => sceneData === lastScene ? renderScene(sceneData, lastDur + Math.round(fps * (timeline?.endHoldS ?? END_HOLD_S)), lastDur - 1) : renderScene(sceneData))}
        </>
      )}

      {/* 4. Video Finish Fadeout */}
      {(timeline?.fadeOutFrames ?? 15) > 0 && <Finish fadeFrames={timeline?.fadeOutFrames ?? 15} />}
    </AbsoluteFill>
  );
};
