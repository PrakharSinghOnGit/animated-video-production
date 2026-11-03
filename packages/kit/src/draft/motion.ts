// Drafting's take on the shared elastic motion: bursts are pencil specks and flicks in the ink's line colour.
import { burst, type BurstOpts } from "../paper/motion";
import { inkOf, type G, type Ink, type InkName } from "./core";

export * from "../paper/motion";

/**
 * Pencil flicks flung from (x, y) at t0 (screen px): a stamp, a press, a part snapping in. Short strokes in the ink's
 * line colour (or `col`, e.g. the accent for the one thing that matters). Keep n 8-18.
 */
export function specks(g: G, t: number, t0: number, x: number, y: number, o: BurstOpts & { ink: InkName | Ink; col?: string; width?: number }): void {
  const ps = burst(t, t0, { size: 16, ...o });
  if (!ps.length) return;
  g.save(); g.strokeStyle = o.col ?? inkOf(o.ink).line; g.lineCap = "round";
  for (const p of ps) {
    g.lineWidth = (o.width ?? 3) * (1 - p.life * 0.6);
    const dx = Math.cos(p.rot) * p.size * 0.5, dy = Math.sin(p.rot) * p.size * 0.5;
    g.beginPath(); g.moveTo(x + p.x - dx, y + p.y - dy); g.lineTo(x + p.x + dx, y + p.y + dy); g.stroke();
  }
  g.restore();
}
