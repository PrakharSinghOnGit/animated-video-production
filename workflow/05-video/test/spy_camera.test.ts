import { describe, expect, it } from "bun:test";
import { spy } from "@wealthgap/kit";

const { planFocus, focusCam, frameRect, rectOf, padRect, figureRect } = spy;
type Rect = spy.Rect;

const A: Rect = [0, 0, 800, 450], B: Rect = [4000, 0, 4800, 450];

describe("focusCam", () => {
  it("keeps the old behaviour when no new option is used", () => {
    const focus = [{ t0: 1, t1: 3, rect: A }, { t0: 3.5, t1: 6, rect: B }];
    const p = planFocus(focus);
    expect(p.dwells.length).toBe(1);                         // too close for a move: one union frame
    expect(p.dwells[0].rect).toEqual([0, 0, 4800, 450]);
    expect(focusCam(2, focus).zoom).toBeCloseTo(frameRect([0, 0, 4800, 450]).zoom, 1);
  });

  it("widest: refuses a union that would shrink the subjects too much and moves quickly instead", () => {
    const focus = [{ t0: 1, t1: 3, rect: A }, { t0: 3.5, t1: 6, rect: B }];
    const p = planFocus(focus, { widest: 0.6 });
    expect(p.dwells.length).toBe(2);
    expect(p.moves.length).toBe(1);
    expect(p.moves[0].end).toBeLessThanOrEqual(3.5 + 1e-9);   // arrives by the next action's start
    expect(p.moves[0].start).toBeGreaterThanOrEqual(3 - 1e-9); // never leaves before the first action is finished
    expect(p.moves[0].end - p.moves[0].start).toBeGreaterThanOrEqual(0.3 - 1e-9);
  });

  it("widest: still merges neighbours when the union stays close to the tighter frame", () => {
    const near: Rect = [700, 0, 1500, 450];
    const p = planFocus([{ t0: 1, t1: 3, rect: A }, { t0: 3.5, t1: 6, rect: near }], { widest: 0.5 });
    expect(p.dwells.length).toBe(1);
  });

  it("widest: overlapping actions always merge", () => {
    const p = planFocus([{ t0: 1, t1: 4, rect: A }, { t0: 3, t1: 6, rect: B }], { widest: 0.6 });
    expect(p.dwells.length).toBe(1);
  });

  it("roll: a held diagonal per action, clamped to 6 degrees, 0 without it", () => {
    const max = (6 * Math.PI) / 180;
    const rolled = [{ t0: 0, t1: 4, rect: A, roll: 0.5 }];
    expect(planFocus(rolled).dwells[0].cam.roll).toBeCloseTo(max, 6);
    expect(Math.abs((focusCam(2, rolled).roll ?? 0) - max)).toBeLessThan(0.01);   // plus the tiny hand-held drift
    expect(Math.abs(focusCam(2, [{ t0: 0, t1: 4, rect: A }]).roll ?? 0)).toBeLessThan(0.01);
  });
});

describe("rect helpers", () => {
  it("rectOf unions rects and points", () => {
    expect(rectOf(A, [900, -50], B)).toEqual([0, -50, 4800, 450]);
  });
  it("padRect grows a rect (one value, or x and y)", () => {
    expect(padRect(A, 10)).toEqual([-10, -10, 810, 460]);
    expect(padRect(A, 10, 20)).toEqual([-10, -20, 810, 470]);
  });
  it("figureRect covers a figure standing at (x, y)", () => {
    const [x0, y0, x1, y1] = figureRect(1000, 800, 0.6);
    expect(y1).toBe(800);
    expect(y1 - y0).toBeCloseTo(540 * 0.6 * 1.06, 0);
    expect((x0 + x1) / 2).toBe(1000);
  });
});
