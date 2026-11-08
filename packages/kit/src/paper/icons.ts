// Icons and company logos for acts, as polygons both styles draw with.
//   "tesla", "visa", "hdfcbank"  -> Simple Icons (CC0, ~3,500 brand logos; https://simpleicons.org)
//   "mdi:bank", "mdi:home-city" -> Material Design Icons (Apache-2.0, ~7,400 generic icons; https://pictogrammers.com/library/mdi/)
// Search names with `bun run icons <words>`. Each icon is one path on a 24x24 box, filled with the nonzero rule.
// Logos are trademarks: show one only for a company the narration is about (editorial use), never as an endorsement.
import * as SI from "simple-icons";
import * as MDI from "@mdi/js";
import { flattenSvgPath } from "./svgpath";
import type { Pt } from "./engine";

export type IconSet = "brand" | "mdi";
export interface IconDef {
  /** the name to pass back: "tesla" or "mdi:bank" */
  name: string;
  title: string;
  set: IconSet;
  /** the brand's own colour (brand logos only), e.g. "#CC0000" */
  hex: string | null;
  /** raw SVG path data on the 24x24 box */
  path: string;
  /** flattened outlines on the 24x24 box (y down); fill with the nonzero rule */
  polys: Pt[][];
  /** tight bounds of the drawn outline inside the 24 box: [x0, y0, x1, y1] */
  bounds: [number, number, number, number];
}

type Raw = { title: string; set: IconSet; hex: string | null; path: string };
let brands: Map<string, Raw> | null = null, mdis: Map<string, Raw> | null = null;

function brandMap(): Map<string, Raw> {
  if (brands) return brands;
  brands = new Map();
  for (const v of Object.values(SI) as unknown[]) {
    const o = v as { slug?: string; title?: string; path?: string; hex?: string };
    if (o && typeof o === "object" && o.slug && o.path) brands.set(o.slug, { title: o.title ?? o.slug, set: "brand", hex: o.hex ? `#${o.hex}` : null, path: o.path });
  }
  return brands;
}
function mdiMap(): Map<string, Raw> {
  if (mdis) return mdis;
  mdis = new Map();
  for (const [k, v] of Object.entries(MDI)) {
    if (!k.startsWith("mdi") || typeof v !== "string") continue;
    const kebab = k.slice(3).replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/([A-Za-z])([0-9])/g, "$1-$2").toLowerCase();
    mdis.set(kebab, { title: kebab.replace(/-/g, " "), set: "mdi", hex: null, path: v });
  }
  return mdis;
}

function parse(name: string): { set: IconSet; key: string } {
  const n = name.trim().toLowerCase();
  if (n.startsWith("mdi:")) return { set: "mdi", key: n.slice(4) };
  if (n.startsWith("brand:")) return { set: "brand", key: n.slice(6) };
  return { set: "brand", key: n };
}

function lookup(name: string): Raw | undefined {
  const { set, key } = parse(name);
  if (set === "mdi") return mdiMap().get(key);
  return brandMap().get(key) ?? brandMap().get(key.replace(/[^a-z0-9]/g, ""));
}

/** True if the icon exists (use it to fall back to a wordmark when a logo is missing). */
export function hasIcon(name: string): boolean { return !!lookup(name); }

/** Up to `limit` icons whose name or title contains every word of `query` (brands first). */
export function findIcons(query: string, limit = 20, set?: IconSet): { name: string; title: string; set: IconSet; hex: string | null }[] {
  const words = query.toLowerCase().split(/[\s:]+/).filter(Boolean);
  const out: { name: string; title: string; set: IconSet; hex: string | null; score: number }[] = [];
  const scan = (m: Map<string, Raw>, prefix: string) => {
    for (const [k, r] of m) {
      const hay = `${k} ${r.title.toLowerCase()}`;
      if (!words.every((w) => hay.includes(w))) continue;
      const exact = words.length === 1 && (k === words[0] || r.title.toLowerCase() === words[0]);
      out.push({ name: prefix + k, title: r.title, set: r.set, hex: r.hex, score: (exact ? 0 : 1) * 1000 + k.length });
    }
  };
  if (set !== "mdi") scan(brandMap(), "");
  if (set !== "brand") scan(mdiMap(), "mdi:");
  return out.sort((a, b) => a.score - b.score || (a.set === b.set ? 0 : a.set === "brand" ? -1 : 1)).slice(0, limit).map(({ score: _s, ...r }) => r);
}

const cache = new Map<string, IconDef>();
/** The icon as polygons on its 24x24 box. Throws with close matches if the name is unknown. */
export function icon(name: string): IconDef {
  const hit = cache.get(name);
  if (hit) return hit;
  const raw = lookup(name);
  if (!raw) {
    const near = findIcons(parse(name).key.replace(/[-_]/g, " "), 6, parse(name).set).map((r) => r.name);
    throw new Error(`icon "${name}" not found${near.length ? `; close: ${near.join(", ")}` : ""}. Search: bun run icons <words>`);
  }
  const polys = flattenSvgPath(raw.path, 0.015).map((s) => s.pts).filter((p) => p.length > 2);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of polys) for (const [x, y] of p) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const { set, key } = parse(name);
  const def: IconDef = { name: set === "mdi" ? `mdi:${key}` : key, title: raw.title, set, hex: raw.hex, path: raw.path, polys, bounds: [x0, y0, x1, y1] };
  cache.set(name, def);
  return def;
}

export interface IconPlace {
  /** what (x, y) is: "center" (default) of the drawn shape, its "top-left", or "bottom" centre (sits on a line) */
  anchor?: "center" | "top-left" | "bottom";
  /** rotation in radians around the anchor */
  rot?: number;
  /** "box": `size` is the 24-unit box (icons look consistent side by side); "fit" (default): the drawn shape's longest side is `size` */
  fit?: "fit" | "box";
}

/**
 * The icon's outlines placed in px: `size` px (see `fit`), anchored at (x, y). Returns `{polys, rect}` with
 * rect = [x0, y0, x1, y1] of the placed shape (unrotated), for a camera focus or a label underneath.
 */
export function placeIcon(name: string, x: number, y: number, size: number, o: IconPlace = {}): { polys: Pt[][]; rect: [number, number, number, number]; def: IconDef } {
  const def = icon(name), [bx0, by0, bx1, by1] = def.bounds;
  const box = o.fit === "box";
  const k = box ? size / 24 : size / Math.max(bx1 - bx0, by1 - by0, 1e-6);
  const w = (bx1 - bx0) * k, h = (by1 - by0) * k;
  const a = o.anchor ?? "center";
  const left = a === "top-left" ? x : x - w / 2, top = a === "center" ? y - h / 2 : a === "bottom" ? y - h : y;
  const c = Math.cos(o.rot ?? 0), s = Math.sin(o.rot ?? 0);
  const polys = def.polys.map((p) => p.map(([px, py]) => {
    const lx = left + (px - bx0) * k - x, ly = top + (py - by0) * k - y;
    return [x + lx * c - ly * s, y + lx * s + ly * c] as Pt;
  }));
  return { polys, rect: [left, top, left + w, top + h], def };
}

/** The largest outline of an icon (placed), for morphing a shape into a logo with a single-outline `morph`. */
export function iconOutline(polys: Pt[][]): Pt[] {
  let best = polys[0] ?? [], bestA = -1;
  for (const p of polys) {
    let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; }
    if (Math.abs(a) > bestA) { bestA = Math.abs(a); best = p; }
  }
  return best;
}
