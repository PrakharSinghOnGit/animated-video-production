import { describe, expect, test } from "bun:test";
import { checkConcepts, chosenMarkdown, conceptsMarkdown, type ConceptSet } from "./concepts";

const c = (o: any) => ({ title: "Why Your Rent Never Comes Back Down", lever: "stake", axes: { subject: "character", emotion: "threat", text: "word", composition: "close" }, thumbText: "NOT YOUR FAULT", thumbnail: "x", gap: "g", opens: "o", mustProve: ["rents rose faster than wages in official data"], kill: "k", why: "w", ...o });
const five = () => [
  c({}),
  c({ title: "Who Gets Paid When Prices Go Up?", lever: "villain", axes: { subject: "object", emotion: "curiosity", text: "none", composition: "scene" }, thumbText: "" }),
  c({ title: "The Budget Advice That Was Never True", lever: "myth", axes: { subject: "object", emotion: "payoff", text: "word", composition: "split" }, thumbText: "SKIP THIS" }),
  c({ title: "Groceries Are Up {X}% and Wages Are Not", lever: "number", axes: { subject: "data", emotion: "threat", text: "number", composition: "split" }, thumbText: "{X}% GONE" }),
  c({ title: "Why Is Everything Still So Expensive?", lever: "question", axes: { subject: "type", emotion: "curiosity", text: "word", composition: "close" }, thumbText: "SINCE WHEN?" }),
];

describe("packages first: checks before any source exists", () => {
  test("five different bets with slots for unsourced figures pass", () => {
    expect(checkConcepts(five(), "why prices stay high").errors).toEqual([]);
  });
  test("an invented figure is rejected; the creator's own figure and a {slot} are not", () => {
    const f = five(); f[3].title = "Groceries Are Up 25% and Wages Are Not";
    expect(checkConcepts(f, "why prices stay high").errors.join(" ")).toContain("figure 25 is not in the creator's topic or note");
    expect(checkConcepts(f, "groceries are up 25% since the pandemic").errors).toEqual([]);
    const y = five(); y[0].title = "Why Rent Broke Away From Wages in 2000";
    expect(checkConcepts(y, "rent").errors.join(" ")).toContain("figure 2000");
  });
  test("a slot needs its claim, and every concept needs something to prove", () => {
    const f = five(); f[3].mustProve = [];
    const e = checkConcepts(f, "x").errors.join(" ");
    expect(e).toContain("{slot} needs the claim");
    expect(e).toContain("mustProve is empty");
  });
  test("one bet repeated, one picture repeated, a label for a title: rejected", () => {
    const f = five(); f[1].lever = "stake"; f[2].lever = "stake";
    expect(checkConcepts(f, "x").errors.join(" ")).toContain("3 different levers");
    const g = five(); g[1].axes = { ...g[0].axes }; g[1].thumbText = "TOO LATE";
    expect(checkConcepts(g, "x").errors.join(" ")).toContain("identical axes");
    const h = five(); h[4].title = "Sticky Prices Explained";
    expect(checkConcepts(h, "x").errors.join(" ")).toContain("is a label, not a promise");
    const k = five(); k[0].thumbText = "RENT NEVER";
    expect(checkConcepts(k, "x").errors.join(" ")).toContain("repeat the title");
    expect(checkConcepts(five().slice(0, 4), "x").errors.join(" ")).toContain("exactly 5");
  });
  test("the chosen package is written for the writer with what it must prove", () => {
    const s: ConceptSet = { key: "C01", topic: "t", note: "", at: "2026-11-11T00:00:00Z", model: "m", costUsd: 0.1, stake: "s", concepts: five() as any, pick: 1, verdict: { strong: true, note: "n" }, warnings: [], chosen: 4 };
    const md = chosenMarkdown(s, 4);
    expect(md).toMatch(/^## Chosen package/);
    expect(md).toContain("Groceries Are Up {X}%");
    expect(md).toContain("rents rose faster than wages");
    expect(conceptsMarkdown(s)).toContain("← chosen");
  });
});
