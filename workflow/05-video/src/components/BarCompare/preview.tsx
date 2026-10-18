import React from "react";
import { AbsoluteFill } from "remotion";
import { BarCompare } from "./index";
import { UnifiedBackground } from "../../backgrounds/UnifiedBackground";
import fixtures from "./fixtures.json";
import { useFontsLoaded } from "../../design/fonts";

export const BarComparePreview: React.FC = () => {
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
      <UnifiedBackground glowHue="accent2" />
      <div style={{ width: 1200 }}>
        <BarCompare {...(fixture.props as any)} enterAtFrame={0} />
      </div>
    </AbsoluteFill>
  );
};
