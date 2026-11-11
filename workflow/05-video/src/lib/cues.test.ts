import { describe, expect, test } from "bun:test";
import { applySfxEdits, type FoleyEvent } from "./cues";

const ev = (act: string, t: number, type: string, gain?: number): FoleyEvent => ({ act, t, type, ...(gain !== undefined ? { gain } : {}) });
const events = [ev("A01", 0.5, "whoosh"), ev("A01", 1.204, "tick", 0.8), ev("A01", 1.204, "tick"), ev("A02", 12, "thump")];

describe("applySfxEdits", () => {
  test("keys are act@time:type, and twins get #2 so each can be edited on its own", () => {
    const { all } = applySfxEdits(events, {});
    expect(all.map((e) => e.key)).toEqual(["A01@0.50:whoosh", "A01@1.20:tick", "A01@1.20:tick#2", "A02@12.00:thump"]);
    expect(all.map((e) => e.seed)).toEqual([0, 1, 2, 3]);
  });

  test("no edits: the mix gets every event, without the review-only fields", () => {
    const { on, stale } = applySfxEdits(events, {});
    expect(on).toEqual(events.map((e, i) => ({ ...e, seed: i })));
    expect(stale).toEqual([]);
  });

  test("a removed event leaves the mix but keeps its place, so the others keep their sample (seed)", () => {
    const { all, on } = applySfxEdits(events, { off: ["A01@1.20:tick"] });
    expect(all[1].off).toBe(true);
    expect(on.map((e) => e.seed)).toEqual([0, 2, 3]);
    expect(on.some((e) => "off" in e || "key" in e)).toBe(false);
  });

  test("a gain edit in dB multiplies the event's own gain (default 1), rounded to 3 places", () => {
    const { on, all } = applySfxEdits(events, { gainDb: { "A01@1.20:tick": -6, "A02@12.00:thump": 6 } });
    expect(on[1].gain).toBe(0.401);     // 0.8 × 10^(−6/20)
    expect(on[3].gain).toBe(1.995);     // 1 × 10^(6/20)
    expect(on[0].gain).toBeUndefined();
    expect(all[1].gainDb).toBe(-6);
    expect("gainDb" in on[1]).toBe(false);
  });

  test("edits whose event is gone (the act's timing changed) are reported, not applied", () => {
    const { on, stale } = applySfxEdits(events, { off: ["A01@0.48:whoosh"], gainDb: { "A03@1.00:pop": -3 } });
    expect(on).toHaveLength(4);
    expect(stale).toEqual(["A01@0.48:whoosh", "A03@1.00:pop"]);
  });

  test("an edit on the second twin only touches the second twin", () => {
    const { all } = applySfxEdits(events, { off: ["A01@1.20:tick#2"] });
    expect(all[1].off).toBeUndefined();
    expect(all[2].off).toBe(true);
  });
});
