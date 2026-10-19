import { describe, expect, it } from "bun:test";
import { lintSceneCode } from "@wealthgap/kit";

describe("Scene Lint Rules", () => {
  const validSceneCode = `
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { useScene, Camera, MorphShape, shapes, Label, tokens } from "@wealthgap/kit";

export const meta = {
  id: "S01",
  title: "Valid Scene",
  numbers: [],
  sfx: [{ anchor: "shadow", sound: "whoosh", volume: 0.2 }],
};

export default function S01() {
  const frame = useCurrentFrame();
  const s = useScene();
  const R = 300;

  return (
    <AbsoluteFill>
      <Camera scale={1.0} focus={[0, 0]}>
        <MorphShape radius={R} shape={shapes.blob(0)} rim={{ width: 8, spin: 0 }} />
      </Camera>
      <Label text="SHADOW MARKET" x={960} y={540} in={s.word("shadow").start} />
    </AbsoluteFill>
  );
}
`;

  it("passes for valid scene code adhering to all guidelines", () => {
    const result = lintSceneCode(validSceneCode, "S01_valid.tsx", ["shadow", "market"]);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it("catches forbidden external or relative imports", () => {
    const badCode = validSceneCode.replace(
      'from "@wealthgap/kit"',
      'from "lodash"'
    );
    const result = lintSceneCode(badCode, "S01_test.tsx");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "BANNED_IMPORT")).toBe(true);
  });

  it("catches non-deterministic Math.random() calls", () => {
    const badCode = validSceneCode.replace(
      "const R = 300;",
      "const R = 300 + Math.random() * 50;"
    );
    const result = lintSceneCode(badCode, "S01_test.tsx");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "BANNED_RANDOM")).toBe(true);
  });

  it("catches raw hex colors in scene JSX/styles", () => {
    const badCode = validSceneCode.replace(
      "const R = 300;",
      'const color = "#FF5A5F";'
    );
    const result = lintSceneCode(badCode, "S01_test.tsx");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "RAW_HEX_COLOR")).toBe(true);
  });

  it("catches CSS transitions and animations", () => {
    const badCode = validSceneCode.replace(
      "const R = 300;",
      'const style = { transition: "all 0.3s ease" };'
    );
    const result = lintSceneCode(badCode, "S01_test.tsx");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "BANNED_CSS_ANIMATION")).toBe(true);
  });

  it("catches opaque background on AbsoluteFill", () => {
    const badCode = validSceneCode.replace(
      "<AbsoluteFill>",
      '<AbsoluteFill style={{ backgroundColor: "#101010" }}>'
    );
    const result = lintSceneCode(badCode, "S01_test.tsx");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "OPAQUE_BACKGROUND")).toBe(true);
  });
});
