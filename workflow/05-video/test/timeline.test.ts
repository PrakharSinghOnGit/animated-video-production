import { describe, expect, it } from "bun:test";
import { buildTimeline } from "../src/lib/timelineBuilder";

describe("Timeline Builder", () => {
  const sampleCaptions = [
    { text: "There", startMs: 0, endMs: 200 },
    { text: "is", startMs: 250, endMs: 400 },
    { text: "a", startMs: 450, endMs: 500 },
    { text: "shadow", startMs: 550, endMs: 900 },
    { text: "market", startMs: 950, endMs: 1300 },
    { text: "bigger", startMs: 2000, endMs: 2400 },
    { text: "than", startMs: 2500, endMs: 2700 },
    { text: "crypto", startMs: 3800, endMs: 4200 },
  ];

  const sampleStoryboard = {
    video: { id: "VID_TEST", title: "Test Video" },
    scenes: [
      { id: "S01", slug: "shadow-intro", startMs: 0, endMs: 2800 },
      { id: "S02", slug: "crypto-scale", startMs: 2800, endMs: 4500 },
    ],
  };

  it("calculates frame-accurate windows with default 200ms lead", () => {
    const fps = 30;
    const timeline = buildTimeline(sampleCaptions, sampleStoryboard, { fps, leadMs: 200 });

    expect(timeline.fps).toBe(30);
    expect(timeline.scenes.length).toBe(2);

    const s01 = timeline.scenes[0];
    expect(s01.id).toBe("S01");
    expect(s01.windowStartFrame).toBe(0); // first scene starts at 0
    expect(s01.voiceStartFrame).toBe(0);
    expect(s01.leadFrames).toBe(6); // 200ms * 30 / 1000 = 6 frames

    const s02 = timeline.scenes[1];
    expect(s02.id).toBe("S02");
    // Voice starts at 2800ms = 84 frames. Window starts at 84 - 6 = 78 frames.
    expect(s02.windowStartFrame).toBe(78);
    expect(s02.voiceStartFrame).toBe(6); // 84 - 78 = 6 frames
  });

  it("assigns words relative to scene window start", () => {
    const timeline = buildTimeline(sampleCaptions, sampleStoryboard, { fps: 30, leadMs: 200 });
    const s01 = timeline.scenes[0];

    // "shadow" is at 550ms = frame 17
    const shadowWord = s01.words.find((w) => w.text.toLowerCase() === "shadow");
    expect(shadowWord).toBeDefined();
    expect(shadowWord!.startFrame).toBe(Math.round((550 / 1000) * 30));

    // "crypto" belongs to S02
    const s02 = timeline.scenes[1];
    const cryptoWord = s02.words.find((w) => w.text.toLowerCase() === "crypto");
    expect(cryptoWord).toBeDefined();
    // 3800ms = frame 114 video frame. Window starts at frame 78.
    // 114 - 78 = 36 frames
    expect(cryptoWord!.startFrame).toBe(36);
  });
});
