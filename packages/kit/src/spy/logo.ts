// Company logos and icons in the Briefing style: the logo is cut out of paper like everything else (scissor edge,
// cut gap, paper shadow), drawn with `piece`. Names come from paper/icons.ts (`bun run icons <words>` to search).
import { hash } from "../paper/lib";
import { measure } from "../paper/measure";
import { piece, rough, type G, type Pt, type PieceOpts } from "./engine";
import { placeIcon, iconOutline, icon, hasIcon, findIcons, type IconPlace } from "../paper/icons";

export { icon, hasIcon, findIcons, placeIcon, iconOutline };
export type { IconDef, IconPlace, IconSet } from "../paper/icons";

export interface LogoOpts extends IconPlace, Omit<PieceOpts, "rule"> {
  /** scissor-edge wobble in px (default size / 140, 0 = clean vector edge) */
  amp?: number;
  /** seed for the scissor edge (default from the name, so the same logo is always cut the same way) */
  seed?: number;
}

const cutCache = new Map<string, Pt[][]>();
const nameSeed = (s: string) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 9973; return Math.floor(hash(h) * 1000); };

/**
 * Draw an icon or company logo as one cut-paper piece in `col`, anchored at (x, y), `size` px (see `IconPlace.fit`).
 * Returns the placed rect [x0, y0, x1, y1] (for focusCam, a label under it, or `spotlight`).
 * Animate it with g.translate/g.scale (pop, bounce, land) around the anchor: keep `size` fixed so the scissor edge doesn't crawl.
 * Inside `silhouette(g, (L) => logo(L, ...))` it merges with the other pieces like any shape.
 */
export function logo(g: G, name: string, x: number, y: number, size: number, col: string, o: LogoOpts = {}): [number, number, number, number] {
  const { anchor, rot, fit, amp, seed, ...pieceOpts } = o;
  const placed = placeIcon(name, 0, 0, size, { anchor, fit });
  const a = amp ?? size / 140, sd = seed ?? nameSeed(name);
  const key = `${name}|${size.toFixed(1)}|${anchor}|${fit}|${a.toFixed(2)}|${sd}`;
  let local = cutCache.get(key);
  if (!local) {
    local = a > 0 ? placed.polys.map((p, i) => rough(p, sd + i * 13, a, Math.max(4, size / 40), true)) : placed.polys;
    cutCache.set(key, local);
  }
  g.save(); g.translate(x, y); if (rot) g.rotate(rot);
  measure(g, "logo", name, Math.max(placed.rect[2] - placed.rect[0], placed.rect[3] - placed.rect[1]), (placed.rect[0] + placed.rect[2]) / 2, (placed.rect[1] + placed.rect[3]) / 2);
  piece(g, local, col, { ...pieceOpts, rule: "nonzero" });
  g.restore();
  const [x0, y0, x1, y1] = placed.rect;
  return [x + x0, y + y0, x + x1, y + y1];
}

/** The logo's outlines placed in world px (no scissor edge), for your own `piece`, `cutPoly` or a morph. */
export function logoPolys(name: string, x: number, y: number, size: number, o: IconPlace = {}): Pt[][] {
  return placeIcon(name, x, y, size, o).polys;
}
