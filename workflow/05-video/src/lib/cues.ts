/**
 * The SFX timeline the mix renders: every event the acts declare plus the automatic score (act changes, chapter cards,
 * the plan's silences), anchored, thinned, with the user's edits from the dashboard's SFX review applied
 * (05-video/sfx_edits.json = { off: [key], gainDb: { key: dB }, keep: [key] }).
 *
 * key = `${act}@${t.toFixed(2)}:${type}` (`#2`, `#3`… for events that share act, time and type). `seed` is the event's
 * index in the full list and `take` its rank among events of its type there, so removing one SFX never changes which
 * library sample the others get. Types, layers and anchors come from workflow/06-audio/sfx_types.json.
 */
export interface FoleyEvent { t: number; type: string; d?: number; gain?: number; pan?: number; act: string; hit?: number; auto?: true }
export interface SfxEdits { off?: string[]; gainDb?: Record<string, number>; keep?: string[] }
export type KeyedEvent = FoleyEvent & { key: string; seed: number; take: number; off?: true; thinned?: true; gainDb?: number };
export type MixEvent = FoleyEvent & { seed: number; take: number };
export interface SfxType { layer: "foley" | "design" | "bed"; anchor: "start" | "end" | "peak"; d: number | null; pre?: number; level: number; desc?: string }
export type SfxTypes = Record<string, SfxType>;

const r3 = (x: number) => Math.round(x * 1000) / 1000;

/**
 * An act writes t = the moment the sound HITS (a word's start). For `end` types (risers, swells) the sound must end
 * there, for `peak` types (transitions, swooshes) its loudest point is there; the mix wants the start. Returns the
 * event with t = where the sound starts, `hit` = the moment it was written for, and an `end` type's length in d.
 */
export function anchorEvent(e: FoleyEvent, types: SfxTypes): FoleyEvent {
  const ty = types[e.type];
  if (!ty || ty.anchor === "start") return e;
  if (ty.anchor === "end") {
    const d = Math.min(e.d ?? ty.d ?? 1, e.t);      // a build cannot start before 0: it gets shorter, the landing stays
    return d < 0.15 ? { ...e, hit: e.t } : { ...e, t: r3(e.t - d), d: r3(d), hit: e.t };
  }
  return { ...e, t: r3(Math.max(0, e.t - (ty.pre ?? 0.2))), hit: e.t };
}

/** The structure the automatic score reads: absolute seconds. */
export interface ScoreAct { id: string; start: number; end: number; chapter: boolean; intensity: number; silences: { start: number; stab: number }[] }

const MOVES = new Set(["transition", "swoosh", "whoosh", "whip", "reverse_swell", "riser", "boom", "impact", "sub_drop", "braam", "sweep"]);
const BUILDS = new Set(["riser", "reverse_swell"]);
const HITS = new Set(["impact", "boom", "sub_drop", "braam"]);

/**
 * Sound design that follows from the plan's structure, never from one video's content (events are `auto`, hit times):
 * - an act change gets a `transition` peaking on the cut (louder for more intense acts);
 * - a chapter act gets a `reverse_swell` into its first frame and a `boom` on it;
 * - each planned silence gets a `riser` that ends where the silence starts (the build cuts to nothing) and a hit on
 *   the word after it: `impact` in an intense act, a softer `sub_drop` otherwise.
 * Anything the act already scores near the same moment (within 0.6 s) wins and the automatic one is skipped.
 */
export function autoScore(acts: ScoreAct[], existing: FoleyEvent[]): FoleyEvent[] {
  const at = (e: FoleyEvent) => e.hit ?? e.t;
  const near = (t: number, set: Set<string>, w = 0.6) => existing.some((e) => set.has(e.type) && Math.abs(at(e) - t) <= w);
  const out: FoleyEvent[] = [];
  acts.forEach((a0, i) => {
    const a = { ...a0, start: r3(a0.start) };
    const lift = r3(0.55 + 0.45 * Math.max(0, Math.min(1, a.intensity)));
    if (i > 0 && !near(a.start, MOVES)) {
      if (a.chapter) {
        out.push({ t: a.start, type: "reverse_swell", d: 1.0, act: acts[i - 1].id, gain: 0.8, auto: true });
        out.push({ t: a.start, type: "boom", act: a.id, gain: lift, auto: true });
      } else out.push({ t: a.start, type: "transition", act: a.id, gain: lift, auto: true });
    }
    for (const s of a.silences) {
      const build = Math.min(2.5, s.start - a.start - 0.2);
      if (build >= 0.8 && !near(s.start, BUILDS)) out.push({ t: r3(s.start), type: "riser", d: r3(build), act: a.id, gain: lift, auto: true });
      if (!near(s.stab, HITS)) out.push({ t: r3(s.stab), type: a.intensity >= 0.55 ? "impact" : "sub_drop", act: a.id, gain: lift, auto: true });
    }
  });
  return out;
}

/** Limits that keep the foley from turning into clatter, and the big sounds rare enough to stay big. */
export const THIN = {
  foleyMinGap: 0.09,           // s: a second foley sound this close to the previous one is a pile-up
  foleyPerWindow: 6,           // at most this many foley sounds…
  window: 5,                   // …in any window of this many seconds
  designSpacing: { impact: 6, boom: 4, sub_drop: 4, braam: 8, riser: 6, reverse_swell: 4, transition: 1.5, swoosh: 0.4, record_scratch: 10, tension: 0 } as Record<string, number>,
};

/**
 * Which events to leave out of the mix. Greedy in time order: authored events before automatic ones, louder before
 * quieter. Foley: no two within foleyMinGap, at most foleyPerWindow per window. Design: the same type no closer than
 * designSpacing (between hit times). Exempt: indices in `keep`. Returns the indices thinned.
 */
export function thin(events: FoleyEvent[], types: SfxTypes, keep: Set<number> = new Set()): Set<number> {
  const out = new Set<number>();
  const order = events.map((e, i) => i).sort((a, b) => {
    const A = events[a], B = events[b];
    return (A.auto ? 1 : 0) - (B.auto ? 1 : 0) || (B.gain ?? 1) - (A.gain ?? 1) || A.t - B.t;
  });
  const keptFoley: number[] = [], keptDesign = new Map<string, number[]>();
  for (const i of order) {
    const e = events[i], ty = types[e.type];
    if (!ty || keep.has(i)) { if (ty?.layer === "foley") keptFoley.push(e.t); continue; }
    if (ty.layer === "foley") {
      const tooClose = keptFoley.some((t) => Math.abs(t - e.t) < THIN.foleyMinGap);
      const crowded = (() => {      // would any window containing e exceed the cap?
        const near = keptFoley.filter((t) => Math.abs(t - e.t) < THIN.window).concat(e.t).sort((a, b) => a - b);
        for (let j = 0, k = 0; k < near.length; k++) {
          while (near[k] - near[j] >= THIN.window) j++;
          if (k - j + 1 > THIN.foleyPerWindow) return true;
        }
        return false;
      })();
      if (tooClose || crowded) out.add(i); else keptFoley.push(e.t);
    } else {
      const gap = THIN.designSpacing[e.type] ?? 3, hit = e.hit ?? e.t, prev = keptDesign.get(e.type) ?? [];
      if (gap > 0 && prev.some((t) => Math.abs(t - hit) < gap)) out.add(i);
      else keptDesign.set(e.type, prev.concat(hit));
    }
  }
  return out;
}

/**
 * events: sorted by time. Returns `all` (every event with its key, take and edits: events_all.json), `on` (what the mix
 * renders: events.json, removed and thinned ones dropped, the gain edit folded into `gain`) and `stale` (edit keys that
 * match no event any more, because the act's timing changed). Thinning runs only when `types` is given; `keep` restores
 * a thinned event.
 */
export function applySfxEdits(events: FoleyEvent[], edits: SfxEdits, types?: SfxTypes): { all: KeyedEvent[]; on: MixEvent[]; stale: string[] } {
  const off = new Set(edits.off ?? []), keepKeys = new Set(edits.keep ?? []);
  const seen = new Map<string, number>(), takes = new Map<string, number>();
  const keyed = events.map((e, i) => {
    let key = `${e.act}@${e.t.toFixed(2)}:${e.type}`;
    const n = (seen.get(key) ?? 0) + 1; seen.set(key, n);
    if (n > 1) key += `#${n}`;
    const take = takes.get(e.type) ?? 0; takes.set(e.type, take + 1);
    return { key, e, i, take };
  });
  const live = keyed.filter((k) => !off.has(k.key));
  const thinned = new Set<string>();
  if (types) {
    const idx = thin(live.map((k) => k.e), types, new Set(live.flatMap((k, j) => (keepKeys.has(k.key) ? [j] : []))));
    for (const j of idx) thinned.add(live[j].key);
  }
  const all: KeyedEvent[] = keyed.map(({ key, e, i, take }) => {
    const db = edits.gainDb?.[key];
    return { key, ...e, seed: i, take, ...(off.has(key) ? { off: true as const } : {}), ...(thinned.has(key) ? { thinned: true as const } : {}), ...(db ? { gainDb: db } : {}) };
  });
  const on = all.filter((e) => !e.off && !e.thinned).map(({ key, off: _o, thinned: _t, gainDb, ...e }) =>
    gainDb ? { ...e, gain: Math.round((e.gain ?? 1) * 10 ** (gainDb / 20) * 1000) / 1000 } : e);
  const stale = [...off, ...keepKeys, ...Object.keys(edits.gainDb ?? {})].filter((k) => !all.some((e) => e.key === k));
  return { all, on, stale };
}
