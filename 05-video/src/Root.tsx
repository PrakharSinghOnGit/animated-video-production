import React from "react";
import { Composition } from "remotion";
import { Gallery } from "./compositions/Gallery";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Gallery"
        component={Gallery}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
