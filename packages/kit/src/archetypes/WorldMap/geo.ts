import { geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import world110 from "world-atlas/countries-110m.json";
import world50 from "world-atlas/countries-50m.json";
import { normalizeCountryKey, resolveCountryId } from "./countries";

/**
 * Projected, pre-computed world geometry. Everything here is built once per
 * (detail, fit box) in a useMemo and is independent of the frame: animation only
 * changes an SVG transform, never the geo paths.
 */

export type Pt = [number, number];
export type Detail = "110m" | "50m";

export interface GeoCountry {
  id: string;
  name: string;
  d: string;
  /** Anchor for labels / flow endpoints (centroid of the largest polygon), base-map coords. */
  centroid: Pt;
  /** Union bounds of the polygons that matter for framing (ignores far-flung islands), base coords. */
  bounds: [Pt, Pt];
}

export interface GeoData {
  countries: GeoCountry[];
  byId: Map<string, GeoCountry>;
  atlasNames: Map<string, string>;
  project: (lon: number, lat: number) => Pt;
  /** Bounding box of all drawn land in base coords. */
  extent: [Pt, Pt];
}

export interface FitBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Polygons smaller than this share of a country's largest polygon do not count for framing. */
const MAIN_PART_RATIO = 0.3;

export function buildGeo(detail: Detail, box: FitBox): GeoData {
  const topo: any = detail === "50m" ? world50 : world110;
  const fc: any = feature(topo, topo.objects.countries);
  const land = fc.features.filter((f: any) => f.id !== "010"); // drop Antarctica: it eats a third of the frame
  const projection = geoNaturalEarth1().fitExtent(
    [
      [box.x0, box.y0],
      [box.x1, box.y1],
    ],
    { type: "FeatureCollection", features: land } as any
  );
  const path = geoPath(projection);

  const atlasNames = new Map<string, string>();
  const countries: GeoCountry[] = [];
  let ex0 = Infinity,
    ey0 = Infinity,
    ex1 = -Infinity,
    ey1 = -Infinity;

  for (const f of land) {
    const id: string = f.id ?? f.properties.name;
    const d = path(f);
    if (!d) continue;
    atlasNames.set(normalizeCountryKey(f.properties.name), id);
    const polys: any[] =
      f.geometry.type === "MultiPolygon"
        ? f.geometry.coordinates.map((c: any) => ({ type: "Polygon", coordinates: c }))
        : [f.geometry];
    const parts = polys
      .map((g) => ({ g, area: path.area(g), bounds: path.bounds(g) as [Pt, Pt], centroid: path.centroid(g) as Pt }))
      .filter((p) => p.area > 0 && Number.isFinite(p.centroid[0]));
    if (!parts.length) continue;
    const biggest = parts.reduce((a, b) => (b.area > a.area ? b : a));
    const main = parts.filter((p) => p.area >= biggest.area * MAIN_PART_RATIO);
    const b0: Pt = [Math.min(...main.map((p) => p.bounds[0][0])), Math.min(...main.map((p) => p.bounds[0][1]))];
    const b1: Pt = [Math.max(...main.map((p) => p.bounds[1][0])), Math.max(...main.map((p) => p.bounds[1][1]))];
    countries.push({ id, name: f.properties.name, d, centroid: biggest.centroid, bounds: [b0, b1] });
    const fb = path.bounds(f);
    ex0 = Math.min(ex0, fb[0][0]);
    ey0 = Math.min(ey0, fb[0][1]);
    ex1 = Math.max(ex1, fb[1][0]);
    ey1 = Math.max(ey1, fb[1][1]);
  }

  return {
    countries,
    byId: new Map(countries.map((c) => [c.id, c])),
    atlasNames,
    project: (lon, lat) => (projection([lon, lat]) ?? [0, 0]) as Pt,
    extent: [
      [ex0, ey0],
      [ex1, ey1],
    ],
  };
}

export function findCountry(geo: GeoData, ref: string): GeoCountry | undefined {
  const id = resolveCountryId(ref, geo.atlasNames);
  return id ? geo.byId.get(id) : undefined;
}
