import { describe, expect, it } from "bun:test";
import { validateStoryboard } from "../src/lib/storyboardValidator";

describe("Storyboard Validation", () => {
  const validStoryboard = {
    schemaVersion: 1,
    video: { id: "VID_TEST", title: "Valid Test" },
    videoArc: {
      summary: "Macro introduction to the shadow market.",
    },
    scenes: [
      {
        id: "S01",
        slug: "giant-shadow",
        startMs: 0,
        endMs: 5000,
        vo: "There is a shadow market out there bigger than stocks",
        claim: "The shadow market dwarfs public stock exchanges.",
        relationship: "scale dominance",
        metaphor: "A dark organic morphing blob swells on screen with pastel rim lighting.",
        hero: "The mass swells and ripples outwards as the label reveals.",
        layout: "Central mass with surrounding floating cards.",
        camera: "Pull back from 2.0x macro to 1.0x master view.",
        beats: [
          { anchor: "shadow", occurrence: 1, offsetMs: -100, action: "Label builds letter by letter" },
          { anchor: "bigger", occurrence: 1, offsetMs: 0, action: "Mass swells with outward ripple" },
        ],
        palette: ["lav", "mint"],
        data: [{ value: "$9.6T", label: "Daily Volume", source: "BIS 2025 Survey" }],
        sfx: [{ anchor: "bigger", sound: "whoosh", volume: 0.3 }],
      },
      {
        id: "S02",
        slug: "crypto-change",
        startMs: 5000,
        endMs: 9500,
        vo: "Making crypto look like loose change",
        claim: "Crypto is tiny in comparison.",
        relationship: "contrast",
        metaphor: "A small gem spins inside a vast panel.",
        hero: "Coin flips and lands into a jar.",
        layout: "Split screen comparison.",
        camera: "Dive into small gem.",
        beats: [{ anchor: "crypto", occurrence: 1, offsetMs: 0, action: "Gem glints and rotates" }],
        palette: ["peach", "butter"],
        data: [],
        sfx: [],
      },
    ],
  };

  it("passes for a valid storyboard", () => {
    const result = validateStoryboard(validStoryboard);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it("rejects broken storyboard with timeline gap", () => {
    const broken = JSON.parse(JSON.stringify(validStoryboard));
    // Introduce a 1000ms gap between S01 and S02
    broken.scenes[1].startMs = 6000;
    const result = validateStoryboard(broken);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "TIMELINE_GAP_OR_OVERLAP")).toBe(true);
  });

  it("rejects anchor words not in narration", () => {
    const broken = JSON.parse(JSON.stringify(validStoryboard));
    broken.scenes[0].beats[0].anchor = "extraterrestrial";
    const result = validateStoryboard(broken);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "MISSING_ANCHOR_WORD")).toBe(true);
  });

  it("rejects unsourced data numbers", () => {
    const broken = JSON.parse(JSON.stringify(validStoryboard));
    broken.scenes[0].data[0].source = "";
    const result = validateStoryboard(broken);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "SCHEMA_VALIDATION_ERROR")).toBe(true);
  });

  it("rejects banned motion wording ('fades in')", () => {
    const broken = JSON.parse(JSON.stringify(validStoryboard));
    broken.scenes[0].metaphor = "A title fades in from the top.";
    const result = validateStoryboard(broken);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "BANNED_MOTION_WORDING")).toBe(true);
  });
});
