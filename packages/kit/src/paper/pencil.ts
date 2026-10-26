/**
 * The pencil performer: acts register each pencil mark as an op ({t0, t1, tip, red}) and the
 * pencil follows them. Calm, readable timing for long-form video: hops between marks take at
 * least MIN_HOP s and arc off the paper; the pencil lingers on a fresh mark, then clears off it
 * so the mark reads on its word; it approaches the next mark well before it starts.
 */
import { type Pt } from "./engine";
import { lerp, seg, smooth } from "./lib";

export interface PencilOp { t0: number; t1: number; tip: Pt; red: boolean }
export interface PencilState { tip: Pt; lift: number; away: number; red: number }

export const MIN_HOP = 0.5;     // s: shortest travel between two marks
const MAX_HOP = 1.8;            // s: farther apart than this, the pencil leaves and comes back
const LINGER = 0.7;             // s: stays on a finished mark before clearing off
const APPROACH = 1.0;           // s: arrives this long before a mark starts

export function pencilPerformer(t: number, ops: PencilOp[]): PencilState | null {
  let prev: PencilOp | undefined, next: PencilOp | undefined, active: PencilOp | undefined;
  for (const o of ops) {
    if (t >= o.t0 && t <= o.t1 && (!active || o.t0 > active.t0)) active = o;
    if (o.t1 < t && (!prev || o.t1 > prev.t1)) prev = o;
    if (o.t0 > t && (!next || o.t0 < next.t0)) next = o;
  }
  // a hop that started at the previous mark's end may still be travelling into the active mark
  const before = active ? ops.filter((o) => o.t1 <= active!.t0 + 1e-6 && o !== active).sort((a, b) => b.t1 - a.t1)[0] : undefined;
  if (active && before && active.t0 - before.t1 < MIN_HOP && t < before.t1 + MIN_HOP) {
    const k = smooth(seg(t, before.t1, before.t1 + MIN_HOP));
    return hop(before, active, k);
  }
  if (active) return { tip: active.tip, lift: 0, away: 0, red: active.red ? 1 : 0 };
  if (prev && next && next.t0 - prev.t1 <= MAX_HOP) {
    const k = smooth(seg(t, prev.t1, prev.t1 + Math.max(MIN_HOP, next.t0 - prev.t1)));
    return hop(prev, next, k);
  }
  if (prev && t < prev.t1 + LINGER + 0.5) {
    return { tip: prev.tip, lift: 0, away: smooth(seg(t, prev.t1 + LINGER, prev.t1 + LINGER + 0.5)), red: +prev.red };
  }
  if (next && t > next.t0 - APPROACH) {
    return { tip: next.tip, lift: 0, away: 1 - smooth(seg(t, next.t0 - APPROACH, next.t0)), red: +next.red };
  }
  return null;
}

function hop(a: PencilOp, b: PencilOp, k: number): PencilState {
  return {
    tip: [lerp(a.tip[0], b.tip[0], k), lerp(a.tip[1], b.tip[1], k)],
    lift: Math.sin(Math.PI * k) * 0.7,
    away: 0,
    red: lerp(+a.red, +b.red, smooth(seg(k, 0.3, 0.7))),
  };
}

/** Comfortable handwriting time for a text (about 9 characters a second, 0.5–2.4 s). */
export function writeTime(text: string): number {
  return Math.min(2.4, Math.max(0.5, text.length / 9));
}
