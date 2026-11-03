// Briefing's take on the shared elastic motion: bursts are cut-paper scraps.
import { burst, type BurstOpts } from "../paper/motion";
import { piece, type G, type Pt } from "./engine";
import { hash } from "../paper/lib";

export * from "../paper/motion";

/**
 * Paper scraps flung from (x, y) at t0 (world coords, inside the camera): a slap, a crash, money landing, a stamp.
 * Small irregular cut pieces in `col` (one of the chapter's inks), no slit, a light shadow. Keep n 8-20.
 */
export function scraps(g: G, t: number, t0: number, x: number, y: number, col: string, o: BurstOpts = {}): void {
  for (const p of burst(t, t0, o)) {
    const r = p.size, h = (k: number) => 0.55 + 0.45 * hash(p.i * 9.7 + k);
    const poly: Pt[] = [[-r * h(1), -r * 0.6 * h(2)], [r * h(3), -r * 0.5 * h(4)], [r * 0.8 * h(5), r * 0.6 * h(6)], [-r * 0.7 * h(7), r * 0.5 * h(8)]];
    g.save(); g.translate(x + p.x, y + p.y); g.rotate(p.rot);
    piece(g, poly, col, { gap: 0, shA: 0.18, shB: 2, shX: 1, shY: 1.5 });
    g.restore();
  }
}
