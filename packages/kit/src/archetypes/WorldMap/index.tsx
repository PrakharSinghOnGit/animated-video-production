import React, { useMemo } from "react";
import { useCurrentFrame } from "remotion";
import { z } from "zod";
import { COLOR_TOKENS, FONT_TOKENS, alpha } from "../../tokens";
import { ease, lerp, p } from "../../motion";
import { useScene, type SceneContextValue } from "../../scene";
import { ArchetypeFrame, ColorNameSchema, FRAME, FrameTextSchema, colorOf } from "../ArchetypeFrame";
import { CueSchema, parseCue, type Cue } from "../cues";
import { registerArchetype } from "../registry";
import { isKnownCountry } from "./countries";
import { buildGeo, findCountry, type Detail, type GeoData, type Pt } from "./geo";

/**
 * WorldMap: a full-bleed, camera-driven world map. Countries light up on spoken cues, the camera
 * pushes into regions, markers pulse, money flows travel along arcs, and a choropleth can colour
 * countries by value. Geometry is projected once (useMemo); each frame only moves an SVG transform
 * and re-derives screen positions for the overlay layer.
 */

// ---------------------------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------------------------

const CountryRef = z
  .string()
  .min(2)
  .max(40)
  .refine(isKnownCountry, { message: "Unknown country: use an ISO-3166 alpha-3 code (e.g. 'GBR') or an English country name" })
  .describe("ISO-3166 alpha-3 code ('GBR') or country name ('United Kingdom')");

const LonLat = z.tuple([z.number().min(-180).max(180), z.number().min(-85).max(85)]).describe("[longitude, latitude]");

const HighlightSchema = z.object({
  country: CountryRef,
  color: ColorNameSchema.default("mint"),
  at: CueSchema.optional().describe("When the country fills in; defaults to a short stagger after the voice starts"),
  label: z.string().max(32).optional().describe("Short name pinned to the country with a leader line"),
});

const FocusSchema = z.object({
  region: z
    .union([
      z.literal("world"),
      z.array(CountryRef).min(1).max(12),
      z.tuple([z.number().min(-180).max(180), z.number().min(-85).max(85), z.number().min(1).max(14)]),
    ])
    .describe("'world', a list of countries to frame, or [lon, lat, zoom] (zoom 1 = whole world)"),
  at: CueSchema.describe("When the camera starts moving"),
});

const MarkerSchema = z.object({
  lon: z.number().min(-180).max(180),
  lat: z.number().min(-85).max(85),
  label: z.string().max(32),
  at: CueSchema.optional(),
  size: z.number().min(0.5).max(2.5).default(1),
  color: ColorNameSchema.optional().describe("Defaults to the scene accent"),
});

const FlowSchema = z.object({
  from: z.union([LonLat, CountryRef]),
  to: z.union([LonLat, CountryRef]),
  at: CueSchema.optional(),
  color: ColorNameSchema.default("butter"),
  label: z.string().max(32).optional(),
  durationSec: z.number().min(0.4).max(4).default(1.5),
});

const ChoroplethSchema = z.object({
  values: z.record(z.string(), z.number()).describe("country (alpha-3 or name) -> value; only real, sourced values"),
  colorRamp: z
    .tuple([ColorNameSchema, ColorNameSchema])
    .default(["sky", "rose"])
    .describe("[low, high]; the low end is darkened so low values sit quietly on the dark base"),
  legend: z.object({
    label: z.string().max(48),
    min: z.union([z.number(), z.string().max(16)]),
    max: z.union([z.number(), z.string().max(16)]),
  }),
  at: CueSchema.optional().describe("When the colouring sweeps in"),
});

export const WorldMapSchema = FrameTextSchema.extend({
  highlight: z.array(HighlightSchema).max(10).default([]),
  focus: z.array(FocusSchema).max(8).default([]),
  markers: z.array(MarkerSchema).max(12).default([]),
  flows: z.array(FlowSchema).max(8).default([]),
  choropleth: ChoroplethSchema.optional(),
  moveSec: z.number().min(0.5).max(3).default(1.5).describe("Duration of each camera move"),
  detail: z.enum(["auto", "110m", "50m"]).default("auto").describe("Coastline detail; auto uses 50m when the camera zooms in"),
}).superRefine((v, ctx) => {
  for (const k of Object.keys(v.choropleth?.values ?? {})) {
    if (!isKnownCountry(k)) ctx.addIssue({ code: "custom", message: `Unknown country in choropleth.values: "${k}"`, path: ["choropleth", "values", k] });
  }
});
export type WorldMapProps = z.infer<typeof WorldMapSchema>;

// ---------------------------------------------------------------------------------------------
// Geometry / camera helpers
// ---------------------------------------------------------------------------------------------

const W = FRAME.width;
const H = FRAME.height;
const LABEL_SIZE = 28;

interface Cam {
  cx: number;
  cy: number;
  k: number;
}
interface Stop {
  start: number;
  dur: number;
  cam: Cam;
  /** Atlas ids of the countries this stop frames (empty for world / lon-lat stops). */
  ids: string[];
}

function resolveCue(s: SceneContextValue, cue: Cue | undefined, offsetSec: number, fallbackSec: number): number {
  if (cue === undefined) return s.voiceStart + s.sec(fallbackSec + offsetSec);
  if (typeof cue === "number") return s.voiceStart + s.sec(cue + offsetSec);
  const { word, occurrence } = parseCue(cue);
  return s.word(word, occurrence).start + s.sec(offsetSec);
}

function camAt(stops: Stop[], world: Cam, frame: number): { cam: Cam; idx: number; t: number } {
  let idx = -1;
  for (let i = 0; i < stops.length; i++) if (frame >= stops[i].start) idx = i;
  if (idx < 0) return { cam: world, idx, t: 1 };
  const from = idx > 0 ? stops[idx - 1].cam : world;
  const to = stops[idx].cam;
  const t = ease.inOutCubic(p(frame, stops[idx].start, stops[idx].start + stops[idx].dur));
  return {
    cam: { cx: lerp(from.cx, to.cx, t), cy: lerp(from.cy, to.cy, t), k: Math.exp(lerp(Math.log(from.k), Math.log(to.k), t)) },
    idx,
    t,
  };
}

/** Blend two colours (token hex or this function's own rgb() output); tokens' mix() cannot chain rgb() input. */
function blend(a: string, b: string, t: number): string {
  const ch = (c: string): number[] =>
    c.startsWith("#") ? [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) : (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
  const [r1, g1, b1] = ch(a);
  const [r2, g2, b2] = ch(b);
  const u = Math.max(0, Math.min(1, t));
  return `rgb(${Math.round(lerp(r1, r2, u))}, ${Math.round(lerp(g1, g2, u))}, ${Math.round(lerp(b1, b2, u))})`;
}

const toScreen = (c: Cam, o: Pt, pt: Pt): Pt => [o[0] + (pt[0] - c.cx) * c.k, o[1] + (pt[1] - c.cy) * c.k];

function pointOf(geo: GeoData, ref: [number, number] | string): Pt {
  if (typeof ref === "string") return findCountry(geo, ref)?.centroid ?? geo.project(0, 0);
  return geo.project(ref[0], ref[1]);
}

/** Curved (quadratic) arc between two base-map points, bulging upward on screen. */
function arcPoint(a: Pt, b: Pt, t: number): Pt {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  let nx = dy / len;
  let ny = -dx / len;
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  const bulge = len * 0.28;
  const c: Pt = [(a[0] + b[0]) / 2 + nx * bulge, (a[1] + b[1]) / 2 + ny * bulge];
  const u = 1 - t;
  return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]];
}

// ---------------------------------------------------------------------------------------------
// Label placement (deterministic, computed once per camera state, not per frame)
// ---------------------------------------------------------------------------------------------

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
interface LabelItem {
  key: string;
  anchor: Pt; // base coords
  text: string;
  kind: "leader" | "near" | "arc";
  color: string;
  cueFrame: number;
  stateIdx: number; // camera state the placement is solved in (0 = world)
}
interface Placed {
  dx: number; // box centre relative to anchor, screen px
  dy: number;
  w: number;
  h: number;
}

const labelSize = (text: string) => ({
  w: Math.round(text.length * LABEL_SIZE * 0.575 + 2 * 18 + 22),
  h: Math.round(LABEL_SIZE * 1.2 + 22),
});
const overlap = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
const SAFE: Rect = { x0: 36, y0: 40, x1: W - 36, y1: H - 56 };

function placeLabels(
  items: LabelItem[],
  cams: Cam[],
  o: Pt,
  reserved: Rect[],
  anchorsOf: (stateIdx: number) => Pt[]
): Map<string, Placed> {
  const out = new Map<string, Placed>();
  const placedByState = new Map<number, Rect[]>();
  const ordered = [...items].sort((a, b) => a.cueFrame - b.cueFrame);
  for (const it of ordered) {
    const cam = cams[it.stateIdx];
    const a = toScreen(cam, o, it.anchor);
    const { w, h } = labelSize(it.text);
    const placed = placedByState.get(it.stateIdx) ?? [];
    const dots = anchorsOf(it.stateIdx)
      .map((pt) => toScreen(cam, o, pt))
      .filter((pt) => Math.hypot(pt[0] - a[0], pt[1] - a[1]) > 3)
      .map((pt): Rect => ({ x0: pt[0] - 18, y0: pt[1] - 18, x1: pt[0] + 18, y1: pt[1] + 18 }));
    const dists = it.kind === "leader" ? [64, 104, 150, 210] : it.kind === "arc" ? [16, 40, 80] : [22, 46, 90, 140];
    const angles =
      it.kind === "leader"
        ? [-40, -140, 40, 140, -90, 90, 0, 180, -15, 195]
        : it.kind === "arc"
          ? [-90, 90, -60, -120, 0, 180]
          : [0, 180, -60, -120, 60, 120, -90, 90];
    let best: { dx: number; dy: number; cost: number } | null = null;
    outer: for (const dist of dists) {
      for (const deg of angles) {
        const r = (deg * Math.PI) / 180;
        const ux = Math.cos(r);
        const uy = Math.sin(r);
        const cxn = a[0] + ux * dist + ux * (w / 2);
        const cyn = a[1] + uy * dist + uy * (h / 2);
        const box: Rect = { x0: cxn - w / 2, y0: cyn - h / 2, x1: cxn + w / 2, y1: cyn + h / 2 };
        let cost = 0;
        const out2 = Math.max(0, SAFE.x0 - box.x0) + Math.max(0, box.x1 - SAFE.x1) + Math.max(0, SAFE.y0 - box.y0) + Math.max(0, box.y1 - SAFE.y1);
        cost += out2 * 400;
        for (const r2 of [...reserved, ...placed, ...dots]) cost += overlap(box, r2);
        cost += dist * 0.01;
        if (!best || cost < best.cost) best = { dx: cxn - a[0], dy: cyn - a[1], cost };
        if (cost < 1) break outer;
      }
    }
    placedByState.set(it.stateIdx, [...placed, { x0: a[0] + best!.dx - w / 2 - 6, y0: a[1] + best!.dy - h / 2 - 6, x1: a[0] + best!.dx + w / 2 + 6, y1: a[1] + best!.dy + h / 2 + 6 }]);
    out.set(it.key, { dx: best!.dx, dy: best!.dy, w, h });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------------------------

export const WorldMap: React.FC<WorldMapProps> = (props) => {
  const frame = useCurrentFrame();
  const s = useScene();
  const accent = colorOf(props.accent);
  const hasHeader = Boolean(props.kicker || props.title);
  const detail: Detail = props.detail === "auto" ? (props.focus.length ? "50m" : "110m") : props.detail;

  const geo = useMemo(
    () => buildGeo(detail, hasHeader ? { x0: 24, y0: 190, x1: W - 24, y1: H - 40 } : { x0: 24, y0: 60, x1: W - 24, y1: H - 50 }),
    [detail, hasHeader]
  );
  const o: Pt = useMemo(() => [(geo.extent[0][0] + geo.extent[1][0]) / 2, (geo.extent[0][1] + geo.extent[1][1]) / 2], [geo]);
  const world: Cam = { cx: o[0], cy: o[1], k: 1 };

  // ---- camera stops -------------------------------------------------------------------------
  const stops: Stop[] = useMemo(() => {
    const boxW = 1500;
    const boxH = hasHeader ? 700 : 860;
    return [...props.focus]
      .map((f) => ({ f, start: resolveCue(s, f.at, -0.1, 0) }))
      .sort((a, b) => a.start - b.start)
      .map(({ f, start }): Stop => {
        let cam: Cam = world;
        let ids: string[] = [];
        if (Array.isArray(f.region) && f.region.length === 3 && typeof f.region[0] === "number") {
          const [lon, lat, zoom] = f.region as [number, number, number];
          const pt = geo.project(lon, lat);
          cam = { cx: pt[0], cy: pt[1], k: zoom };
        } else if (Array.isArray(f.region)) {
          const cs = (f.region as string[]).map((r) => findCountry(geo, r)).filter((c) => c !== undefined);
          if (cs.length) {
            const x0 = Math.min(...cs.map((c) => c!.bounds[0][0]));
            const y0 = Math.min(...cs.map((c) => c!.bounds[0][1]));
            const x1 = Math.max(...cs.map((c) => c!.bounds[1][0]));
            const y1 = Math.max(...cs.map((c) => c!.bounds[1][1]));
            const k = Math.max(1, Math.min(12, Math.min(boxW / Math.max(x1 - x0, 1), boxH / Math.max(y1 - y0, 1))));
            cam = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, k };
            ids = cs.map((c) => c!.id);
          }
        }
        return { start, dur: Math.max(1, s.sec(props.moveSec)), cam, ids };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo, s, props.focus, props.moveSec, hasHeader]);

  const { cam, idx: stopIdx, t: stopT } = camAt(stops, world, frame);
  const tx = o[0] - cam.cx * cam.k;
  const ty = o[1] - cam.cy * cam.k;
  const scr = (pt: Pt) => toScreen(cam, o, pt);

  // ---- resolved beats -----------------------------------------------------------------------
  const highlights = useMemo(
    () =>
      props.highlight.flatMap((h, i) => {
        const c = findCountry(geo, h.country);
        return c ? [{ h, c, start: resolveCue(s, h.at, -0.08, 0.6 + i * 0.55), color: colorOf(h.color, "mint") }] : [];
      }),
    [geo, s, props.highlight]
  );
  const markers = useMemo(
    () =>
      props.markers.map((m, i) => ({
        m,
        pt: geo.project(m.lon, m.lat),
        start: resolveCue(s, m.at, -0.08, 0.8 + i * 0.5),
        color: colorOf(m.color ?? props.accent, "butter"),
      })),
    [geo, s, props.markers, props.accent]
  );
  const flows = useMemo(
    () =>
      props.flows.map((f, i) => ({
        f,
        a: pointOf(geo, f.from as any),
        b: pointOf(geo, f.to as any),
        start: resolveCue(s, f.at, -0.08, 0.8 + i * 0.9),
        color: colorOf(f.color, "butter"),
      })),
    [geo, s, props.flows]
  );

  const choro = useMemo(() => {
    const ch = props.choropleth;
    if (!ch) return null;
    const entries = new Map<string, number>();
    for (const [k, v] of Object.entries(ch.values)) {
      const c = findCountry(geo, k);
      if (c) entries.set(c.id, v);
    }
    const vals = [...entries.values()];
    const lo = typeof ch.legend.min === "number" ? ch.legend.min : Math.min(...vals);
    const hi = typeof ch.legend.max === "number" ? ch.legend.max : Math.max(...vals);
    const [c0, c1] = ch.colorRamp;
    const ramp = (t: number) => blend(blend(colorOf(c0), COLOR_TOKENS.bg, 0.6), colorOf(c1), t);
    const xs = [...entries.keys()].map((id) => geo.byId.get(id)!.centroid[0]);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    return {
      ch,
      ramp,
      lo,
      hi,
      start: resolveCue(s, ch.at, 0, 0.8),
      fills: new Map([...entries].map(([id, v]) => [id, { color: ramp((v - lo) / (hi - lo || 1)), order: (geo.byId.get(id)!.centroid[0] - xMin) / (xMax - xMin || 1) }])),
    };
  }, [geo, s, props.choropleth]);

  // ---- labels: solved once per camera state -------------------------------------------------
  const camStates = useMemo(() => [world, ...stops.map((st) => st.cam)], [stops, world.cx, world.cy]);
  const lookahead = s.sec(0.9);
  const stateFor = (cueFrame: number) => {
    let idx = 0;
    stops.forEach((st, i) => {
      if (st.start <= cueFrame + lookahead) idx = i + 1;
    });
    return idx;
  };

  const labelItems: LabelItem[] = useMemo(() => {
    const items: LabelItem[] = [];
    highlights.forEach(({ h, c, start, color }, i) => {
      if (h.label) items.push({ key: `h${i}`, anchor: c.centroid, text: h.label, kind: "leader", color, cueFrame: start + s.sec(0.2), stateIdx: stateFor(start) });
    });
    markers.forEach(({ m, pt, start, color }, i) => items.push({ key: `m${i}`, anchor: pt, text: m.label, kind: "near", color, cueFrame: start, stateIdx: stateFor(start) }));
    flows.forEach(({ f, a, b, start, color }, i) => {
      if (f.label) items.push({ key: `f${i}`, anchor: arcPoint(a, b, 0.5), text: f.label, kind: "arc", color, cueFrame: start + s.sec(f.durationSec * 0.5), stateIdx: stateFor(start) });
    });
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlights, markers, flows, stops, s]);

  const placements = useMemo(() => {
    const reserved: Rect[] = [];
    if (hasHeader) reserved.push({ x0: FRAME.marginX - 20, y0: FRAME.top - 20, x1: 1340, y1: props.title ? 270 : 170 });
    if (props.source) reserved.push({ x0: FRAME.marginX - 20, y0: H - 90, x1: 1000, y1: H });
    if (props.choropleth) reserved.push({ x0: FRAME.marginX - 20, y0: H - 250, x1: 640, y1: H - 90 });
    // Every dot on the map is an obstacle so labels never cover a marker, flow end or country anchor.
    const dots = [...markers.map((m) => m.pt), ...flows.flatMap((f) => [f.a, f.b])];
    const anchorsOf = (stateIdx: number) => [...labelItems.filter((l) => l.stateIdx === stateIdx).map((l) => l.anchor), ...dots];
    return placeLabels(labelItems, camStates, o, reserved, anchorsOf);
  }, [labelItems, markers, flows, camStates, o, hasHeader, props.title, props.source, props.choropleth]);

  // ---- per-frame values ---------------------------------------------------------------------
  const fps = s.fps;
  const highlightIds = new Set(highlights.map((h) => h.c.id));
  const choroReveal = (id: string) => {
    if (!choro) return 0;
    const f = choro.fills.get(id);
    if (!f) return 0;
    return ease.outCubic(p(frame, choro.start + f.order * s.sec(1.1), choro.start + f.order * s.sec(1.1) + s.sec(0.6)));
  };

  const baseFill = COLOR_TOKENS.surface2;
  const litFill = blend(COLOR_TOKENS.surface2, COLOR_TOKENS.text, 0.2);
  /** 0..1 emphasis for countries the camera is framing (fades in on arrival, out when it leaves). */
  const lit = (id: string) => {
    let w = 0;
    if (stopIdx >= 0 && stops[stopIdx].ids.includes(id)) w = Math.max(w, stopT);
    if (stopIdx >= 1 && stops[stopIdx - 1].ids.includes(id)) w = Math.max(w, 1 - stopT);
    return w;
  };
  const base = (
    <>
      {geo.countries.map((c) => {
        const cf = choro?.fills.get(c.id);
        const fill = cf ? blend(baseFill, cf.color, choroReveal(c.id)) : blend(baseFill, litFill, lit(c.id));
        return <path key={c.id} d={c.d} fill={fill} stroke={alpha(COLOR_TOKENS.text, 0.17)} strokeWidth={0.9} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />;
      })}
    </>
  );

  const labelNodes = labelItems.map((it) => {
    const pl = placements.get(it.key);
    if (!pl) return null;
    const a = scr(it.anchor);
    const inFrame = Math.min(a[0], W - a[0], a[1], H - a[1]);
    const vis = ease.outExpo(p(frame, it.cueFrame, it.cueFrame + s.sec(0.5))) * Math.max(0, Math.min(1, inFrame / 60));
    if (vis <= 0.001) return null;
    let cx = a[0] + pl.dx;
    let cy = a[1] + pl.dy;
    cx = Math.max(SAFE.x0 + pl.w / 2, Math.min(SAFE.x1 - pl.w / 2, cx));
    cy = Math.max(SAFE.y0 + pl.h / 2, Math.min(SAFE.y1 - pl.h / 2, cy));
    const nx = Math.max(cx - pl.w / 2, Math.min(cx + pl.w / 2, a[0]));
    const ny = Math.max(cy - pl.h / 2, Math.min(cy + pl.h / 2, a[1]));
    const showLeader = Math.hypot(nx - a[0], ny - a[1]) > 8;
    return (
      <g key={it.key} opacity={vis}>
        {showLeader && (
          <line x1={a[0]} y1={a[1]} x2={lerp(a[0], nx, vis)} y2={lerp(a[1], ny, vis)} stroke={it.color} strokeWidth={2} strokeLinecap="round" />
        )}
        <foreignObject x={cx - pl.w / 2} y={cy - pl.h / 2 + (1 - vis) * 8} width={pl.w} height={pl.h}>
          <div
            style={{
              width: "100%",
              height: "100%",
              boxSizing: "border-box",
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "0 18px",
              borderRadius: 999,
              background: alpha(COLOR_TOKENS.bg, 0.88),
              border: `2px solid ${alpha(it.color, 0.8)}`,
              fontFamily: FONT_TOKENS.body,
              fontWeight: 600,
              fontSize: LABEL_SIZE,
              color: COLOR_TOKENS.text,
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: 5, background: it.color, flex: "none" }} />
            {it.text}
          </div>
        </foreignObject>
      </g>
    );
  });

  return (
    <ArchetypeFrame kicker={props.kicker} title={props.title} source={props.source} accent={props.accent} fullBleed>
      {hasHeader && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `radial-gradient(ellipse 800px 190px at 140px 130px, ${alpha(COLOR_TOKENS.bg, 0.7)}, ${alpha(COLOR_TOKENS.bg, 0)})`,
            zIndex: 2,
            pointerEvents: "none",
          }}
        />
      )}
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0 }}>
        {/* Land: only the transform changes per frame. */}
        <g transform={`translate(${tx} ${ty}) scale(${cam.k})`}>
          {base}
          {highlights.map(({ c, start, color }, i) => {
            const r = ease.outExpo(p(frame, start, start + s.sec(0.7)));
            const flash = Math.sin(Math.PI * p(frame, start, start + s.sec(0.9)));
            return (
              <g key={`hl${i}`} opacity={r > 0 ? 1 : 0}>
                <path d={c.d} fill="none" stroke={alpha(color, 0.5 * flash)} strokeWidth={10 * flash} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                <path d={c.d} fill={alpha(color, 0.92 * r)} stroke={alpha(COLOR_TOKENS.bg, 0.7)} strokeWidth={1.2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
              </g>
            );
          })}
        </g>

        {/* Overlay in screen space: flows and markers keep a constant pixel size at any zoom. */}
        {flows.map(({ f, a, b, start, color }, i) => {
          const N = 56;
          const dur = s.sec(f.durationSec);
          const prog = ease.inOutSine(p(frame, start, start + dur));
          if (prog <= 0) return null;
          const pts: Pt[] = [];
          for (let j = 0; j <= N; j++) if (j / N <= prog) pts.push(scr(arcPoint(a, b, j / N)));
          const head = scr(arcPoint(a, b, prog));
          pts.push(head);
          const d = pts.map((q, j) => `${j ? "L" : "M"}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(" ");
          const tail = pts.slice(Math.max(0, pts.length - 14));
          const dTail = tail.map((q, j) => `${j ? "L" : "M"}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(" ");
          const arrived = frame >= start + dur;
          const arrivePulse = p(frame, start + dur, start + dur + s.sec(0.9));
          const A = scr(a);
          const B = scr(b);
          const packetT = (k: number) => (((frame - start - dur) / s.sec(2.2) + k / 2) % 1 + 1) % 1;
          return (
            <g key={`fl${i}`}>
              <path d={d} fill="none" stroke={alpha(color, arrived ? 0.5 : 0.35)} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
              {!arrived && <path d={dTail} fill="none" stroke={color} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />}
              <circle cx={A[0]} cy={A[1]} r={8} fill={color} stroke={COLOR_TOKENS.bg} strokeWidth={3} />
              {arrived && (
                <>
                  <circle cx={B[0]} cy={B[1]} r={12 + 34 * ease.outCubic(arrivePulse)} fill="none" stroke={alpha(color, 0.7 * (1 - arrivePulse))} strokeWidth={3} />
                  <circle cx={B[0]} cy={B[1]} r={10} fill={color} stroke={COLOR_TOKENS.bg} strokeWidth={3} />
                  {[0, 1].map((k) => {
                    const q = scr(arcPoint(a, b, packetT(k)));
                    return <circle key={k} cx={q[0]} cy={q[1]} r={6} fill={COLOR_TOKENS.text} opacity={0.9} />;
                  })}
                </>
              )}
              {!arrived && <circle cx={head[0]} cy={head[1]} r={10} fill={color} stroke={COLOR_TOKENS.bg} strokeWidth={3} />}
            </g>
          );
        })}

        {markers.map(({ m, pt, start, color }, i) => {
          const t = p(frame, start, start + s.sec(0.5));
          if (t <= 0) return null;
          const q = scr(pt);
          const r = Math.max(0, 9 * m.size * (1 - ease.outBack(1.8)(1 - t))); // Easing.back is ease-in: flip it for a pop-in
          const phase = (((frame - start) / s.sec(1.7)) % 1 + 1) % 1;
          return (
            <g key={`mk${i}`}>
              <circle cx={q[0]} cy={q[1]} r={r + 6 + 30 * m.size * phase} fill="none" stroke={alpha(color, 0.75 * (1 - phase))} strokeWidth={3} />
              <circle cx={q[0]} cy={q[1]} r={r} fill={color} stroke={COLOR_TOKENS.bg} strokeWidth={3} />
            </g>
          );
        })}

        {labelNodes}
      </svg>

      {choro && <Legend choro={choro} frame={frame} hasSource={Boolean(props.source)} s={s} />}
    </ArchetypeFrame>
  );
};

interface ChoroState {
  ch: z.infer<typeof ChoroplethSchema>;
  ramp: (t: number) => string;
  start: number;
}

const Legend: React.FC<{
  choro: ChoroState;
  frame: number;
  hasSource: boolean;
  s: SceneContextValue;
}> = ({ choro, frame, hasSource, s }) => {
  const t = ease.outExpo(p(frame, choro.start, choro.start + s.sec(0.6)));
  const stopsCss = [0, 0.25, 0.5, 0.75, 1].map((q) => `${choro.ramp(q)} ${q * 100}%`).join(", ");
  const fmt = (v: number | string) => (typeof v === "number" ? v.toLocaleString("en-US") : v);
  return (
    <div
      style={{
        position: "absolute",
        left: FRAME.marginX,
        bottom: hasSource ? 120 : 80,
        width: 440,
        opacity: t,
        transform: `translateY(${(1 - t) * 14}px)`,
        zIndex: 3,
        fontFamily: FONT_TOKENS.body,
      }}
    >
      <div style={{ fontSize: 26, fontWeight: 600, color: COLOR_TOKENS.text, marginBottom: 12 }}>{choro.ch.legend.label}</div>
      <div style={{ height: 16, borderRadius: 8, background: `linear-gradient(to right, ${stopsCss})`, border: `1px solid ${alpha(COLOR_TOKENS.text, 0.2)}` }} />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontFamily: FONT_TOKENS.mono, fontSize: 26, color: COLOR_TOKENS.muted }}>
        <span>{fmt(choro.ch.legend.min)}</span>
        <span>{fmt(choro.ch.legend.max)}</span>
      </div>
    </div>
  );
};

registerArchetype({
  name: "WorldMap",
  useWhen:
    "The narration is about WHERE: countries, regions, trade routes or capital flows. Highlight named countries, zoom the camera onto a region, pulse cities/exchanges, draw money flowing between places, or colour countries by a sourced value. Not for time series or rankings without geography.",
  schema: WorldMapSchema,
  component: WorldMap,
  examples: [
    {
      narration: "The United States, the United Kingdom and Japan all issue their own currency, while Germany shares the euro.",
      props: {
        kicker: "The currency map",
        title: "Who issues the money?",
        highlight: [
          { country: "USA", color: "mint", at: "States", label: "United States" },
          { country: "GBR", color: "sky", at: "Kingdom", label: "United Kingdom" },
          { country: "JPN", color: "peach", at: "Japan", label: "Japan" },
          { country: "DEU", color: "lav", at: "Germany", label: "Germany" },
        ],
        accent: "mint",
      },
    },
    {
      narration: "Trading never sleeps: it starts in Tokyo, moves to London, and finishes in New York.",
      props: {
        kicker: "The FX market",
        title: "Follow the sun",
        focus: [
          { region: "world", at: 0 },
          { region: ["JPN", "KOR"], at: "Tokyo" },
          { region: ["GBR", "FRA", "DEU"], at: "London" },
          { region: [-74, 40.7, 4], at: "York" },
        ],
        markers: [
          { lon: 139.7, lat: 35.7, label: "Tokyo", at: "Tokyo", color: "peach" },
          { lon: -0.13, lat: 51.5, label: "London", at: "London", color: "sky" },
          { lon: -74, lat: 40.7, label: "New York", at: "York", color: "mint" },
        ],
        moveSec: 1,
        accent: "peach",
        source: "Illustrative: trading hubs only",
      },
    },
    {
      narration: "Savings from China flow into the United States, and from there capital flows on to Europe and Brazil.",
      props: {
        kicker: "Capital flows",
        title: "Where the money goes",
        flows: [
          { from: "CHN", to: "USA", at: "China", color: "butter", label: "Savings" },
          { from: "USA", to: "DEU", at: "Europe", color: "mint" },
          { from: "USA", to: "BRA", at: "Brazil", color: "sky" },
        ],
        highlight: [{ country: "CHN", color: "butter", at: "China" }],
        accent: "butter",
        source: "Illustrative flows, not measured data",
      },
    },
    {
      narration: "Imagine colouring every country by how open it is to trade: the more trade, the brighter the colour.",
      props: {
        highlight: [],
        choropleth: {
          values: { DEU: 5, NLD: 5, SGP: 5, CHN: 4, KOR: 4, MEX: 4, GBR: 3, FRA: 3, CAN: 3, IND: 2, BRA: 1, USA: 2, AUS: 2, RUS: 3, ZAF: 3, ARG: 1 },
          colorRamp: ["sky", "rose"],
          legend: { label: "Trade openness (illustrative)", min: "Closed", max: "Open" },
          at: "colouring",
        },
        source: "Illustrative data, not measured",
      },
    },
  ],
});
