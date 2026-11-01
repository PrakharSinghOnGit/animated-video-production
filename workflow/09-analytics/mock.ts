/**
 * Writes workspace/_analytics/snapshot.mock.json: invented numbers, clearly flagged `mock: true`, for building and
 * testing the Analytics page and the reviewer without touching the API. Never mixed with the real snapshot.
 * The first linked workspace with a plan gets a retention curve with a dip inside its 4th act.
 *
 * Usage: bun run yt:mock
 */
import { MOCK_SNAPSHOT, planActs, workspaces, writeJson, type Snapshot, type Video, type RetPoint } from "./lib";

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const ws = workspaces().reverse().find((w) => planActs(w).length >= 4);

function curve(durationS: number, hook: number, decay: number, dipAt?: [number, number], depth = 0.06): RetPoint[] {
  const pts: RetPoint[] = [];
  for (let i = 0; i <= 100; i++) {
    const r = i / 100, s = r * durationS;
    let w = 1 - hook * (1 - Math.exp(-s / 12)) - decay * r;
    if (dipAt && s > dipAt[0]) w -= depth * Math.min(1, (s - dipAt[0]) / (dipAt[1] - dipAt[0]));
    w += (rnd() - 0.5) * 0.008;
    pts.push({ r, watch: Math.max(0.02, +w.toFixed(4)), rel: +Math.min(0.95, Math.max(0.05, 0.5 + (0.32 - hook) * 1.2 - (dipAt && s > dipAt[0] ? 0.12 : 0) + (rnd() - 0.5) * 0.05)).toFixed(3) });
  }
  return pts;
}

const day = (n: number) => new Date(Date.now() - n * 864e5).toISOString();
const mk = (o: Partial<Video> & { ytId: string; title: string; ago: number; durationS: number; views: number; ctr: number; hook: number; decay: number }): Video => {
  const ret = curve(o.durationS, o.hook, o.decay, (o as any).dipAt);
  const avg = ret.reduce((a, p) => a + p.watch, 0) / ret.length;
  const impressions = Math.round(o.views / o.ctr / 0.85);
  return {
    ytId: o.ytId, title: o.title, publishedAt: day(o.ago), durationS: o.durationS, views: o.views, likes: Math.round(o.views * 0.04), comments: Math.round(o.views * 0.004),
    minutes: Math.round((o.views * avg * o.durationS) / 60), avdS: Math.round(avg * o.durationS), avgPct: +(avg * 100).toFixed(1),
    subsGained: Math.round(o.views * 0.012), subsLost: Math.round(o.views * 0.001), shares: Math.round(o.views * 0.006),
    impressions, ctr: o.ctr, retention: ret,
    traffic: [{ source: "BROWSE", views: Math.round(o.views * 0.46), minutes: 0 }, { source: "YT_SEARCH", views: Math.round(o.views * 0.22), minutes: 0 }, { source: "RELATED_VIDEO", views: Math.round(o.views * 0.18), minutes: 0 }, { source: "SHORTS", views: Math.round(o.views * 0.08), minutes: 0 }, { source: "EXT_URL", views: Math.round(o.views * 0.06), minutes: 0 }],
    ws: o.ws, short: o.durationS <= 180,
  };
};

const acts = ws ? planActs(ws) : [];
const durA = acts.length ? Math.round(acts[acts.length - 1].endMs / 1000) : 526;
const dip: [number, number] | undefined = acts[3] ? [acts[3].startMs / 1000 + 10, acts[3].endMs / 1000 - 10] : undefined;
const videos: Video[] = [
  mk({ ytId: "MOCKvid0003", title: "Why You Can Afford the Coffee but Never the House", ago: 5, durationS: durA, views: 2140, ctr: 0.031, hook: 0.38, decay: 0.3, ws, ...(dip ? { dipAt: dip } : {}) } as any),
  mk({ ytId: "MOCKvid0002", title: "The Map of the Stock Market", ago: 12, durationS: 548, views: 3810, ctr: 0.058, hook: 0.27, decay: 0.33 }),
  mk({ ytId: "MOCKvid0001", title: "How Currency Markets Really Work", ago: 19, durationS: 572, views: 1520, ctr: 0.047, hook: 0.3, decay: 0.38 }),
  mk({ ytId: "MOCKvid0000", title: "Inflation Explained in 9 Minutes", ago: 26, durationS: 531, views: 2890, ctr: 0.052, hook: 0.29, decay: 0.31 }),
  mk({ ytId: "MOCKshort01", title: "Your coffee is not the problem #shorts", ago: 4, durationS: 48, views: 9100, ctr: 0.09, hook: 0.2, decay: 0.2 }),
];
const daily = Array.from({ length: 90 }, (_, i) => {
  const v = Math.round(40 + i * 2.2 + rnd() * 60 + (i > 60 ? 120 : 0));
  return { day: day(89 - i).slice(0, 10), views: v, minutes: Math.round(v * 3.6), subsNet: Math.round(v * 0.011 + rnd() * 2) };
});
const snap: Snapshot = {
  fetchedAt: new Date().toISOString(), mock: true,
  channel: { id: "UC_MOCK", title: "The Wealth Gap (mock)", handle: "@mock", subs: 1240, views: videos.reduce((a, v) => a + v.views, 0), videos: videos.length },
  range: { start: day(120).slice(0, 10), end: day(0).slice(0, 10) }, daily, videos,
  reach: { status: "ok", note: "mock data", since: day(30) }, quota: { dataApiUnits: 0, calls: 0 }, errors: [],
};
writeJson(MOCK_SNAPSHOT, snap);
console.log(`✅ mock snapshot written (${videos.length} videos${ws ? `, ${ws} linked with its act timeline` : ""}): ${MOCK_SNAPSHOT}`);
