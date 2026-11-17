import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { anchorEvent, applySfxEdits, autoScore, thin, THIN, type FoleyEvent, type SfxTypes } from "./cues";

const TYPES: SfxTypes = JSON.parse(fs.readFileSync(path.join(import.meta.dir, "../../../06-audio/sfx_types.json"), "utf-8")).types;

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
    expect(on).toEqual(events.map((e, i) => ({ ...e, seed: i, take: [0, 0, 1, 0][i] })));
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

describe("takes", () => {
  test("take = rank among events of the same type in the full list, so removing one keeps the others' samples", () => {
    const { all, on } = applySfxEdits(events, { off: ["A01@1.20:tick"] });
    expect(all.map((e) => e.take)).toEqual([0, 0, 1, 0]);
    expect(on.map((e) => e.take)).toEqual([0, 1, 0]);
  });
});

describe("anchorEvent", () => {
  test("a riser ends on the word: t moves back by d, hit keeps the word", () => {
    expect(anchorEvent({ t: 10, type: "riser", d: 2, act: "A" }, TYPES)).toEqual({ t: 8, type: "riser", d: 2, act: "A", hit: 10 });
  });
  test("a riser near the start gets shorter instead of starting before 0", () => {
    expect(anchorEvent({ t: 1.2, type: "riser", act: "A" }, TYPES)).toMatchObject({ t: 0, d: 1.2, hit: 1.2 });
  });
  test("a transition peaks on the cut: t moves back by its pre-roll", () => {
    expect(anchorEvent({ t: 5, type: "transition", act: "A" }, TYPES)).toMatchObject({ t: 5 - TYPES.transition.pre!, hit: 5 });
  });
  test("start types and unknown types are untouched", () => {
    const e = { t: 3, type: "card_slap", act: "A" };
    expect(anchorEvent(e, TYPES)).toBe(e);
    expect(anchorEvent({ ...e, type: "nope" }, TYPES)).toEqual({ ...e, type: "nope" });
  });
});

describe("autoScore", () => {
  const acts = [
    { id: "A01", start: 0, end: 30, chapter: false, intensity: 0.7, silences: [{ start: 12, stab: 12.6 }] },
    { id: "A02", start: 30, end: 60, chapter: true, intensity: 0.3, silences: [{ start: 45, stab: 45.5 }] },
    { id: "A03", start: 60, end: 90, chapter: false, intensity: 0.5, silences: [] },
  ];
  test("transitions on act changes, swell + boom into chapters, riser -> silence -> hit, never on the first act's start", () => {
    const ev = autoScore(acts, []).map((e) => `${e.type}@${e.t}`);
    expect(ev).toEqual(["riser@12", "impact@12.6", "reverse_swell@30", "boom@30", "riser@45", "sub_drop@45.5", "transition@60"]);
    expect(autoScore(acts, []).every((e) => e.auto)).toBe(true);
  });
  test("what the act already scores near the moment wins", () => {
    const own: FoleyEvent[] = [{ t: 59.7, hit: 60, type: "whip", act: "A03" }, { t: 12.6, type: "boom", act: "A01" }];
    const ev = autoScore(acts, own).map((e) => `${e.type}@${e.t}`);
    expect(ev).not.toContain("transition@60");
    expect(ev).not.toContain("impact@12.6");
    expect(ev).toContain("riser@12");
  });
  test("a silence too early in its act for a build gets only the hit", () => {
    const ev = autoScore([{ id: "A01", start: 0, end: 9, chapter: false, intensity: 0.6, silences: [{ start: 0.6, stab: 1 }] }], []);
    expect(ev.map((e) => e.type)).toEqual(["impact"]);
  });
});

describe("thin", () => {
  const f = (t: number, type = "card_slap", extra: Partial<FoleyEvent> = {}): FoleyEvent => ({ t, type, act: "A", ...extra });
  test("a pile-up keeps the louder sound", () => {
    expect([...thin([f(1, "card_slap", { gain: 0.5 }), f(1.05, "pop")], TYPES)]).toEqual([0]);
  });
  test("no more than foleyPerWindow foley sounds in any window", () => {
    const ev = Array.from({ length: 12 }, (_, i) => f(i * 0.4));
    const out = thin(ev, TYPES);
    expect(ev.length - out.size).toBe(THIN.foleyPerWindow);
  });
  test("big hits of a type keep their spacing; authored ones win over automatic ones", () => {
    const out = thin([f(10, "impact", { auto: true }), f(12, "impact"), f(30, "impact")], TYPES);
    expect([...out]).toEqual([0]);
  });
  test("design sounds do not count against the foley budget, and keep exempts", () => {
    const ev = [f(1), f(1.02, "boom"), f(1.04)];
    expect([...thin(ev, TYPES)]).toEqual([2]);
    expect([...thin(ev, TYPES, new Set([2]))]).toEqual([]);
  });
  test("applySfxEdits marks thinned events, leaves them out of the mix, and keep restores them", () => {
    const ev = [f(1), f(1.03)];
    const a = applySfxEdits(ev, {}, TYPES);
    expect(a.all[1].thinned).toBe(true);
    expect(a.on).toHaveLength(1);
    const b = applySfxEdits(ev, { keep: ["A@1.03:card_slap"] }, TYPES);
    expect(b.on).toHaveLength(2);
  });
});
