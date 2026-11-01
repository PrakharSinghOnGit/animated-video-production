/**
 * Deterministic diagnosis: turns the snapshot into per-video metrics, channel baselines and flags.
 * The flags tell the reviewer where to look; the reviewer explains why and proposes lessons.
 *
 * Baselines are the channel's own medians (long-form uploads with enough views). Before there are 3 such videos the
 * only absolute references used are YouTube's own: relativeRetentionPerformance (0.5 = median of similar-length videos)
 * and YouTube's statement that half of channels have an impressions CTR between 2% and 10%. Every flag says which it used.
 */
import path from "node:path";
import { median, planActs, readJson, wsDir, fmtTime, type Snapshot, type Video, type RetPoint } from "./lib";

export const MIN_VIEWS = 100;          // below this a video's retention/CTR is too noisy to judge
export const MIN_IMPRESSIONS = 1000;   // below this CTR is too noisy
export const MIN_BASELINE = 3;         // videos needed before channel medians are used

export type Area = "packaging" | "hook" | "retention" | "act" | "promise" | "engagement" | "sample";
export interface Flag {
  area: Area;
  kind: "problem" | "strength" | "note";
  severity: 1 | 2 | 3;
  text: string;
  /** prompts this points at */
  targets: string[];
  metric?: string; value?: string; baseline?: string;
  /** "channel median (n=4)" | "YouTube relative retention" | "YouTube CTR range" */
  basis?: string;
  at?: { s: number; act?: string; words?: string };
}
export interface ActStat { id: string; title: string; startS: number; endS: number; startWatch: number; endWatch: number; lossPerMin: number; rel?: number }
export interface Metrics { ctr?: number; impressions?: number; avgPct?: number; ret30?: number; relEarly?: number; relAll?: number; subsPer1k?: number; engPer1k?: number }
export interface VideoDiag { ytId: string; ws?: string; metrics: Metrics; flags: Flag[]; acts: ActStat[]; dips: { s: number; drop: number; act?: string; words?: string }[] }
export interface Diagnosis { baseline: Metrics & { n: number }; videos: Record<string, VideoDiag> }

const pct = (x?: number, d = 1) => (x === undefined || !Number.isFinite(x) ? "n/a" : `${(x * 100).toFixed(d)}%`);
const num = (x?: number, d = 1) => (x === undefined || !Number.isFinite(x) ? "n/a" : x.toFixed(d));

/** audienceWatchRatio at a time ratio, linearly interpolated. */
function watchAt(ret: RetPoint[], r: number): number {
  if (!ret.length) return NaN;
  if (r <= ret[0].r) return ret[0].watch;
  for (let i = 1; i < ret.length; i++) if (ret[i].r >= r) { const a = ret[i - 1], b = ret[i]; return a.watch + (b.watch - a.watch) * ((r - a.r) / (b.r - a.r || 1)); }
  return ret[ret.length - 1].watch;
}

/** The spoken words around a moment, from the workspace's word-level captions. */
function wordsAt(ws: string | undefined, s: number): string | undefined {
  if (!ws) return;
  const caps = readJson<{ text: string; startMs: number }[]>(path.join(wsDir(ws), "05-video/captions.json"));
  if (!caps?.length) return;
  const t = s * 1000;
  return caps.filter((c) => c.startMs >= t - 3000 && c.startMs <= t + 3000).map((c) => c.text).join("").trim() || undefined;
}

export function metricsOf(v: Video): Metrics {
  const ret = v.retention ?? [];
  const early = ret.filter((p) => p.r <= 0.1 && p.rel !== undefined);
  return {
    ctr: v.ctr, impressions: v.impressions, avgPct: v.avgPct !== undefined ? v.avgPct / 100 : undefined,
    ret30: ret.length && v.durationS > 30 ? watchAt(ret, 30 / v.durationS) : undefined,
    relEarly: early.length ? median(early.map((p) => p.rel!)) : undefined,
    relAll: ret.some((p) => p.rel !== undefined) ? median(ret.map((p) => p.rel ?? NaN)) : undefined,
    subsPer1k: v.views ? (((v.subsGained ?? 0) - (v.subsLost ?? 0)) / v.views) * 1000 : undefined,
    engPer1k: v.views ? ((v.likes + v.comments) / v.views) * 1000 : undefined,
  };
}

function actStats(v: Video): { acts: ActStat[]; dips: VideoDiag["dips"] } {
  const ret = v.retention ?? [];
  if (ret.length < 10 || !v.durationS) return { acts: [], dips: [] };
  const acts: ActStat[] = [];
  if (v.ws) {
    for (const a of planActs(v.ws)) {
      // the first 30 s are judged as the hook; an act's loss rate counts from 0:30 so the opening drop is not blamed on act 1
      const s0 = Math.max(a.startMs / 1000, 30), s1 = Math.min(a.endMs / 1000, v.durationS);
      if (s1 - s0 < 10) continue;
      const w0 = watchAt(ret, s0 / v.durationS), w1 = watchAt(ret, s1 / v.durationS);
      const inAct = ret.filter((p) => p.r * v.durationS >= s0 && p.r * v.durationS <= s1 && p.rel !== undefined);
      acts.push({ id: a.id, title: a.title, startS: s0, endS: s1, startWatch: w0, endWatch: w1, lossPerMin: ((w0 - w1) / (s1 - s0)) * 60, rel: inAct.length ? median(inAct.map((p) => p.rel!)) : undefined });
    }
  }
  // dips: the steepest drops after the first 30 s, measured over ~3% windows, larger than 2× the median drop
  const drops: { s: number; drop: number }[] = [];
  for (let i = 3; i < ret.length; i++) {
    const s = ret[i - 3].r * v.durationS;
    if (s < 30 || ret[i].r > 0.97) continue;
    drops.push({ s: ret[i - 3].r * v.durationS, drop: ret[i - 3].watch - ret[i].watch });
  }
  const typical = median(drops.map((d) => d.drop));
  const dips = drops.filter((d) => d.drop > Math.max(0.03, 2 * typical)).sort((a, b) => b.drop - a.drop)
    .filter((d, i, a) => a.slice(0, i).every((o) => Math.abs(o.s - d.s) > 15)).slice(0, 4)
    .map((d) => ({ ...d, act: acts.find((a) => d.s >= a.startS && d.s < a.endS)?.id, words: wordsAt(v.ws, d.s) }));
  return { acts, dips };
}

export function diagnose(snap: Snapshot): Diagnosis {
  const long = snap.videos.filter((v) => !v.short && v.views >= MIN_VIEWS);
  const ms = long.map(metricsOf);
  const med = (k: keyof Metrics, filter: (m: Metrics, i: number) => boolean = () => true) => median(ms.filter(filter).map((m) => m[k] as number));
  const baseline = {
    n: long.length,
    ctr: med("ctr", (m) => (m.impressions ?? 0) >= MIN_IMPRESSIONS), avgPct: med("avgPct"), ret30: med("ret30"),
    relEarly: med("relEarly"), relAll: med("relAll"), subsPer1k: med("subsPer1k"), engPer1k: med("engPer1k"),
  };
  const useBase = baseline.n >= MIN_BASELINE;
  const basis = `channel median (n=${baseline.n})`;
  const out: Record<string, VideoDiag> = {};

  for (const v of snap.videos) {
    const m = metricsOf(v);
    const flags: Flag[] = [];
    const { acts, dips } = actStats(v);
    if (v.short) { out[v.ytId] = { ytId: v.ytId, ws: v.ws, metrics: m, flags: [{ area: "sample", kind: "note", severity: 1, text: "Short (≤3 min): judged separately, not against long-form baselines.", targets: [] }], acts, dips }; continue; }
    if (v.views < MIN_VIEWS) flags.push({ area: "sample", kind: "note", severity: 1, text: `Only ${v.views} views: too few to judge retention or CTR reliably.`, targets: [] });

    // packaging (thumbnail + title)
    if (m.ctr !== undefined && (m.impressions ?? 0) >= MIN_IMPRESSIONS) {
      if (useBase && Number.isFinite(baseline.ctr)) {
        if (m.ctr < baseline.ctr * 0.8) flags.push({ area: "packaging", kind: "problem", severity: m.ctr < baseline.ctr * 0.6 ? 3 : 2, text: `CTR ${pct(m.ctr)} is below the channel median ${pct(baseline.ctr)}: the thumbnail/title is not earning the click.`, targets: ["THUMBS", "META"], metric: "CTR", value: pct(m.ctr), baseline: pct(baseline.ctr), basis });
        else if (m.ctr > baseline.ctr * 1.25) flags.push({ area: "packaging", kind: "strength", severity: 2, text: `CTR ${pct(m.ctr)} beats the channel median ${pct(baseline.ctr)}: this package worked.`, targets: ["THUMBS", "META"], metric: "CTR", value: pct(m.ctr), baseline: pct(baseline.ctr), basis });
      } else if (m.ctr < 0.02) flags.push({ area: "packaging", kind: "problem", severity: 2, text: `CTR ${pct(m.ctr)} is under 2%, the bottom of the range YouTube says half of channels fall in (2-10%).`, targets: ["THUMBS", "META"], metric: "CTR", value: pct(m.ctr), baseline: "2-10%", basis: "YouTube CTR range (weak: no channel baseline yet)" });
    } else if (m.ctr === undefined) flags.push({ area: "packaging", kind: "note", severity: 1, text: "No impressions/CTR yet (Reporting API reports start 1-2 days after the job, from that day on).", targets: [] });

    // hook: first 30 s
    if (m.relEarly !== undefined && m.relEarly < 0.4) flags.push({ area: "hook", kind: "problem", severity: m.relEarly < 0.25 ? 3 : 2, text: `The opening holds viewers worse than most similar-length YouTube videos (relative retention ${num(m.relEarly, 2)} in the first 10%; 0.5 = typical).`, targets: ["WRITER"], metric: "early relative retention", value: num(m.relEarly, 2), baseline: "0.50", basis: "YouTube relative retention", at: { s: 0, act: acts[0]?.id, words: wordsAt(v.ws, 10) } });
    else if (useBase && m.ret30 !== undefined && Number.isFinite(baseline.ret30) && m.ret30 < baseline.ret30 - 0.08) flags.push({ area: "hook", kind: "problem", severity: 2, text: `${pct(m.ret30, 0)} still watching at 0:30 vs the channel median ${pct(baseline.ret30, 0)}.`, targets: ["WRITER"], metric: "retention at 0:30", value: pct(m.ret30, 0), baseline: pct(baseline.ret30, 0), basis, at: { s: 30, act: acts[0]?.id } });
    else if (m.relEarly !== undefined && m.relEarly > 0.6) flags.push({ area: "hook", kind: "strength", severity: 2, text: `Strong opening: relative retention ${num(m.relEarly, 2)} in the first 10%.`, targets: ["WRITER"], metric: "early relative retention", value: num(m.relEarly, 2), baseline: "0.50", basis: "YouTube relative retention" });

    // overall retention
    if (useBase && m.avgPct !== undefined && Number.isFinite(baseline.avgPct) && m.avgPct < baseline.avgPct * 0.85) flags.push({ area: "retention", kind: "problem", severity: 2, text: `Average viewed ${pct(m.avgPct, 0)} vs the channel median ${pct(baseline.avgPct, 0)}.`, targets: ["WRITER", "DIRECTOR"], metric: "avg % viewed", value: pct(m.avgPct, 0), baseline: pct(baseline.avgPct, 0), basis });
    else if (m.relAll !== undefined && m.relAll < 0.4) flags.push({ area: "retention", kind: "problem", severity: 2, text: `Across the video, retention is below typical for its length (relative ${num(m.relAll, 2)}).`, targets: ["WRITER", "DIRECTOR"], metric: "relative retention", value: num(m.relAll, 2), baseline: "0.50", basis: "YouTube relative retention" });

    // promise mismatch: they clicked, then left early
    const goodCtr = m.ctr !== undefined && (useBase && Number.isFinite(baseline.ctr) ? m.ctr >= baseline.ctr : m.ctr >= 0.05);
    if (goodCtr && flags.some((f) => f.area === "hook" && f.kind === "problem")) flags.push({ area: "promise", kind: "problem", severity: 3, text: "Good CTR but a weak opening: the title/thumbnail may promise something the first 30 seconds do not pay off.", targets: ["META", "WRITER"], basis: "CTR vs early retention" });

    // acts: losing viewers faster than the rest of the video
    if (acts.length >= 3) {
      const body = acts;
      const typical = median(body.map((a) => a.lossPerMin));
      for (const a of body) {
        const lost = a.startWatch - a.endWatch;
        if (a.lossPerMin > Math.max(typical * 1.5, 0.01) && lost >= 0.03) flags.push({ area: "act", kind: "problem", severity: a.lossPerMin > typical * 2.2 ? 3 : 2, text: `${a.id} "${a.title}" (${fmtTime(a.startS)}-${fmtTime(a.endS)}) loses ${pct(a.lossPerMin, 1)} of viewers per minute, vs ${pct(typical, 1)} typical for this video.`, targets: ["WRITER", "DIRECTOR", "ACT"], metric: "loss per minute", value: pct(a.lossPerMin), baseline: pct(typical), basis: "other acts of this video", at: { s: a.startS, act: a.id } });
        else if (a.endWatch > a.startWatch + 0.01) flags.push({ area: "act", kind: "strength", severity: 1, text: `${a.id} "${a.title}" gains viewers (rewatches or skips into it).`, targets: ["DIRECTOR", "ACT"], at: { s: a.startS, act: a.id } });
      }
    }
    for (const d of dips.slice(0, 2)) if (!flags.some((f) => f.at?.act && f.at.act === d.act && f.area === "act")) flags.push({ area: "act", kind: "problem", severity: 1, text: `Sharp drop of ${pct(d.drop, 1)} around ${fmtTime(d.s)}${d.act ? ` (${d.act})` : ""}${d.words ? `: "${d.words}"` : ""}.`, targets: ["WRITER", "ACT"], at: d });

    // engagement → subscribers
    if (useBase && m.subsPer1k !== undefined && Number.isFinite(baseline.subsPer1k) && baseline.subsPer1k > 0 && m.subsPer1k < baseline.subsPer1k * 0.6) flags.push({ area: "engagement", kind: "problem", severity: 1, text: `${num(m.subsPer1k)} net subscribers per 1k views vs the channel median ${num(baseline.subsPer1k)}.`, targets: ["WRITER"], metric: "subs per 1k views", value: num(m.subsPer1k), baseline: num(baseline.subsPer1k), basis });

    flags.sort((a, b) => (a.kind === "problem" ? 0 : 1) - (b.kind === "problem" ? 0 : 1) || b.severity - a.severity);
    out[v.ytId] = { ytId: v.ytId, ws: v.ws, metrics: m, flags, acts, dips };
  }
  return { baseline, videos: out };
}
