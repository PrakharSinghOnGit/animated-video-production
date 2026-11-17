import { describe, expect, test } from "bun:test";
import { copiedTitle, readOutliers, readRecipes, swipeExamples, type Outlier } from "./swipe";

const row = (title: string, extra: Partial<Outlier> = {}): Outlier => ({ id: title, title, channel: "c", multiple: 3, views: 1e6, date: "2025-01-01", archetype: "object-hero", faces: "0", facelessFit: 5, layout: "centered hero", palette: "dark+one accent", emotion: "curiosity", devices: [], thumbText: "", idea: "", ...extra });

describe("swipe file", () => {
  test("the committed data and recipes load", () => {
    expect(readOutliers().length).toBeGreaterThan(900);
    expect(readRecipes()).toContain("number-hero");
  });
  test("a title sharing a run of five words with an outlier is a copy; the same shape in new words is not", () => {
    const rows = [row("How Credit Card Companies Really Make Money From You")];
    expect(copiedTitle("Why Credit Card Companies Really Make Money Off Students", 5, rows)).toBe(rows[0].title);
    expect(copiedTitle("How Your Bank Really Makes Money From You", 5, rows)).toBeNull();
    expect(copiedTitle("How Credit Card Companies Really Make Money From You!", 5, rows)).not.toBeNull();
  });
  test("examples: closest by shared words first, then the strongest faceless ones, never twice", () => {
    const rows = [row("Why Rent Keeps Rising", { multiple: 2 }), row("Groceries Are a Scam", { multiple: 9 }), row("The Faceless Winner", { multiple: 20 }), row("A Face", { faces: "1", multiple: 50 })];
    const { related, faceless } = swipeExamples("why is rent so high", 5, 5, rows);
    expect(related.map((r) => r.title)).toEqual(["Why Rent Keeps Rising"]);
    expect(faceless.map((r) => r.title)).toEqual(["The Faceless Winner", "Groceries Are a Scam"]);
  });
});
