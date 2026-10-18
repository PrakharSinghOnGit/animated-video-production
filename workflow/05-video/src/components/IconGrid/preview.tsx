import React from "react";
import { AbsoluteFill } from "remotion";
import { IconGrid } from "./index";
import { UnifiedBackground } from "../../backgrounds/UnifiedBackground";
import fixtures from "./fixtures.json";
import { useFontsLoaded } from "../../design/fonts";

export const IconGridPreview: React.FC = () => {
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
      <div style={{ width: 1100 }}>
        <IconGrid {...(fixture.props as any)} enterAtFrame={0} />
      </div>
    </AbsoluteFill>
  );
};
