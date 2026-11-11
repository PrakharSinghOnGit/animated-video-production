import { describe, expect, test } from "bun:test";
import { checkBets, checkTitles, titleOverlap, quotePosition, spokenText, axisDistance, type Axes, type Package, type PlanNumbers, type Variant } from "./lib";

const pn: PlanNumbers = { allowed: new Set([149, 98, 103, 2000]), unverified: new Set(), lines: [] };
const ax = (subject: string, emotion: string, text: string, composition: string) => ({ subject, emotion, text, composition }) as Axes;
const pkg = (o: Partial<Package>): Package => ({ title: "", type: "curiosity", rationale: "", thumbnail: "", hypothesis: "", ...o });
const SCRIPT = `### Part 1
**VO:** \`[VO: calm]\` Why can you afford a six-dollar coffee every day, but never a house? Since 2000, TVs got 98% cheaper. Rent went up 149%.
**[ON SCREEN]:** a cup
**VO:** \`[VO: dry]\` You can buy everything in your apartment except the apartment.
${"**VO:** filler words that take time to say and push the rest later in the video.\n".repeat(40)}
**VO:** And at the very end, the question is what do I own.`;
const good: Record<Variant, Package> = {
  A: pkg({ title: "Why Can't You Afford a House?", type: "searchable", lever: "question", axes: ax("object", "threat", "word", "close"), thumbText: "LOCKED OUT", proof: "Why can you afford a six-dollar coffee every day, but never a house?" }),
  B: pkg({ title: "It Was Never the Coffee", type: "curiosity", lever: "myth", axes: ax("character", "curiosity", "none", "scene"), thumbText: "", proof: "You can buy everything in your apartment except the apartment." }),
  C: pkg({ title: "Rent Rose 149% While TVs Fell 98%", type: "number", lever: "number", axes: ax("data", "threat", "number", "split"), thumbText: "SINCE 2000", proof: "Since 2000, TVs got 98% cheaper. Rent went up 149%." }),
};
const ctx = { strict: true, spoken: spokenText(SCRIPT), durationS: 600 };

describe("three bets", () => {
  test("three levers, three subjects, proofs in the script: no errors", () => {
    expect(checkTitles(good, pn, ctx).errors).toEqual([]);
  });
  test("two packages on one lever are rejected", () => {
    const r = checkTitles({ ...good, B: { ...good.B, lever: "question" } }, pn, ctx);
    expect(r.errors.join(" ")).toContain("three different levers");
  });
  test("thumbnails one axis apart are one idea twice", () => {
    const r = checkBets({ A: { axes: ax("object", "threat", "word", "close"), text: "X" }, B: { axes: ax("object", "threat", "word", "split"), text: "Y" } }, "thumbnail");
    expect(r.errors.join(" ")).toContain("differ on 1 of 4 axes");
    expect(axisDistance(good.A.axes!, good.B.axes!)).toBe(4);
  });
  test("the same words on two thumbnails are rejected, with or without axes", () => {
    expect(checkBets({ A: { text: "BAIT" }, B: { text: "bait" } }, "thumbnail", false).errors.join(" ")).toContain("same words");
    expect(checkBets({ A: { text: "BAIT" }, B: { text: "FUEL" } }, "thumbnail", false).errors).toEqual([]);
  });
  test("the text axis must match the words", () => {
    expect(checkBets({ A: { axes: ax("object", "threat", "none", "close"), text: "RENT" } }, "thumbnail").errors.join(" ")).toContain('text axis says "none"');
    expect(checkBets({ A: { axes: ax("object", "threat", "number", "close"), text: "+149%" } }, "thumbnail").errors).toEqual([]);
  });
  test("a title reworded is not a second angle", () => {
    expect(titleOverlap("Why Your Stops Get Hit: Stop Hunting Explained", "Stop Hunting Explained: Why Stops Get Hit")).toBeGreaterThanOrEqual(0.6);
    expect(titleOverlap(good.A.title, good.C.title)).toBeLessThan(0.4);
    const r = checkTitles({ ...good, B: { ...good.B, title: "Why You Can't Afford a House Anymore" } }, pn, ctx);
    expect(r.errors.join(" ")).toContain("one sentence reworded");
  });
  test("thumbnail words that repeat the title, or a number the plan lacks, are rejected", () => {
    expect(checkTitles({ ...good, A: { ...good.A, thumbText: "AFFORD HOUSE" } }, pn, ctx).errors.join(" ")).toContain("repeat the title");
    expect(checkTitles({ ...good, C: { ...good.C, thumbText: "+208%" } }, pn, ctx).errors.join(" ")).toContain("not in the plan's data");
  });
  test("metadata written before the bets format is not held to it", () => {
    const old = Object.fromEntries(Object.entries(good).map(([k, p]) => [k, pkg({ title: p.title, type: p.type })])) as Record<Variant, Package>;
    expect(checkTitles(old, pn).errors).toEqual([]);
  });
});

describe("proof: the script pays the title off", () => {
  test("a quote is found whatever its punctuation and case, and placed in the narration", () => {
    const sp = spokenText(SCRIPT);
    expect(sp).not.toContain("ON SCREEN");
    expect(sp).not.toContain("[VO:");
    expect(quotePosition("since 2000 TVs got 98% cheaper, rent went up 149%", sp)).toBeLessThan(0.1);
    expect(quotePosition("the question is what do I own", sp)).toBeGreaterThan(0.9);
    expect(quotePosition("houses are a scam invented by banks", sp)).toBe(-1);
  });
  test("an invented proof is an error; a late payoff is a warning", () => {
    expect(checkTitles({ ...good, A: { ...good.A, proof: "The banks planned all of this decades ago." } }, pn, ctx).errors.join(" ")).toContain("not in the script");
    const late = checkTitles({ ...good, A: { ...good.A, proof: "And at the very end, the question is what do I own." } }, pn, ctx);
    expect(late.errors).toEqual([]);
    expect(late.warnings.join(" ")).toContain("pays off this title at about");
  });
});
