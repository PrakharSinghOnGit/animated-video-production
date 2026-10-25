import { describe, expect, test } from "bun:test";
import { alignScriptToAsr, matchedFraction, type AsrWord } from "./align";

function asr(words: string[], step = 0.4, t0 = 0): AsrWord[] {
  return words.map((word, i) => ({ word, start: +(t0 + i * step).toFixed(3), end: +(t0 + (i + 1) * step).toFixed(3) }));
}

describe("alignScriptToAsr", () => {
  test("identity: clean ASR copies timings and keeps punctuation", () => {
    const a = asr(["Every", "single", "year,", "money", "moves."]);
    const r = alignScriptToAsr("Every single year, money moves.", a);
    expect(r.map((x) => x.word)).toEqual(["Every", "single", "year,", "money", "moves."]);
    expect(r.every((x) => x.matched)).toBe(true);
    r.forEach((x, i) => {
      expect(x.start).toBeCloseTo(a[i].start, 6);
      expect(x.end).toBeCloseTo(a[i].end, 6);
    });
  });

  test("strips markdown but returns one entry per display token", () => {
    const r = alignScriptToAsr("It is **big** news", asr(["It", "is", "big", "news"]));
    expect(r.map((x) => x.word)).toEqual(["It", "is", "big", "news"]);
  });

  test("VID02 babble: spoken words get timing even when ASR is garbage", () => {
    const heard = ["AFSF", "-10", "allows", "in", "uter", "-Z"];
    const a = asr(heard, 0.5, 1.0); // 1.0 .. 4.0
    const r = alignScriptToAsr("saved up **$10,000**. That's awesome—except", a);
    expect(r.map((x) => x.word)).toEqual(["saved", "up", "$10,000.", "That's", "awesome—", "except"]);
    for (const x of r) {
      expect(Number.isFinite(x.start) && Number.isFinite(x.end)).toBe(true);
      expect(x.start).toBeGreaterThanOrEqual(0);
      expect(x.end).toBeLessThanOrEqual(4.0 + 1e-9);
      expect(x.end).toBeGreaterThanOrEqual(x.start);
    }
    // Mostly garbage: low match rate is the babble signal.
    expect(matchedFraction(r)).toBeLessThan(0.8);
    for (let i = 1; i < r.length; i++) expect(r[i].start).toBeGreaterThanOrEqual(r[i - 1].end - 1e-9);
  });

  test("number: spoken 'ten' aligns to ASR '10'", () => {
    const r = alignScriptToAsr("Ten dollars", asr(["10", "dollars"]));
    expect(r[0].matched).toBe(true);
    expect(r[0].start).toBeCloseTo(0, 6);
    expect(r[1].matched).toBe(true);
  });

  test("currency: ASR '$10,000' expands and matches script '$10,000'", () => {
    const r = alignScriptToAsr("saved $10,000 today", asr(["saved", "$10,000", "today"]));
    expect(r.every((x) => x.matched)).toBe(true);
    expect(r[1].start).toBeCloseTo(0.4, 6);
    expect(r[1].end).toBeCloseTo(0.8, 6); // ASR span is shared across the expansion
    expect(r[2].start).toBeCloseTo(0.8, 6);
  });

  test("fuzzy: 'Appla' aligns to 'Apple'", () => {
    const r = alignScriptToAsr("Apple stock", asr(["Appla", "stock"]));
    expect(r[0].matched).toBe(true);
    expect(r[0].start).toBe(0);
  });

  test("short words are not fuzzy matched", () => {
    const r = alignScriptToAsr("cat", asr(["car"]));
    expect(r[0].matched).toBe(false);
  });

  test("ASR insertion: extra heard word is dropped", () => {
    const r = alignScriptToAsr("one two three", asr(["one", "uh", "two", "three"]));
    expect(r.every((x) => x.matched)).toBe(true);
    expect(r[1].start).toBeCloseTo(0.8, 6);
    expect(r[2].start).toBeCloseTo(1.2, 6);
  });

  test("ASR deletion: missing word is interpolated between neighbours", () => {
    const a: AsrWord[] = [
      { word: "one", start: 0, end: 1 },
      { word: "three", start: 3, end: 4 },
    ];
    const r = alignScriptToAsr("one two three", a);
    expect(r[1].matched).toBe(false);
    expect(r[1].start).toBeCloseTo(1, 6);
    expect(r[1].end).toBeCloseTo(3, 6);
    expect(r[2].matched).toBe(true);
  });

  test("interpolation is proportional to character length", () => {
    const a: AsrWord[] = [
      { word: "go", start: 0, end: 1 },
      { word: "end", start: 5, end: 6 },
    ];
    const r = alignScriptToAsr("go a bbb end", a);
    expect(r[1].end - r[1].start).toBeCloseTo(1, 6);
    expect(r[2].end - r[2].start).toBeCloseTo(3, 6);
  });

  test("empty ASR spreads across clip bounds", () => {
    const r = alignScriptToAsr("alpha beta", [], { clipStart: 0, clipEnd: 2 });
    expect(r[0].start).toBe(0);
    expect(r[1].end).toBeCloseTo(2, 6);
    expect(r.some((x) => x.matched)).toBe(false);
  });

  test("empty script returns nothing", () => {
    expect(alignScriptToAsr("  ", asr(["a"]))).toEqual([]);
  });

  test("monotonic and non-overlapping on shuffled/noisy input", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const vocab = ["market", "stock", "money", "year", "price", "ten", "wall", "street", "apple", "rich"];
    for (let trial = 0; trial < 50; trial++) {
      const script = Array.from({ length: 5 + Math.floor(rnd() * 20) }, () => vocab[Math.floor(rnd() * vocab.length)]);
      const heard = Array.from({ length: 3 + Math.floor(rnd() * 25) }, () => vocab[Math.floor(rnd() * vocab.length)]);
      const r = alignScriptToAsr(script.join(" "), asr(heard, 0.3), { clipEnd: heard.length * 0.3 });
      expect(r.length).toBe(script.length);
      let prev = 0;
      for (const x of r) {
        expect(x.start).toBeGreaterThanOrEqual(prev - 1e-9);
        expect(x.end).toBeGreaterThanOrEqual(x.start);
        prev = x.end;
      }
      expect(prev).toBeLessThanOrEqual(heard.length * 0.3 + 1e-9);
    }
  });
});
