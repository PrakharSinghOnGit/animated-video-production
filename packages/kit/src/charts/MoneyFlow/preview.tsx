import React from "react";
import { AbsoluteFill } from "remotion";
import { MoneyFlow } from "./index";
import { UnifiedBackground } from "../../backgrounds/UnifiedBackground";
import fixtures from "./fixtures.json";
import { useFontsLoaded } from "../../fonts";

export const MoneyFlowPreview: React.FC = () => {
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
      <div style={{ width: 1300 }}>
        <MoneyFlow {...(fixture.props as any)} enterAtFrame={0} />
      </div>
    </AbsoluteFill>
  );
};
