import React from "react";
import { Composition } from "remotion";

import { Gallery } from "./compositions/Gallery";
import { BigNumberPreview } from "./components/BigNumber/preview";
import { BarComparePreview } from "./components/BarCompare/preview";
import { LineDrawPreview } from "./components/LineDraw/preview";
import { SizeComparePreview } from "./components/SizeCompare/preview";
import { IconGridPreview } from "./components/IconGrid/preview";
import { MoneyFlowPreview } from "./components/MoneyFlow/preview";
import { TitleCardPreview } from "./components/TitleCard/preview";
import { TermCardPreview } from "./components/TermCard/preview";
import { SourceTagPreview } from "./components/SourceTag/preview";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* Design System & Gallery */}
      <Composition
        id="Gallery"
        component={Gallery}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
      />

      {/* Component Previews */}
      <Composition
        id="BigNumber"
        component={BigNumberPreview}
        durationInFrames={120}
        fps={30}
        width={1920}
        height={1080}
      />

      <Composition
        id="BarCompare"
        component={BarComparePreview}
        durationInFrames={120}
        fps={30}
        width={1920}
        height={1080}
      />

      <Composition
        id="LineDraw"
        component={LineDrawPreview}
        durationInFrames={120}
        fps={30}
        width={1920}
        height={1080}
      />

      <Composition
        id="SizeCompare"
        component={SizeComparePreview}
        durationInFrames={120}
        fps={30}
        width={1920}
        height={1080}
      />

      <Composition
        id="IconGrid"
        component={IconGridPreview}
        durationInFrames={120}
        fps={30}
        width={1920}
        height={1080}
      />

      <Composition
        id="MoneyFlow"
        component={MoneyFlowPreview}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
      />

      <Composition
        id="TitleCard"
        component={TitleCardPreview}
        durationInFrames={120}
        fps={30}
        width={1920}
        height={1080}
      />

      <Composition
        id="TermCard"
        component={TermCardPreview}
        durationInFrames={120}
        fps={30}
        width={1920}
        height={1080}
      />

      <Composition
        id="SourceTag"
        component={SourceTagPreview}
        durationInFrames={90}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
