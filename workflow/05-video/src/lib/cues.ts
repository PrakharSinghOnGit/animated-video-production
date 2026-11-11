/**
 * The foley timeline the mix renders: every event the acts declare, with the user's edits from the dashboard's SFX
 * review applied (05-video/sfx_edits.json = { off: [key], gainDb: { key: dB } }).
 *
 * key = `${act}@${t.toFixed(2)}:${type}` (`#2`, `#3`… for events that share act, time and type). `seed` is the event's
 * index in the full list, so removing one SFX never changes which library sample the others get.
 */
export interface FoleyEvent { t: number; type: string; d?: number; gain?: number; pan?: number; act: string }
export interface SfxEdits { off?: string[]; gainDb?: Record<string, number> }
export type KeyedEvent = FoleyEvent & { key: string; seed: number; off?: true; gainDb?: number };
export type MixEvent = FoleyEvent & { seed: number };

/**
 * events: sorted by time. Returns `all` (every event with its key and edits: events_all.json), `on` (what the mix
 * renders: events.json, removed ones dropped and the gain edit folded into `gain`) and `stale` (edit keys that match
 * no event any more, because the act's timing changed).
 */
export function applySfxEdits(events: FoleyEvent[], edits: SfxEdits): { all: KeyedEvent[]; on: MixEvent[]; stale: string[] } {
  const off = new Set(edits.off ?? []);
  const seen = new Map<string, number>();
  const all = events.map((e, i) => {
    let key = `${e.act}@${e.t.toFixed(2)}:${e.type}`;
    const n = (seen.get(key) ?? 0) + 1; seen.set(key, n);
    if (n > 1) key += `#${n}`;
    const db = edits.gainDb?.[key];
    return { key, ...e, seed: i, ...(off.has(key) ? { off: true as const } : {}), ...(db ? { gainDb: db } : {}) };
  });
  const on = all.filter((e) => !e.off).map(({ key, off: _o, gainDb, ...e }) =>
    gainDb ? { ...e, gain: Math.round((e.gain ?? 1) * 10 ** (gainDb / 20) * 1000) / 1000 } : e);
  const stale = [...off, ...Object.keys(edits.gainDb ?? {})].filter((k) => !all.some((e) => e.key === k));
  return { all, on, stale };
}
