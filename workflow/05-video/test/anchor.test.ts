import { describe, expect, it } from "bun:test";

function cleanWord(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function resolveWordAnchor(
  words: Array<{ text: string; startFrame: number; endFrame: number }>,
  target: string,
  occurrence: number = 1,
  durationFrames: number = 100
) {
  const cleanTarget = cleanWord(target);
  const matches = words.filter((w) => cleanWord(w.text) === cleanTarget);

  if (matches.length >= occurrence) {
    const found = matches[occurrence - 1];
    return {
      found: true,
      start: found.startFrame,
      end: found.endFrame,
      mid: Math.round((found.startFrame + found.endFrame) / 2),
    };
  }

  const mid = Math.round(durationFrames / 2);
  return { found: false, start: mid, end: mid, mid };
}

describe("Word Anchor Resolution", () => {
  const words = [
    { text: "There", startFrame: 0, endFrame: 6 },
    { text: "is", startFrame: 8, endFrame: 12 },
    { text: "a", startFrame: 14, endFrame: 16 },
    { text: "Shadow,", startFrame: 18, endFrame: 28 }, // has punctuation and capital
    { text: "market...", startFrame: 30, endFrame: 40 },
    { text: "bigger", startFrame: 60, endFrame: 72 }, // occurrence 1
    { text: "than", startFrame: 74, endFrame: 80 },
    { text: "BIGGER", startFrame: 110, endFrame: 122 }, // occurrence 2
  ];

  it("matches case-insensitively with stripped punctuation", () => {
    const res = resolveWordAnchor(words, "shadow");
    expect(res.found).toBe(true);
    expect(res.start).toBe(18);
    expect(res.end).toBe(28);
    expect(res.mid).toBe(23);

    const res2 = resolveWordAnchor(words, "MARKET!");
    expect(res2.found).toBe(true);
    expect(res2.start).toBe(30);
  });

  it("handles multiple occurrences accurately", () => {
    const occ1 = resolveWordAnchor(words, "bigger", 1);
    expect(occ1.found).toBe(true);
    expect(occ1.start).toBe(60);

    const occ2 = resolveWordAnchor(words, "bigger", 2);
    expect(occ2.found).toBe(true);
    expect(occ2.start).toBe(110);
  });

  it("falls back to scene midpoint when word is missing", () => {
    const res = resolveWordAnchor(words, "nonexistent", 1, 240);
    expect(res.found).toBe(false);
    expect(res.start).toBe(120);
    expect(res.mid).toBe(120);
  });
});
