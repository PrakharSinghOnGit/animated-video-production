import { describe, expect, test } from "bun:test";
import { PHONE_W, PHONE_H, LIMITS, measurePixels, judge, unreadWords, ratio, lum } from "./phone";

// Synthetic thumbnails, drawn at 4x the phone size and box-averaged down (what the area filter does).
const BW = PHONE_W * 4, BH = PHONE_H * 4;
type RGB = [number, number, number];
const INK: RGB = [20, 18, 16], PAPER: RGB = [240, 232, 210], RED: RGB = [208, 57, 31], WHITE: RGB = [255, 255, 255];
function canvas(ground: RGB): Uint8Array { const b = new Uint8Array(BW * BH * 3); for (let i = 0; i < BW * BH; i++) b.set(ground, i * 3); return b; }
function rect(b: Uint8Array, x: number, y: number, w: number, h: number, c: RGB) {
  for (let yy = Math.max(0, y); yy < Math.min(BH, y + h); yy++) for (let xx = Math.max(0, x); xx < Math.min(BW, x + w); xx++) b.set(c, (yy * BW + xx) * 3);
}
function border(b: Uint8Array, px: number, c: RGB) { rect(b, 0, 0, BW, px, c); rect(b, 0, BH - px, BW, px, c); rect(b, 0, 0, px, BH, c); rect(b, BW - px, 0, px, BH, c); }
function small(b: Uint8Array): Uint8Array {
  const s = new Uint8Array(PHONE_W * PHONE_H * 3);
  for (let y = 0; y < PHONE_H; y++) for (let x = 0; x < PHONE_W; x++) for (let c = 0; c < 3; c++) {
    let sum = 0;
    for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) sum += b[((y * 4 + dy) * BW + x * 4 + dx) * 3 + c];
    s[(y * PHONE_W + x) * 3 + c] = Math.round(sum / 16);
  }
  return s;
}
const m = (b: Uint8Array) => measurePixels(small(b), b);

describe("phone-size measures", () => {
  test("one big solid object on a bordered ground passes", () => {
    const b = canvas(RED); border(b, 8, INK); rect(b, 120, 60, 220, 250, PAPER);
    const r = judge(m(b), "", null);
    expect(r.errors).toEqual([]);
    expect(r.metrics!.focalH).toBeGreaterThan(0.6);
    expect(r.metrics!.shapes).toBe(1);
    expect(r.metrics!.detailLost).toBeLessThan(LIMITS.detailLostWarn);
  });

  test("a drawing made of hairlines is rejected: its edges are gone at 168 px", () => {
    const b = canvas(PAPER); border(b, 8, INK);
    for (let i = 0; i < 40; i++) rect(b, 40 + i * 15, 40, 1, 300, INK);       // 1 px at 4x = a quarter of a phone pixel
    const r = judge(m(b), "", null);
    expect(r.metrics!.detailLost).toBeGreaterThan(LIMITS.detailLostMax);
    expect(r.errors.join(" ")).toContain("edges are gone");
  });

  test("cream paper with no border has no edge on a white page; a dark card none on a dark page", () => {
    const cream = canvas(WHITE); rect(cream, 200, 80, 200, 200, INK);
    expect(judge(m(cream), "", null).errors.join(" ")).toContain("white page");
    const dark = canvas([15, 15, 15]); rect(dark, 200, 80, 200, 200, PAPER);
    expect(judge(m(dark), "", null).errors.join(" ")).toContain("dark page");
  });

  test("dark on dark is flat", () => {
    const b = canvas([40, 36, 34]); border(b, 8, PAPER); rect(b, 150, 80, 300, 200, [70, 30, 28]);
    expect(judge(m(b), "", null).errors.join(" ")).toContain("flat");
  });

  test("something under the duration badge warns; an empty corner does not", () => {
    const b = canvas(RED); border(b, 8, INK); rect(b, 100, 60, 200, 200, PAPER);
    expect(judge(m(b), "", null).warnings.join(" ")).not.toContain("badge");
    for (let i = 0; i < 6; i++) rect(b, BW - 130 + i * 20, BH - 60, 10, 44, PAPER);
    expect(judge(m(b), "", null).warnings.join(" ")).toContain("badge");
  });

  test("a figure in three inks, cut by a slit, is one shape", () => {
    const b = canvas(RED); border(b, 8, INK);
    rect(b, 300, 60, 80, 120, INK); rect(b, 300, 184, 80, 120, INK); rect(b, 320, 100, 40, 40, PAPER);   // slit of 4 px = 1 phone px
    expect(m(b).shapes).toBe(1);
  });
});

describe("reading the words back", () => {
  test("words read alone, joined or split count as read", () => {
    expect(unreadWords("103 YEARS", ["103 YEARS"])).toEqual([]);
    expect(unreadWords("FAKE SETUP", ["FAKE", "SETUP"])).toEqual([]);
    expect(unreadWords("LOCKED OUT", ["LOCKEDOUT"])).toEqual([]);
    expect(unreadWords("POP?", ["POP?"])).toEqual([]);
  });
  test("a misread word is unread; look-alike characters and one slip in a long word are forgiven", () => {
    expect(unreadWords("LOCKED OUT", ["LUGNED"])).toEqual(["LOCKED", "OUT"]);
    expect(unreadWords("SELL", ["5E11"])).toEqual([]);
    expect(unreadWords("$100B", ["$1OOB"])).toEqual([]);
    expect(unreadWords("YEARS", ["YEAR5"])).toEqual([]);
    expect(unreadWords("TRAPPED", ["TRAPPFD"])).toEqual([]);
    expect(unreadWords("BUY", ["BIY"])).toEqual(["BUY"]);
  });
  test("judge: unread words reject; no reader only warns; no text needs no read", () => {
    const b = canvas(RED); border(b, 8, INK); rect(b, 120, 60, 220, 250, PAPER);
    const mm = m(b);
    expect(judge(mm, "LOCKED OUT", ["LUGNED"]).errors.join(" ")).toContain('could not read "LOCKED", "OUT"');
    expect(judge(mm, "LOCKED OUT", null).errors).toEqual([]);
    expect(judge(mm, "LOCKED OUT", null).warnings.join(" ")).toContain("not read back");
    expect(judge(mm, "", null).warnings.join(" ")).not.toContain("read back");
    expect(judge(mm, "RENT", ["RENT"], ["RFNT"]).warnings.join(" ")).toContain("120 px");
  });
});

test("contrast ratio matches WCAG's black on white", () => {
  expect(ratio(lum(0, 0, 0), lum(255, 255, 255))).toBeCloseTo(21, 0);
});
