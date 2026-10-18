import React from "react";
import { AbsoluteFill } from "remotion";
import { BigNumber } from "./index";
import { UnifiedBackground } from "../../backgrounds/UnifiedBackground";
import fixtures from "./fixtures.json";
import { useFontsLoaded } from "../../design/fonts";

export const BigNumberPreview: React.FC = () => {
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
      <div style={{ width: 1400 }}>
        <BigNumber {...fixture.props} enterAtFrame={0} />
      </div>
    </AbsoluteFill>
  );
};
