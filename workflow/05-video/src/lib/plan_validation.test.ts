/** Plan validation (checkActs) beyond the basics in acts.test.ts: every rule the director's plan can break. */
import { describe, expect, test } from "bun:test";
import { checkActs, unverifiedData, ACT_MAX_MS, type ActsPlan, type Caption } from "./acts";

// 200 words, one every second: "w0" … "w199"
const captions: Caption[] = Array.from({ length: 200 }, (_, i) => ({ text: `w${i}`, startMs: i * 1000, endMs: i * 1000 + 600 }));
const beat = (startMs: number, endMs: number, over: Record<string, unknown> = {}) => ({ startMs, endMs, vo: "…", visual: "a line", hits: [], data: [], ...over });
const act = (id: string, startMs: number, endMs: number, over: Record<string, unknown> = {}) => ({
  id, slug: id.toLowerCase(), title: "t", startMs, endMs, idea: "i", sheet: "s", signature: "sig", camera: "push", transitionIn: "cut",
  bpm: 90, intensity: 0.5, beats: [beat(startMs, endMs)], ...over,
});
const plan = (acts: any[]): ActsPlan => ({ video: { id: "T" }, style: "briefing", treatment: {}, acts });
const good = () => [act("A01", 0, 60_000), act("A02", 60_000, 130_000), act("A03", 130_000, 199_600)];
const errs = (acts: any[], opts = {}) => checkActs(plan(acts), captions, [], opts);

describe("checkActs", () => {
  test("the baseline plan is valid", () => expect(errs(good())).toEqual([]));

  test("an empty plan is one clear error", () => expect(errs([])).toEqual(["acts: no acts"]));

  test("the plan must cover the narration from its first word to its last", () => {
    const late = good(); late[0] = act("A01", 5000, 60_000);
    expect(errs(late).join("\n")).toContain("A01: starts at 5000 ms but narration starts at 0 ms");
    const early = good(); early[2] = act("A03", 130_000, 190_000);
    expect(errs(early).join("\n")).toContain("A03: ends at 190000 ms but narration ends at 199600 ms");
  });

  test("ids: the A01 shape and no duplicates", () => {
    const a = good(); a[1] = act("A1", 60_000, 130_000); a[2] = act("A01", 130_000, 199_600);
    const e = errs(a).join("\n");
    expect(e).toContain("A1: id must look like A01");
    expect(e).toContain("A01: duplicate id");
  });

  test("every creative field the act author reads must be filled", () => {
    const a = good(); a[1] = act("A02", 60_000, 130_000, { signature: " ", camera: "" });
    const e = errs(a);
    expect(e).toContain('A02: missing "signature"');
    expect(e).toContain('A02: missing "camera"');
  });

  test("acts are contiguous, within the slack", () => {
    const ok = good(); ok[1] = act("A02", 60_300, 130_000);
    expect(errs(ok)).toEqual([]);
    const gap = good(); gap[1] = act("A02", 62_000, 130_000);
    expect(errs(gap).join("\n")).toContain("A02: starts at 62000 ms but A01 ends at 60000 ms (acts must be contiguous)");
  });

  test("an act longer than the maximum is reported", () => {
    const a = [act("A01", 0, 30_000), act("A02", 30_000, 30_000 + ACT_MAX_MS + 10_000), act("A03", 190_000, 199_600)];
    expect(errs(a).some((x) => x.startsWith("A02:") && x.includes("s long"))).toBe(true);
  });

  test("tempo and intensity ranges", () => {
    const a = good(); a[0] = act("A01", 0, 60_000, { bpm: 140, intensity: 1.4 });
    const e = errs(a);
    expect(e).toContain("A01: bpm 140 outside 70-110");
    expect(e).toContain("A01: intensity must be 0-1");
  });

  test("beats tile the act: start with it, no gaps or overlaps, end with it, and say what is shown", () => {
    const a = good();
    a[1] = act("A02", 60_000, 130_000, { beats: [beat(61_000, 90_000), beat(95_000, 120_000, { visual: "" })] });
    const e = errs(a).join("\n");
    expect(e).toContain("A02.beats[0]: first beat must start at the act start");
    expect(e).toContain("A02.beats[1]: beats must tile the act (gap/overlap at 95000 ms)");
    expect(e).toContain("A02.beats[1]: last beat must end at the act end");
    expect(e).toContain('A02.beats[1]: missing "visual"');
    const none = good(); none[0] = act("A01", 0, 60_000, { beats: [] });
    expect(errs(none)).toContain("A01: no beats");
  });

  test("a hit must be a word spoken inside its own beat (not just somewhere in the act)", () => {
    const a = good();
    a[0] = act("A01", 0, 60_000, { beats: [beat(0, 30_000, { hits: [{ word: "w45", what: "pop" }] }), beat(30_000, 60_000, { hits: [{ word: "w45", what: "pop" }] })] });
    const e = errs(a);
    expect(e).toHaveLength(1);
    expect(e[0]).toContain('A01.beats[0]: hit word "w45" is not spoken between 0 and 30000 ms');
  });

  test("every number on screen needs a source", () => {
    const a = good();
    a[0] = act("A01", 0, 60_000, { beats: [beat(0, 60_000, { data: [{ label: "CPI", value: "3.2", unit: "%", source: "" }, { label: "Rate", value: "5.5", unit: "%", source: "fed.gov" }] })] });
    expect(errs(a)).toEqual(['A01.beats[0]: data "CPI" has no source']);
  });

  test("holds and silences must sit on a word of the act, and a hold is 100-4000 ms", () => {
    const a = good();
    a[1] = act("A02", 60_000, 130_000, { holds: [{ word: "w10", ms: 500 }, { word: "w70", ms: 9000 }], silence: [{ word: "w150", durMs: 400 }] });
    const e = errs(a).join("\n");
    expect(e).toContain('A02: hold word "w10" is not spoken in this act');
    expect(e).toContain('A02: hold after "w70" is 9000 ms (100-4000)');
    expect(e).toContain('A02: silence word "w150" is not spoken in this act');
  });

  test("a short is one act, up to its length limit plus the tail, and may run faster", () => {
    const caps60 = captions.slice(0, 60);
    const one = [act("A01", 0, 59_600, { bpm: 125 })];
    expect(checkActs(plan(one), caps60, [], { short: true })).toEqual([]);
    expect(checkActs(plan(one), caps60).join("\n")).toContain("bpm 125 outside 70-110");   // the same plan as a long video
    expect(checkActs(plan(good()), captions, [], { short: true })[0]).toBe("a short is one act; got 3");
    const long = [act("A01", 0, 100_000)];
    expect(checkActs(plan(long), captions.slice(0, 100), [], { short: true }).some((x) => x.includes("a short's act must be 10-75 s"))).toBe(true);
    expect(checkActs(plan(long), captions.slice(0, 100), [], { short: true, maxS: 120 })).toEqual([]);
  });
});

test("unverifiedData lists the figures whose only source is the narration", () => {
  const a = good();
  a[0] = act("A01", 0, 60_000, { beats: [beat(0, 60_000, { data: [
    { label: "Savings rate", value: "4.4", unit: "%", source: "narration (unverified)" },
    { label: "CPI", value: "3.2", unit: "%", source: "bls.gov" },
    { label: "Median rent", value: "$1,400", source: "Unverified: from the script" },
  ] })] });
  expect(unverifiedData(plan(a))).toEqual(["A01: Savings rate = 4.4 %", "A01: Median rent = $1,400"]);
});
