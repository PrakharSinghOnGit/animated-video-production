/**
 * Measured sizes for the review step (bun run frames): while a review frame renders, the kit's drawing helpers report how big
 * each text, figure and logo really is ON SCREEN (world size x camera zoom x any scale around it). The frames script prints
 * the ones that are too small to read. Free, exact, the same for every model. Off in normal renders (one boolean check).
 */
export interface Measured {
  /** "label" (small set text), "type" (cut letters from drawLine), "figure" (puppet), "logo" */
  kind: "label" | "type" | "figure" | "logo";
  /** the text, or the logo's name */
  text: string;
  /** on-screen size in px at 1920x1080: label = font size, type = capital height, figure = height, logo = longest side */
  px: number;
  /** on-screen anchor (px) */
  x: number; y: number;
}
let on = false, items: Measured[] = [];
/** The canvas host switches measuring on for review frames (inputProps.wgMeasure) and off otherwise. */
export function setMeasuring(v: boolean): void { on = v; items = []; }
export const measuring = (): boolean => on;
type Ctx2D = { getTransform(): { a: number; b: number; c: number; d: number; e: number; f: number }; globalAlpha: number };
/** Record one drawn thing: `size` and (x, y) are in the context's current space; they are mapped to the screen here. */
export function measure(g: Ctx2D, kind: Measured["kind"], text: string, size: number, x: number, y: number): void {
  if (!on || g.globalAlpha < 0.5) return;
  const m = g.getTransform(), sc = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 0;
  if (sc * size < 3) return;                                  // not really there yet (scaled to nothing while popping in)
  items.push({ kind, text, px: Math.round(sc * size * 10) / 10, x: Math.round(m.a * x + m.c * y + m.e), y: Math.round(m.b * x + m.d * y + m.f) });
}
/** After the frame is drawn: one console line the frames script reads (WGMEASURE {...}). */
export function flushMeasure(frame: number): void {
  if (!on) return;
  console.log(`WGMEASURE ${JSON.stringify({ frame, items })}`);
  items = [];
}
