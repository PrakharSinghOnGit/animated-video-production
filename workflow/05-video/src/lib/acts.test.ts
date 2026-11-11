import { describe, expect, test } from "bun:test";
import { checkActs, findWord, actsToStoryboard, planVariety, nativeMoves, castFor, type ActsPlan, type Caption } from "./acts";

// 100 words, one every second: "w0" … "w99", plus a repeated "money" at 10 s and 70 s
const captions: Caption[] = Array.from({ length: 100 }, (_, i) => ({
  text: i === 10 || i === 70 ? "money," : `w${i}`,
  startMs: i * 1000,
  endMs: i * 1000 + 600,
}));

const beat = (startMs: number, endMs: number, hits: any[] = []) => ({ startMs, endMs, vo: "…", visual: "pencil line", hits, data: [] });
const act = (id: string, startMs: number, endMs: number, beats: any[]) => ({
  id, slug: id.toLowerCase(), title: "t", startMs, endMs, idea: "i", sheet: "s", signature: "sig",
  camera: "push", transitionIn: "slide", bpm: 88, intensity: 0.4, beats,
});

const plan = (acts: any[]): ActsPlan => ({ video: { id: "T" }, style: "ledger", treatment: {}, acts });

describe("checkActs", () => {
  test("a valid two-act plan passes", () => {
    const p = plan([
      act("A01", 0, 50_000, [beat(0, 20_000, [{ word: "money", what: "x" }]), beat(20_000, 50_000)]),
      act("A02", 50_000, 99_600, [beat(50_000, 99_600, [{ word: "money", what: "y" }])]),
    ]);
    expect(checkActs(p, captions)).toEqual([]);
  });

  test("short act, gap between acts, missing hit word and unsourced data are reported", () => {
    const p = plan([
      act("A01", 0, 15_000, [beat(0, 15_000, [{ word: "nothing", what: "x" }])]),
      act("A02", 16_000, 99_600, [{ ...beat(16_000, 99_600), data: [{ label: "GDP", value: 1, source: "" }] }]),
    ]);
    const errs = checkActs(p, captions).join("\n");
    expect(errs).toContain("A01: 15 s long");
    expect(errs).toContain("contiguous");
    expect(errs).toContain('hit word "nothing"');
    expect(errs).toContain('data "GDP" has no source');
  });

  test("the cold open may be shorter than a body act, a later act may not", () => {
    const p = plan([
      act("A01", 0, 31_000, [beat(0, 31_000, [{ word: "money", what: "x" }])]),
      act("A02", 31_000, 61_000, [beat(31_000, 61_000)]),
      act("A03", 61_000, 99_600, [beat(61_000, 99_600, [{ word: "money", what: "y" }])]),
    ]);
    const errs = checkActs(p, captions).join("\n");
    expect(errs).not.toContain("A01");
    expect(errs).toContain("A02: 30 s long; acts must be 40-150 s");
    expect(errs).toContain("A03: 39 s long");
  });
});

describe("findWord", () => {
  test("matches punctuation-insensitively and counts occurrences inside the range", () => {
    expect(findWord(captions, "Money", 1, 0, 99_000)?.startMs).toBe(10_000);
    expect(findWord(captions, "money", 2, 0, 99_000)?.startMs).toBe(70_000);
    expect(findWord(captions, "money", 1, 50_000, 99_000)?.startMs).toBe(70_000);
  });
});

test("actsToStoryboard makes one scene per act", () => {
  const sb = actsToStoryboard(plan([act("A01", 0, 50_000, [beat(0, 50_000)])]));
  expect(sb.scenes).toHaveLength(1);
  expect(sb.scenes[0]).toMatchObject({ id: "A01", kind: "act", startMs: 0, endMs: 50_000 });
});

test("each chapter must open an act at its pause, flagged with chapter", () => {
  const two = (a2: any) => plan([act("A01", 0, 50_000, [beat(0, 50_000)]), { ...act("A02", 50_000, 99_600, [beat(50_000, 99_600)]), ...a2 }]);
  const chapters = [{ n: 1, title: "Who owns it", pauseStartMs: 49_700, startMs: 52_000 }];
  expect(checkActs(two({}), captions, chapters).join("\n")).toContain('set "chapter"');
  expect(checkActs(two({ chapter: { n: 1, title: "Who owns it" } }), captions, chapters)).toEqual([]);
  expect(checkActs(two({}), captions, [{ ...chapters[0], pauseStartMs: 70_000 }]).join("\n")).toContain("no act starts at its pause");
});

describe("planVariety", () => {
  const five = (over: (i: number) => any) => plan([0, 1, 2, 3, 4].map((i) => ({ ...act(`A0${i + 1}`, i * 20_000, (i + 1) * 20_000, [beat(i * 20_000, (i + 1) * 20_000)]), ...over(i) })));
  const style = "## 8. Native moves\n- **The chase.** x\n- **Stop-time.** y\n\n## 9. Next\n- **Not a move.** z";

  test("reads the native move names of a style, list or table", () => {
    expect(nativeMoves(style)).toEqual(["chase", "stop time"]);
    expect(nativeMoves("## 8. Native moves (the vocabulary)\n| Move | What |\n|---|---|\n| gear train | gears |\n| tile | cells |\n")).toEqual(["gear train", "tile"]);
  });

  test("a flat, repeating plan gets notes", () => {
    const v = planVariety(five(() => ({ signature: "The chase: money runs", camera: "Wide on the floor → push-in" })), nativeMoves(style));
    const notes = v.notes.join("\n");
    expect(notes).toContain("energy is flat");
    expect(notes).toContain('"chase" is the signature of 5 acts');
    expect(notes).toContain("open on the same camera move");
    expect(notes).toContain("same speed");
  });

  test("a varied plan gets none, and a move name inside another word is not counted", () => {
    const ints = [0.7, 0.3, 0.55, 0.9, 0.4];
    const p = five((i) => ({
      intensity: ints[i], signature: `own move ${i}: the title lands`, camera: `idea ${i} of the camera`, transitionIn: `arrival ${i} from before`, endsOn: "x",
      beats: i % 2 ? [beat(i * 20_000, (i + 1) * 20_000)] : [0, 1, 2, 3].map((j) => beat(i * 20_000 + j * 5000, i * 20_000 + (j + 1) * 5000)),
    }));
    expect(planVariety(p, ["tile", "chase"]).notes).toEqual([]);
  });

  test("castFor gives an act the cast that lists it", () => {
    const p = plan([act("A01", 0, 50_000, [beat(0, 50_000)])]);
    p.treatment = { cast: [{ name: "Saver", look: "hat", acts: ["A01"] }, { name: "Cup", look: "red", acts: ["A02"] }, { name: "Coin", look: "gold" }, "loose text"] };
    expect(castFor(p, "A01").map((c) => c.name)).toEqual(["Saver", "Coin"]);
    expect(castFor(plan([]), "A01")).toEqual([]);
  });
});
