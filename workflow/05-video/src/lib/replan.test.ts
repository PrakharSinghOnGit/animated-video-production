import { describe, expect, test } from "bun:test";
import { capWords, matchWords, spoken, timeMap } from "./replan";
import type { Caption } from "./acts";

const W = (s: string) => s.split(" ");
const caps = (s: string, stepMs = 500): Caption[] => W(s).map((text, i) => ({ text, startMs: i * stepMs, endMs: i * stepMs + 300 }));

describe("matchWords", () => {
  test("identical lists pair one to one", () => {
    const m = matchWords(W("a b c d"), W("a b c d"));
    expect([...m.oldToNew]).toEqual([0, 1, 2, 3]);
    expect([...m.newToOld]).toEqual([0, 1, 2, 3]);
  });

  test("a rewritten middle keeps the words around it as anchors", () => {
    const m = matchWords(W("the fed raised rates last year and markets fell"), W("the fed cut rates twice this year and markets fell"));
    expect([...m.oldToNew]).toEqual([0, 1, -1, 3, -1, 6, 7, 8, 9]);
    expect(m.newToOld[2]).toBe(-1);   // "cut" is new
    expect(m.newToOld[4]).toBe(-1);   // "twice" is new
  });

  test("words added at the start or removed from the end leave the rest matched", () => {
    expect([...matchWords(W("b c"), W("a b c")).oldToNew]).toEqual([1, 2]);
    expect([...matchWords(W("a b c"), W("a b")).oldToNew]).toEqual([0, 1, -1]);
  });

  test("the pairing never crosses: matched words keep their order", () => {
    const m = matchWords(W("x a b a c y"), W("a c a b y x"));
    const pairs = [...m.oldToNew].map((n, o) => [o, n]).filter(([, n]) => n >= 0);
    for (let i = 1; i < pairs.length; i++) expect(pairs[i][1]).toBeGreaterThan(pairs[i - 1][1]);
    for (const [o, n] of pairs) expect(m.newToOld[n]).toBe(o);
  });

  test("nothing in common, or an empty side, matches nothing", () => {
    expect([...matchWords(W("a b"), W("c d")).oldToNew]).toEqual([-1, -1]);
    expect([...matchWords([], W("a")).newToOld]).toEqual([-1]);
  });
});

describe("timeMap", () => {
  test("no anchors: times stay where they are", () => expect(timeMap([])(1234)).toBe(1234));

  test("linear between anchors, a constant shift before the first and after the last", () => {
    const map = timeMap([[1000, 1500], [3000, 5500]]);
    expect(map(1000)).toBe(1500);
    expect(map(2000)).toBe(3500);
    expect(map(3000)).toBe(5500);
    expect(map(0)).toBe(500);
    expect(map(4000)).toBe(6500);
  });

  test("anchors that would run time backwards, and repeated old times, are ignored", () => {
    const map = timeMap([[3000, 3200], [1000, 1000], [2000, 900], [1000, 4000]]);
    expect(map(2000)).toBe(2100);   // halfway between (1000 → 1000) and (3000 → 3200)
    let last = -Infinity;
    for (let t = 0; t <= 5000; t += 50) { const v = map(t); expect(v).toBeGreaterThanOrEqual(last); last = v; }
  });

  test("a pause added mid-narration moves every later plan time by its length", () => {
    const before = caps("one two three four five six");
    const after = before.map((c, i) => (i >= 3 ? { ...c, startMs: c.startMs + 800, endMs: c.endMs + 800 } : c));
    const m = matchWords(capWords(before), capWords(after));
    const map = timeMap([...m.oldToNew].flatMap((n, o) => (n >= 0 ? [[before[o].startMs, after[n].startMs] as [number, number]] : [])));
    expect(map(before[1].startMs)).toBe(before[1].startMs);
    expect(map(before[4].startMs)).toBe(before[4].startMs + 800);
    expect(map(99_000)).toBe(99_800);
  });
});

test("spoken: the words whose middle falls inside the range, in order", () => {
  const c = caps("alpha beta gamma delta");
  expect(spoken(c, 0, 1000)).toBe("alpha beta");
  // middles are 150, 650, 1150, 1650 and the range is [from, to): beta is in, delta is out
  expect(spoken(c, 650, 1650)).toBe("beta gamma");
  expect(spoken(c, 5000, 6000)).toBe("");
});

test("capWords normalises punctuation and case, so 'Money,' anchors 'money'", () => {
  expect(capWords([{ text: "Money,", startMs: 0, endMs: 1 }, { text: "$10,000!", startMs: 1, endMs: 2 }])).toEqual(["money", "10000"]);
});
