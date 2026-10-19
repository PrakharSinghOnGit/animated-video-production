import React from "react";
import { AbsoluteFill } from "remotion";
import { Globe3D } from "./index";
import { UnifiedBackground } from "../../backgrounds/UnifiedBackground";
import fixtures from "./fixtures.json";
import { useFontsLoaded } from "../../fonts";

export const Globe3DPreview: React.FC = () => {
  const fontsLoaded = useFontsLoaded();
  const fixture = fixtures[0];

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: fontsLoaded ? 1 : 0,
      }}
    >
      <UnifiedBackground glowHue="accent" />
      <Globe3D {...fixture.props} enterAtFrame={0} />
    </AbsoluteFill>
  );
};
