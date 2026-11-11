import { describe, expect, test } from "bun:test";
import { fromBase, toBase } from "./holdlib";

// two pauses added to the voice: 0.5 s after 2.0 s and 1.0 s after 5.0 s (times on the voice WITHOUT pauses)
const holds = [{ baseAt: 5, ms: 1000 }, { baseAt: 2, ms: 500 }, { baseAt: null, ms: 9000 }];

describe("pause time maps", () => {
  test("fromBase adds every pause at or before the moment; a refused pause (no place) adds nothing", () => {
    expect(fromBase(1, holds)).toBe(1);
    expect(fromBase(2, holds)).toBe(2.5);      // a moment exactly at the cut moves after the pause
    expect(fromBase(3, holds)).toBe(3.5);
    expect(fromBase(6, holds)).toBe(7.5);
  });

  test("toBase removes them again; a moment inside a pause lands on its cut point", () => {
    expect(toBase(1, holds)).toBe(1);
    expect(toBase(2.2, holds)).toBe(2);        // inside the first pause (2.0 – 2.5)
    expect(toBase(3.5, holds)).toBe(3);
    expect(toBase(5.9, holds)).toBe(5);        // inside the second pause (5.5 – 6.5)
    expect(toBase(7.5, holds)).toBe(6);
  });

  test("round trip: any moment of the voice survives pauses being added and removed", () => {
    for (let b = 0; b <= 8; b += 0.25) expect(toBase(fromBase(b, holds), holds)).toBeCloseTo(b, 9);
  });

  test("the order of the list does not matter, and no pauses is the identity", () => {
    expect(toBase(7.5, [...holds].reverse())).toBe(6);
    expect(fromBase(4.2, [])).toBe(4.2);
    expect(toBase(4.2, [])).toBe(4.2);
  });
});
