import React from "react";
import { AbsoluteFill } from "remotion";
import { SourceTag } from "./index";
import { UnifiedBackground } from "../../backgrounds/UnifiedBackground";
import fixtures from "./fixtures.json";
import { useFontsLoaded } from "../../fonts";

export const SourceTagPreview: React.FC = () => {
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
      <SourceTag {...(fixture.props as any)} enterAtFrame={0} />
    </AbsoluteFill>
  );
};
