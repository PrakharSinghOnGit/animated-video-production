// SVG path data -> polylines. Every command (M L H V C S Q T A Z, absolute and relative) is flattened into points,
// so a logo or icon becomes the same Pt[][] both styles already draw with (Briefing paper pieces, Drafting lines).
import type { Pt } from "./engine";

/** One subpath of a flattened SVG path. `closed` = it ended with Z (fillable outline); open ones are strokes. */
export interface SubPath { pts: Pt[]; closed: boolean }

const NUM = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;

function tokenize(d: string): (string | number)[] {
  const out: (string | number)[] = [];
  let i = 0;
  while (i < d.length) {
    const c = d[i];
    if (/[MmLlHhVvCcSsQqTtAaZz]/.test(c)) { out.push(c); i++; continue; }
    if (/[\s,]/.test(c)) { i++; continue; }
    NUM.lastIndex = i;
    const m = NUM.exec(d);
    if (!m) throw new Error(`svg path: unexpected "${c}" at ${i}`);
    out.push(parseFloat(m[0])); i = NUM.lastIndex;
  }
  return out;
}


/**
 * Flatten SVG path data. `tol` = max distance (in the path's own units) between the curve and its polyline;
 * 0.02 is fine for a 24-unit icon box drawn up to ~600 px.
 */
export function flattenSvgPath(d: string, tol = 0.02): SubPath[] {
  const tok = tokenize(fixArcFlags(d));
  const subs: SubPath[] = [];
  let cur: Pt[] = [], x = 0, y = 0, sx = 0, sy = 0, cmd = "", i = 0;
  let lcx = 0, lcy = 0, lqx = 0, lqy = 0, prev = "";            // last control points (for S and T)
  const num = () => { const v = tok[i++]; if (typeof v !== "number") throw new Error("svg path: expected a number"); return v; };
  const flush = (closed: boolean) => { if (cur.length > 1) subs.push({ pts: dedupe(cur, closed), closed }); cur = []; };
  const to = (nx: number, ny: number) => { if (!cur.length) cur.push([x, y]); cur.push([nx, ny]); x = nx; y = ny; };
  const cubic = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) => {
    const n = segs(Math.hypot(x1 - x, y1 - y) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x3 - x2, y3 - y2), tol);
    const x0 = x, y0 = y;
    for (let k = 1; k <= n; k++) {
      const u = k / n, v = 1 - u;
      to(v * v * v * x0 + 3 * v * v * u * x1 + 3 * v * u * u * x2 + u * u * u * x3, v * v * v * y0 + 3 * v * v * u * y1 + 3 * v * u * u * y2 + u * u * u * y3);
    }
  };
  const quad = (x1: number, y1: number, x2: number, y2: number) => {
    const n = segs(Math.hypot(x1 - x, y1 - y) + Math.hypot(x2 - x1, y2 - y1), tol);
    const x0 = x, y0 = y;
    for (let k = 1; k <= n; k++) { const u = k / n, v = 1 - u; to(v * v * x0 + 2 * v * u * x1 + u * u * x2, v * v * y0 + 2 * v * u * y1 + u * u * y2); }
  };
  while (i < tok.length) {
    if (typeof tok[i] === "string") cmd = tok[i++] as string;
    else if (!cmd) throw new Error("svg path: data must start with a command");
    const rel = cmd === cmd.toLowerCase(), ox = rel ? x : 0, oy = rel ? y : 0, C = cmd.toUpperCase();
    switch (C) {
      case "M": { flush(false); const nx = num() + ox, ny = num() + oy; sx = nx; sy = ny; x = nx; y = ny; cur = [[nx, ny]]; cmd = rel ? "l" : "L"; break; }
      case "L": to(num() + ox, num() + oy); break;
      case "H": to(num() + ox, y); break;
      case "V": to(x, num() + oy); break;
      case "C": { const a = num() + ox, b = num() + oy, c = num() + ox, e = num() + oy, f = num() + ox, h = num() + oy; cubic(a, b, c, e, f, h); lcx = c; lcy = e; break; }
      case "S": {
        const [a, b] = /[CS]/.test(prev) ? [2 * x - lcx, 2 * y - lcy] : [x, y];
        const c = num() + ox, e = num() + oy, f = num() + ox, h = num() + oy; cubic(a, b, c, e, f, h); lcx = c; lcy = e; break;
      }
      case "Q": { const a = num() + ox, b = num() + oy, c = num() + ox, e = num() + oy; quad(a, b, c, e); lqx = a; lqy = b; break; }
      case "T": {
        const [a, b] = /[QT]/.test(prev) ? [2 * x - lqx, 2 * y - lqy] : [x, y];
        quad(a, b, num() + ox, num() + oy); lqx = a; lqy = b; break;
      }
      case "A": { const rx = num(), ry = num(), rot = num(), la = num(), sw = num(); arc(x, y, rx, ry, rot, !!la, !!sw, num() + ox, num() + oy, tol, to); break; }
      case "Z": { if (cur.length) { x = sx; y = sy; } flush(true); cur = []; prev = "Z"; continue; }
      default: throw new Error(`svg path: unknown command ${cmd}`);
    }
    prev = C;
  }
  flush(false);
  return subs;
}

/** "a1 1 0 011 1": after rx ry rot, the two flags may be glued to each other and to the next number. */
function fixArcFlags(d: string): string {
  return d.replace(/([Aa])([^MmLlHhVvCcSsQqTtAaZz]*)/g, (_, c: string, body: string) => {
    const t: string[] = [];
    let k = 0, field = 0;
    const nums = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
    while (k < body.length) {
      if (/[\s,]/.test(body[k])) { k++; continue; }
      const f = field % 7;
      if (f === 3 || f === 4) { t.push(body[k]); k++; field++; continue; }   // a flag is exactly one char: 0 or 1
      nums.lastIndex = k; const m = nums.exec(body);
      if (!m) { t.push(body.slice(k)); break; }
      t.push(m[0]); k = nums.lastIndex; field++;
    }
    return c + " " + t.join(" ") + " ";
  });
}

const segs = (len: number, tol: number) => Math.max(2, Math.min(64, Math.ceil(Math.sqrt(len / (tol * 8)) * 2)));

function dedupe(p: Pt[], closed: boolean): Pt[] {
  const o: Pt[] = [];
  for (const q of p) { const l = o[o.length - 1]; if (!l || Math.abs(l[0] - q[0]) > 1e-6 || Math.abs(l[1] - q[1]) > 1e-6) o.push(q); }
  if (closed && o.length > 1) { const a = o[0], b = o[o.length - 1]; if (Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6) o.pop(); }
  return o;
}

// SVG arc (endpoint parameterisation, spec F.6.5) -> points.
function arc(x1: number, y1: number, rx: number, ry: number, rotDeg: number, large: boolean, sweep: boolean, x2: number, y2: number, tol: number, to: (x: number, y: number) => void) {
  if (rx === 0 || ry === 0 || (x1 === x2 && y1 === y2)) { to(x2, y2); return; }
  rx = Math.abs(rx); ry = Math.abs(ry);
  const phi = (rotDeg * Math.PI) / 180, c = Math.cos(phi), s = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2, xp = c * dx + s * dy, yp = -s * dx + c * dy;
  const lam = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
  if (lam > 1) { const k = Math.sqrt(lam); rx *= k; ry *= k; }
  const num = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp, den = rx * rx * yp * yp + ry * ry * xp * xp;
  let f = Math.sqrt(Math.max(0, num / den)); if (large === sweep) f = -f;
  const cxp = (f * rx * yp) / ry, cyp = (-f * ry * xp) / rx;
  const cx = c * cxp - s * cyp + (x1 + x2) / 2, cy = s * cxp + c * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => { const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; };
  const t1 = ang(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
  let dt = ang((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI; else if (sweep && dt < 0) dt += 2 * Math.PI;
  const n = Math.max(2, Math.min(96, Math.ceil(Math.abs(dt) * Math.sqrt(Math.max(rx, ry) / (tol * 8)))));
  for (let k = 1; k <= n; k++) {
    const a = t1 + (dt * k) / n, ex = rx * Math.cos(a), ey = ry * Math.sin(a);
    to(k === n ? x2 : c * ex - s * ey + cx, k === n ? y2 : s * ex + c * ey + cy);
  }
}
