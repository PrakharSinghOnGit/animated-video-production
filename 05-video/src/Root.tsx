import React from "react";
import { Composition } from "remotion";

import { Gallery } from "./compositions/Gallery";
import { Main, calculateMainMetadata } from "./compositions/Main";
import { DynamicScene } from "./scenes/DynamicScene";
import { BigNumberPreview } from "./components/BigNumber/preview";
import { BarComparePreview } from "./components/BarCompare/preview";
import { LineDrawPreview } from "./components/LineDraw/preview";
import { SizeComparePreview } from "./components/SizeCompare/preview";
import { IconGridPreview } from "./components/IconGrid/preview";
import { MoneyFlowPreview } from "./components/MoneyFlow/preview";
import { TitleCardPreview } from "./components/TitleCard/preview";
import { TermCardPreview } from "./components/TermCard/preview";
import { SourceTagPreview } from "./components/SourceTag/preview";
import { msToFrames } from "./lib/timing";

// Default fixture data for Studio preview
import sampleScenes from "../fixtures/sample-job/output/scenes.json";
import sampleCaptions from "../fixtures/sample-job/output/captions.json";

export const RemotionRoot: React.FC = () => {
  const fps = 30;
  const totalFrames = msToFrames(sampleScenes.totalDurationMs, fps);

  return (
    <>
      {/* 1. Master Explainer Video Composition */}
      <Composition
        id="Main"
        component={Main as any}
        calculateMetadata={calculateMainMetadata as any}
        defaultProps={{
          jobId: sampleScenes.jobId,
          scenes: sampleScenes.scenes as any,
          captions: sampleCaptions as any,
          showCaptions: true,
          captionStyle: "clean-bottom",
        }}
        durationInFrames={totalFrames}
        fps={fps}
        width={1920}
        height={1080}
      />

      {/* 2. Connected Individual Scene Compositions */}
      {sampleScenes.scenes.map((scene) => {
        const durFrames = Math.max(1, msToFrames(scene.endMs - scene.startMs, fps));
        return (
          <Composition
            key={`Scene-${scene.id}`}
            id={`Scene-${scene.id}`}
            component={DynamicScene as any}
            defaultProps={{
              scene: scene as any,
              captions: sampleCaptions as any,
              hasCaptions: true,
            }}
            durationInFrames={durFrames}
            fps={fps}
            width={1920}
            height={1080}
          />
        );
      })}

      {/* 3. Design System & Component Gallery */}
      <Composition
        id="Gallery"
        component={Gallery}
        durationInFrames={150}
        fps={fps}
        width={1920}
        height={1080}
      />

      {/* 4. Component Previews */}
      <Composition
        id="BigNumber"
        component={BigNumberPreview}
        durationInFrames={120}
        fps={fps}
        width={1920}
        height={1080}
      />

      <Composition
        id="BarCompare"
        component={BarComparePreview}
        durationInFrames={120}
        fps={fps}
        width={1920}
        height={1080}
      />

      <Composition
        id="LineDraw"
        component={LineDrawPreview}
        durationInFrames={120}
        fps={fps}
        width={1920}
        height={1080}
      />

      <Composition
        id="SizeCompare"
        component={SizeComparePreview}
        durationInFrames={120}
        fps={fps}
        width={1920}
        height={1080}
      />

      <Composition
        id="IconGrid"
        component={IconGridPreview}
        durationInFrames={120}
        fps={fps}
        width={1920}
        height={1080}
      />

      <Composition
        id="MoneyFlow"
        component={MoneyFlowPreview}
        durationInFrames={150}
        fps={fps}
        width={1920}
        height={1080}
      />

      <Composition
        id="TitleCard"
        component={TitleCardPreview}
        durationInFrames={120}
        fps={fps}
        width={1920}
        height={1080}
      />

      <Composition
        id="TermCard"
        component={TermCardPreview}
        durationInFrames={120}
        fps={fps}
        width={1920}
        height={1080}
      />

      <Composition
        id="SourceTag"
        component={SourceTagPreview}
        durationInFrames={90}
        fps={fps}
        width={1920}
        height={1080}
      />
    </>
  );
};
