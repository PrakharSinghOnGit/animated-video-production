// Company logos and icons in the Drafting style: the logo's outlines drawn in the ink (pencil / wire / light), with
// the ink's fill. Every outline is a Pt[], so a logo can be drawn on, hatched in, or morphed out of the previous shape.
// Names come from paper/icons.ts (`bun run icons <words>` to search).
import { shape, type LineOpts, type FillKind } from "./ink";
import { inkOf, type G, type Pt } from "./core";
import { placeIcon, iconOutline, icon, hasIcon, findIcons, type IconPlace } from "../paper/icons";

export { icon, hasIcon, findIcons, placeIcon, iconOutline };
export type { IconDef, IconPlace, IconSet } from "../paper/icons";

export interface LogoOpts extends IconPlace, Omit<LineOpts, "closed"> {
  /** fill kind (default "auto": paper/blueprint hatch, hologram scan; "none" = outline only) */
  fill?: FillKind | "auto";
  fillProgress?: number;
  fillCol?: string;
  light?: number;
  gap?: number;
  /** hide what is behind the logo */
  opaque?: boolean;
}

/**
 * Draw an icon or company logo anchored at (x, y), `size` px (see `IconPlace.fit`), in the ink: outlines (`progress` draws
 * them on) plus the ink's fill (`fillProgress` hatches it in). Returns `{rect, polys}`: rect = [x0, y0, x1, y1] of the
 * placed logo; polys = its placed outlines (morph from `iconOutline(polys)`, the largest one).
 */
export function logo(g: G, name: string, x: number, y: number, size: number, o: LogoOpts): { rect: [number, number, number, number]; polys: Pt[][] } {
  const { anchor, rot, fit, fill, ...rest } = o;
  const placed = placeIcon(name, x, y, size, { anchor, rot, fit });
  const kind: FillKind | undefined = fill === "auto" || fill === undefined ? (inkOf(o.ink).name === "hologram" ? "scan" : "hatch") : fill;
  shape(g, placed.polys, { ...rest, fill: kind, w: o.w ?? Math.max(1.5, Math.min(3.5, size / 90)), rule: "nonzero" });
  return { rect: placed.rect, polys: placed.polys };
}

/** The logo's outlines placed in px, for your own `shape`/`line`/`morph` (fill them with `rule: "nonzero"`). */
export function logoPolys(name: string, x: number, y: number, size: number, o: IconPlace = {}): Pt[][] {
  return placeIcon(name, x, y, size, o).polys;
}
