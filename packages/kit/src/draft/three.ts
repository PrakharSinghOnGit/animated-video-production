/**
 * A tiny wireframe 3D for the locked camera: objects turn, the camera never moves.
 * Meshes are convex solids (box, cube, prism, extruded gear, drum) drawn as lines in the current ink: visible edges
 * solid, hidden edges dashed (`hidden: "dashed"`), or solids that occlude each other (`drawSolids`, painter's order)
 * with faces filled by the ink (hatch on paper/blueprint, scan lines lit by the face's angle on the hologram).
 * Projection blends orthographic (persp 0) and perspective (persp 1) so "perspective switches on" can be animated.
 */
import { TAU, clamp, lerp, inkOf, type G, type Pt, type Ink, type InkName } from "./core";
import { line, fill, occlude, type FillKind } from "./ink";
import { gearP } from "./geom";

export type V3 = [number, number, number];
export interface Mesh { v: V3[]; f: number[][] }
export interface Pose3 {
  /** screen position of the object's centre */
  x: number; y: number;
  /** rotations in radians, applied Y (turn), then X (tip), then Z (roll) */
  rx?: number; ry?: number; rz?: number;
  /** uniform scale (or sx/sy/sz) */
  s?: number; sx?: number; sy?: number; sz?: number;
  /** 0 = orthographic, 1 = perspective (camera distance `dist`, default 1800 px) */
  persp?: number; dist?: number;
  /** offset in model space before rotating (place parts of a group around one pivot: bars on a floor) */
  ox?: number; oy?: number; oz?: number;
}

export function rotate(v: V3, rx = 0, ry = 0, rz = 0): V3 {
  let [x, y, z] = v;
  // Y (turn)
  let c = Math.cos(ry), s = Math.sin(ry);
  [x, z] = [x * c + z * s, -x * s + z * c];
  // X (tip)
  c = Math.cos(rx); s = Math.sin(rx);
  [y, z] = [y * c - z * s, y * s + z * c];
  // Z (roll)
  c = Math.cos(rz); s = Math.sin(rz);
  [x, y] = [x * c - y * s, x * s + y * c];
  return [x, y, z];
}

/** Model point -> [screen x, screen y, depth] (depth: larger = farther). */
export function project(v: V3, p: Pose3): [number, number, number] {
  const s = p.s ?? 1;
  const w = rotate([v[0] * s * (p.sx ?? 1) + (p.ox ?? 0), v[1] * s * (p.sy ?? 1) + (p.oy ?? 0), v[2] * s * (p.sz ?? 1) + (p.oz ?? 0)], p.rx, p.ry, p.rz);
  const d = p.dist ?? 1800, k = lerp(1, d / (d + w[2]), clamp(p.persp ?? 0));
  return [p.x + w[0] * k, p.y + w[1] * k, w[2]];
}

// ───────────────────────────── meshes ─────────────────────────────

/** Box centred on the origin, faces wound counter-clockwise seen from outside (y down, z away from the viewer). */
export function box(w: number, h: number, d: number): Mesh {
  const x = w / 2, y = h / 2, z = d / 2;
  const v: V3[] = [[-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z], [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]];
  const f = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [4, 5, 1, 0], [3, 2, 6, 7]];
  return { v, f };
}
export const cube = (s: number) => box(s, s, s);

/** Prism from a 2D outline (screen-plane polygon, centred), extruded to depth d (gears, coins, drums, letters). */
export function extrude(outline: Pt[], d: number): Mesh {
  const n = outline.length, v: V3[] = [];
  for (const [x, y] of outline) v.push([x, y, -d / 2]);
  for (const [x, y] of outline) v.push([x, y, d / 2]);
  const front = Array.from({ length: n }, (_, i) => i).reverse();
  const back = Array.from({ length: n }, (_, i) => n + i);
  const f: number[][] = [front, back];
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; f.push([i, j, n + j, n + i]); }
  return { v, f };
}
/** Extruded spur gear. */
export const gear3 = (teeth: number, r: number, d: number) => extrude(gearP(0, 0, teeth, r), d);
/** Cylinder / drum along x (length L, radius r, n sides). */
export function drum(L: number, r: number, n = 4): Mesh {
  const ring: Pt[] = Array.from({ length: n }, (_, i) => { const a = (i / n) * TAU + Math.PI / n; return [r * Math.cos(a), r * Math.sin(a)]; });
  const m = extrude(ring, L);
  m.v = m.v.map(([a, b, c]) => [c, b, a] as V3);   // axis z -> x
  m.f = m.f.map((f) => [...f].reverse());
  return m;
}

// ───────────────────────────── drawing ─────────────────────────────

interface Projected { pts: [number, number, number][]; faces: { idx: number[]; front: boolean; depth: number; light: number; normal: V3 }[] }

function projectMesh(m: Mesh, p: Pose3): Projected {
  const pts = m.v.map((v) => project(v, p));
  const faces = m.f.map((idx) => {
    // screen-space winding decides front/back (works for both projections)
    let area = 0;
    for (let i = 0; i < idx.length; i++) { const a = pts[idx[i]], b = pts[idx[(i + 1) % idx.length]]; area += a[0] * b[1] - b[0] * a[1]; }
    const depth = idx.reduce((s, i) => s + pts[i][2], 0) / idx.length;
    // light: how much the face turns toward a light from the upper left, from its world normal
    const a = rotate(m.v[idx[0]], p.rx, p.ry, p.rz), b = rotate(m.v[idx[1]], p.rx, p.ry, p.rz), c = rotate(m.v[idx[2]], p.rx, p.ry, p.rz);   // normals ignore the offset
    const u: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n: V3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const nl = Math.hypot(...n) || 1; n = [n[0] / nl, n[1] / nl, n[2] / nl];
    const L: V3 = [-0.45, -0.6, -0.66];
    const light = clamp(0.25 + 0.75 * Math.max(0, -(n[0] * L[0] + n[1] * L[1] + n[2] * L[2])));
    return { idx, front: area < 0, depth, light, normal: n };
  });
  return { pts, faces };
}

export interface MeshOpts {
  ink: InkName | Ink;
  col?: string;
  /** hidden edges: dashed (default), none, or drawn like visible ones */
  hidden?: "dashed" | "none" | "show";
  /** fill visible faces */
  fill?: FillKind;
  fillProgress?: number;
  /** draw-on 0..1 of every edge */
  progress?: number;
  w?: number;
  seed?: number;
}

/** One mesh as a wireframe: each edge once, solid if a face using it is visible, else hidden. */
export function drawMesh(g: G, m: Mesh, p: Pose3, o: MeshOpts): void {
  const k = inkOf(o.ink), P = projectMesh(m, p);
  const edges = new Map<string, { a: number; b: number; vis: boolean }>();
  for (const f of P.faces) for (let i = 0; i < f.idx.length; i++) {
    const a = f.idx[i], b = f.idx[(i + 1) % f.idx.length], key = a < b ? `${a}-${b}` : `${b}-${a}`;
    const e = edges.get(key);
    if (e) e.vis = e.vis || f.front; else edges.set(key, { a, b, vis: f.front });
  }
  if (o.fill && o.fill !== "none") for (const f of P.faces) if (f.front) {
    fill(g, f.idx.map((i) => [P.pts[i][0], P.pts[i][1]] as Pt), { ink: k, kind: o.fill, light: f.light, progress: o.fillProgress, col: o.col, seed: o.seed });
  }
  const hidden = o.hidden ?? "dashed";
  let n = 0;
  for (const e of edges.values()) {
    n++;
    if (!e.vis && hidden === "none") continue;
    // skip edges between two coplanar faces of a smooth outline (gear flanks) when hidden: too busy
    const a = P.pts[e.a], b = P.pts[e.b];
    line(g, [[a[0], a[1]], [b[0], b[1]]], { ink: k, col: o.col, hidden: !e.vis && hidden === "dashed", progress: o.progress, w: o.w, seed: (o.seed ?? 1) + n * 0.13 });
  }
}

/**
 * Several solids that hide each other: faces drawn back to front, each painted with the ground (occluding what is
 * behind), filled by the ink, then outlined. Use for bar charts on a floor, stacked cubes, a drum with words.
 */
export function drawSolids(g: G, items: { mesh: Mesh; pose: Pose3; col?: string; fill?: FillKind; faceDraw?: (g: G, face: Pt[], i: number, light: number) => void }[], o: MeshOpts): void {
  const k = inkOf(o.ink);
  const all: { pts: Pt[]; depth: number; light: number; col?: string; fill?: FillKind; i: number; it: number }[] = [];
  items.forEach((it, ii) => {
    const P = projectMesh(it.mesh, it.pose);
    P.faces.forEach((f, fi) => { if (f.front) all.push({ pts: f.idx.map((i) => [P.pts[i][0], P.pts[i][1]] as Pt), depth: f.depth, light: f.light, col: it.col, fill: it.fill ?? o.fill, i: fi, it: ii }); });
  });
  all.sort((a, b) => b.depth - a.depth);
  for (const f of all) {
    occlude(g, f.pts, k);
    if (f.fill && f.fill !== "none") fill(g, f.pts, { ink: k, kind: f.fill, light: f.light, col: f.col, progress: o.fillProgress });
    items[f.it].faceDraw?.(g, f.pts, f.i, f.light);
    line(g, f.pts, { ink: k, col: f.col ?? o.col, closed: true, progress: o.progress, w: o.w, seed: f.it * 3 + f.i });
  }
}

/**
 * Wire globe (lat/long lines) of radius r: front half solid, back half dashed (or hidden).
 * `split` > 0 separates the northern and southern halves vertically; `twist` turns them against each other.
 */
export function globe(g: G, cx: number, cy: number, r: number, o: MeshOpts & { rx?: number; ry?: number; lat?: number; lon?: number; split?: number; twist?: number; ripple?: (lat: number, lon: number) => number }): void {
  const k = inkOf(o.ink), lat = o.lat ?? 6, lon = o.lon ?? 12;
  const pose = (north: boolean): Pose3 => ({ x: cx, y: cy + (o.split ?? 0) * (north ? -0.5 : 0.5), rx: o.rx ?? -0.35, ry: (o.ry ?? 0) + (o.twist ?? 0) * (north ? 1 : -1) });
  const pt = (la: number, lo: number): V3 => {
    const rr = r * (1 + (o.ripple?.(la, lo) ?? 0));
    return [rr * Math.cos(la) * Math.sin(lo), -rr * Math.sin(la), -rr * Math.cos(la) * Math.cos(lo)];
  };
  const curves: { v: V3[]; north: boolean }[] = [];
  for (let i = 1; i < lat; i++) {
    const la = -Math.PI / 2 + (i / lat) * Math.PI, north = la > 0;
    curves.push({ v: Array.from({ length: 73 }, (_, j) => pt(la, (j / 72) * TAU)), north });
  }
  for (let j = 0; j < lon; j++) {
    const lo = (j / lon) * TAU;
    curves.push({ v: Array.from({ length: 37 }, (_, i) => pt(-Math.PI / 2 + (i / 36) * Math.PI / 2, lo)), north: false });
    curves.push({ v: Array.from({ length: 37 }, (_, i) => pt((i / 36) * Math.PI / 2, lo)), north: true });
  }
  let n = 0;
  for (const c of curves) {
    const P = c.v.map((v) => project(v, pose(c.north)));
    // split into runs of front (z < 0) and back points
    let run: Pt[] = [], front = P[0][2] < 0;
    const flush = () => { if (run.length > 1 && (front || o.hidden !== "none")) line(g, run, { ink: k, col: o.col, hidden: !front, w: o.w, seed: n++ * 0.7, progress: o.progress }); };
    for (const q of P) {
      const f = q[2] < 0;
      if (f !== front) { run.push([q[0], q[1]]); flush(); run = [[q[0], q[1]]]; front = f; }
      else run.push([q[0], q[1]]);
    }
    flush();
  }
}

/** Mesh outline points on screen (for clipping, labels, morph targets). */
export const meshPoints = (m: Mesh, p: Pose3): Pt[] => m.v.map((v) => { const q = project(v, p); return [q[0], q[1]] as Pt; });
