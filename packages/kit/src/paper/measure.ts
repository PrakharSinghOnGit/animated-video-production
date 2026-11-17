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
  /** on-screen box [x0, y0, x1, y1] (px, axis-aligned around any rotation), when the caller knows the thing's extent */
  box?: [number, number, number, number];
  /** the fill colour it was drawn in (#rrggbb), for the contrast check */
  col?: string;
}
let on = false, items: Measured[] = [];
/** The canvas host switches measuring on for review frames (inputProps.wgMeasure) and off otherwise. */
export function setMeasuring(v: boolean): void { on = v; items = []; }
export const measuring = (): boolean => on;
type Ctx2D = { getTransform(): { a: number; b: number; c: number; d: number; e: number; f: number }; globalAlpha: number };
/**
 * Record one drawn thing: `size`, (x, y) and `box` ([x0, y0, x1, y1]) are in the context's current space; they are mapped to
 * the screen here. `box` and `col` feed the review checks (text clipped by the frame, overlapping text, low contrast).
 */
export function measure(g: Ctx2D, kind: Measured["kind"], text: string, size: number, x: number, y: number, box?: [number, number, number, number], col?: string): void {
  if (!on || g.globalAlpha < 0.5) return;
  const m = g.getTransform(), sc = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 0;
  if (sc * size < 3) return;                                  // not really there yet (scaled to nothing while popping in)
  const at = (px: number, py: number): [number, number] => [m.a * px + m.c * py + m.e, m.b * px + m.d * py + m.f];
  const it: Measured = { kind, text, px: Math.round(sc * size * 10) / 10, x: Math.round(at(x, y)[0]), y: Math.round(at(x, y)[1]) };
  if (box) {
    const c = [at(box[0], box[1]), at(box[2], box[1]), at(box[0], box[3]), at(box[2], box[3])], xs = c.map((p) => p[0]), ys = c.map((p) => p[1]);
    it.box = [Math.round(Math.min(...xs)), Math.round(Math.min(...ys)), Math.round(Math.max(...xs)), Math.round(Math.max(...ys))];
  }
  if (col && /^#[0-9a-f]{6}$/i.test(col)) it.col = col.toLowerCase();
  items.push(it);
}
/** After the frame is drawn: one console line the frames script reads (WGMEASURE {...}). */
export function flushMeasure(frame: number): void {
  if (!on) return;
  console.log(`WGMEASURE ${JSON.stringify({ frame, items })}`);
  items = [];
}
