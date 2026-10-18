import React, { useMemo } from "react";
import { AbsoluteFill, Audio, Sequence, staticFile, useVideoConfig, type CalculateMetadataFunction } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { wipe } from "@remotion/transitions/wipe";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import type { Scene, NormalizedCaption } from "../lib/schema";
import { DynamicScene } from "../scenes/DynamicScene";
import { CaptionBar } from "../captions/CaptionBar";
import { CaptionPop } from "../captions/CaptionPop";
import { msToFrames } from "../lib/timing";

export interface MainProps extends Record<string, unknown> {
  jobId: string;
  scenes: Scene[];
  captions?: NormalizedCaption[];
  audioSrc?: string;
  musicSrc?: string;
  showCaptions?: boolean;
  captionStyle?: "clean-bottom" | "pop-center";
}

function resolvePresentation(type?: string) {
  switch (type) {
    case "fade":
      return fade();
    case "slide":
      return slide();
    case "wipe":
    default:
      return wipe();
  }
}

export const Main: React.FC<MainProps> = ({
  jobId,
  scenes,
  captions = [],
  audioSrc,
  musicSrc,
  showCaptions = true,
  captionStyle = "clean-bottom",
}) => {
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const isVertical = height > width;

  // Resolve voiceover audio path: default to staticFile for the job
  const effectiveAudioSrc = audioSrc || staticFile(`jobs/${jobId}/audio.mp3`);

  // Build scheduled SFX events from storyboard
  const sfxEvents = useMemo(() => {
    const list: { frame: number; sound: string; volume: number }[] = [];
    scenes.forEach((scene) => {
      const sceneStartFrame = msToFrames(scene.startMs, fps);
      const sceneEndFrame = msToFrames(scene.endMs, fps);

      if (scene.sfx && scene.sfx.length > 0) {
        for (const s of scene.sfx) {
          let triggerFrame = sceneStartFrame;
          if (s.at === "scene.start") {
            triggerFrame = sceneStartFrame;
          } else if (s.at === "scene.end") {
            triggerFrame = Math.max(sceneStartFrame, sceneEndFrame - 10);
          } else if (typeof s.at === "number") {
            triggerFrame = msToFrames(scene.startMs + s.at, fps);
          }

          let soundName = s.sound.toLowerCase();
          if (soundName === "uiswitch" || soundName === "ui-switch") soundName = "switch";
          if (soundName === "mouseclick") soundName = "mouse-click";
          if (soundName === "pageturn") soundName = "page-turn";
          if (soundName === "shuttermodern") soundName = "shutter-modern";

          list.push({
            frame: triggerFrame,
            sound: soundName,
            volume: s.volume ?? 0.2,
          });
        }
      }
    });
    return list;
  }, [scenes, fps]);

  return (
    <AbsoluteFill style={{ backgroundColor: "#0B0F14" }}>
      {/* 1. Master Narration Voiceover Audio */}
      {effectiveAudioSrc && <Audio src={effectiveAudioSrc} />}

      {/* 2. Optional Music with Speech Ducking */}
      {musicSrc && (
        <Audio
          src={musicSrc}
          volume={(f) => {
            const fadeIn = Math.min(1, f / fps);
            const fadeOut = Math.min(1, Math.max(0, (durationInFrames - f) / (2 * fps)));
            const masterFade = fadeIn * fadeOut;
            const currentMs = (f / fps) * 1000;
            const isSpeaking = captions.some(
              (c) => currentMs >= c.startMs - 150 && currentMs <= c.endMs + 150
            );
            const baseVol = isSpeaking ? 0.03 : 0.08;
            return baseVol * masterFade;
          }}
        />
      )}

      {/* 3. Programmed Sound Design SFX */}
      {sfxEvents.map((s, idx) => (
        <Sequence
          key={`sfx-${idx}-${s.sound}-${s.frame}`}
          from={s.frame}
          durationInFrames={40}
        >
          <Audio src={staticFile(`sfx/${s.sound}.wav`)} volume={s.volume} />
        </Sequence>
      ))}

      {/* 4. Gapless Visual Scenes via TransitionSeries */}
      <TransitionSeries>
        {scenes.map((scene, i) => {
          const isLast = i === scenes.length - 1;
          const transition = scene.transitionOut;
          const hasTransition = !isLast && transition && transition.type !== "none";
          const tFrames = hasTransition ? (transition.durationFrames ?? 10) : 0;
          const durFrames = msToFrames(scene.endMs - scene.startMs, fps);
          const seqDurFrames = durFrames + tFrames;

          return (
            <React.Fragment key={scene.id}>
              <TransitionSeries.Sequence
                durationInFrames={seqDurFrames}
                premountFor={30}
              >
                <DynamicScene
                  scene={scene}
                  captions={captions}
                  hasCaptions={showCaptions}
                />
              </TransitionSeries.Sequence>
              {hasTransition && (
                <TransitionSeries.Transition
                  presentation={resolvePresentation(transition.type) as any}
                  timing={linearTiming({ durationInFrames: tFrames })}
                />
              )}
            </React.Fragment>
          );
        })}
      </TransitionSeries>

      {/* 5. Subtitle Captions Layer */}
      {showCaptions && (
        isVertical || captionStyle === "pop-center" ? (
          <CaptionPop captions={captions} />
        ) : (
          <CaptionBar captions={captions} />
        )
      )}
    </AbsoluteFill>
  );
};

export const calculateMainMetadata: CalculateMetadataFunction<MainProps> = async ({
  props,
  defaultProps,
}) => {
  const effective = { ...defaultProps, ...props };
  const scenes = effective.scenes || [];
  const fps = 30;

  let totalFrames = 0;
  for (const s of scenes) {
    totalFrames += msToFrames(s.endMs - s.startMs, fps);
  }

  return {
    durationInFrames: Math.max(1, totalFrames),
    fps,
    props: effective,
  };
};
