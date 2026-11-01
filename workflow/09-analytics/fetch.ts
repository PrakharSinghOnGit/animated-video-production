/**
 * Pull the channel's numbers into workspace/_analytics/snapshot.json (the dashboard and the reviewer read only this cache).
 *
 * Usage: bun run yt:fetch [--retention-limit 12]
 *
 * Sources and cost:
 *  - YouTube Data API v3 (quota 10,000 units/day): channel, uploads list, per-video stats. About 3 units for <50 videos.
 *  - YouTube Analytics API (separate quota): per-video totals, last 90 days daily, and the retention curve + traffic
 *    sources of linked videos plus the newest long-form uploads (capped by --retention-limit).
 *  - YouTube Reporting API: impressions and CTR are not in the Analytics API, only in the daily "reach" bulk reports.
 *    The first run creates the reporting job; Google starts producing reports about a day or two later, from the job
 *    start onward. Each report CSV is downloaded once and cached in _analytics/reach/.
 */
import fs from "node:fs";
import path from "node:path";
import { DIR, SNAPSHOT, calls, gapi, mapping, writeJson, readJson, type Snapshot, type Video, type RetPoint } from "./lib";

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const RET_LIMIT = parseInt(flag("--retention-limit") ?? "12", 10);
const DATA = "https://www.googleapis.com/youtube/v3";
const ANA = "https://youtubeanalytics.googleapis.com/v2/reports";
const REP = "https://youtubereporting.googleapis.com/v1";
const errors: string[] = [];
let units = 0;
const day = (d: Date) => d.toISOString().slice(0, 10);
const today = day(new Date());

function isoDur(s: string): number {
  const m = s?.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  return m ? (+(m[1] ?? 0)) * 86400 + (+(m[2] ?? 0)) * 3600 + (+(m[3] ?? 0)) * 60 + (+(m[4] ?? 0)) : 0;
}
async function report(params: Record<string, string>): Promise<{ headers: string[]; rows: any[][] }> {
  const j = await gapi(`${ANA}?${new URLSearchParams({ ids: "channel==MINE", ...params })}`);
  return { headers: (j.columnHeaders ?? []).map((h: any) => h.name), rows: j.rows ?? [] };
}
const rowsAs = (r: { headers: string[]; rows: any[][] }) => r.rows.map((row) => Object.fromEntries(r.headers.map((h, i) => [h, row[i]])));

console.log("📡 Fetching YouTube data…");
const t0 = Date.now();

// ── channel + uploads (Data API) ──
const ch = (await gapi(`${DATA}/channels?part=snippet,statistics,contentDetails&mine=true`)).items?.[0];
units += 1;
if (!ch) { console.error("❌ this Google account has no YouTube channel (pick the channel's account or Brand Account in bun run yt:auth)"); process.exit(1); }
const uploads = ch.contentDetails?.relatedPlaylists?.uploads;
const ids: string[] = [];
let page = "";
do {
  const j = await gapi(`${DATA}/playlistItems?part=contentDetails&maxResults=50&playlistId=${uploads}${page ? `&pageToken=${page}` : ""}`);
  units += 1;
  for (const it of j.items ?? []) ids.push(it.contentDetails.videoId);
  page = j.nextPageToken ?? "";
} while (page && ids.length < 500);

const map = mapping();
const videos: Video[] = [];
for (let i = 0; i < ids.length; i += 50) {
  const j = await gapi(`${DATA}/videos?part=snippet,statistics,contentDetails&id=${ids.slice(i, i + 50).join(",")}`);
  units += 1;
  for (const v of j.items ?? []) {
    const durationS = isoDur(v.contentDetails?.duration);
    videos.push({
      ytId: v.id, title: v.snippet.title, publishedAt: v.snippet.publishedAt, durationS,
      thumb: v.snippet.thumbnails?.medium?.url ?? v.snippet.thumbnails?.default?.url,
      views: +(v.statistics.viewCount ?? 0), likes: +(v.statistics.likeCount ?? 0), comments: +(v.statistics.commentCount ?? 0),
      ws: map[v.id], short: durationS > 0 && durationS <= 180,
    });
  }
}
videos.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
const start = day(new Date(ch.snippet.publishedAt ?? "2020-01-01"));
console.log(`   ${ch.snippet.title}: ${videos.length} uploads, ${Object.keys(map).length} linked to workspaces`);

// ── per-video totals (Analytics API) ──
try {
  const r = rowsAs(await report({ startDate: start, endDate: today, dimensions: "video", sort: "-views", maxResults: "200",
    metrics: "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost,shares" }));
  for (const row of r) {
    const v = videos.find((x) => x.ytId === row.video);
    if (!v) continue;
    Object.assign(v, { minutes: row.estimatedMinutesWatched, avdS: row.averageViewDuration, avgPct: row.averageViewPercentage, subsGained: row.subscribersGained, subsLost: row.subscribersLost, shares: row.shares });
  }
} catch (e: any) { errors.push(`per-video totals: ${e.message}`); }

// ── channel daily, last 90 days ──
let daily: Snapshot["daily"] = [];
try {
  const r = rowsAs(await report({ startDate: day(new Date(Date.now() - 90 * 864e5)), endDate: today, dimensions: "day", sort: "day", metrics: "views,estimatedMinutesWatched,subscribersGained,subscribersLost" }));
  daily = r.map((x) => ({ day: x.day, views: x.views, minutes: x.estimatedMinutesWatched, subsNet: x.subscribersGained - x.subscribersLost }));
} catch (e: any) { errors.push(`daily: ${e.message}`); }

// ── retention + traffic for linked videos and the newest long-form uploads ──
const deep = [...videos.filter((v) => v.ws), ...videos.filter((v) => !v.ws && !v.short)].filter((v, i, a) => a.indexOf(v) === i).slice(0, Math.max(RET_LIMIT, videos.filter((v) => v.ws).length));
for (const v of deep) {
  try {
    const r = rowsAs(await report({ startDate: start, endDate: today, dimensions: "elapsedVideoTimeRatio", filters: `video==${v.ytId}`, metrics: "audienceWatchRatio,relativeRetentionPerformance" }));
    v.retention = r.map((x): RetPoint => ({ r: x.elapsedVideoTimeRatio, watch: x.audienceWatchRatio, rel: x.relativeRetentionPerformance }));
  } catch (e: any) { errors.push(`retention ${v.ytId}: ${e.message}`); }
  try {
    const r = rowsAs(await report({ startDate: start, endDate: today, dimensions: "insightTrafficSourceType", filters: `video==${v.ytId}`, sort: "-views", metrics: "views,estimatedMinutesWatched" }));
    v.traffic = r.map((x) => ({ source: x.insightTrafficSourceType, views: x.views, minutes: x.estimatedMinutesWatched }));
  } catch (e: any) { errors.push(`traffic ${v.ytId}: ${e.message}`); }
}

// ── impressions + CTR (Reporting API reach report) ──
const reach: Snapshot["reach"] = { status: "unavailable", note: "" };
try {
  const types = (await gapi(`${REP}/reportTypes`)).reportTypes ?? [];
  const type = types.find((t: any) => t.id === "channel_reach_basic_a1") ?? types.find((t: any) => /reach/.test(t.id) && /^channel_/.test(t.id));
  if (!type) { reach.note = `no reach report type offered for this channel (types: ${types.map((t: any) => t.id).slice(0, 8).join(", ")}…)`; }
  else {
    let job = ((await gapi(`${REP}/jobs`)).jobs ?? []).find((j: any) => j.reportTypeId === type.id);
    if (!job) {
      job = await gapi(`${REP}/jobs`, { method: "POST", body: { reportTypeId: type.id, name: "wealthgap-reach" } });
      console.log(`   created a Reporting API job for ${type.id}: first impressions/CTR reports arrive in about 1-2 days`);
    }
    reach.since = job.createTime;
    const cache = path.join(DIR, "reach");
    fs.mkdirSync(cache, { recursive: true });
    let reports: any[] = [], tok = "";
    do {
      const j = await gapi(`${REP}/jobs/${job.id}/reports${tok ? `?pageToken=${tok}` : ""}`);
      reports.push(...(j.reports ?? []));
      tok = j.nextPageToken ?? "";
    } while (tok);
    for (const r of reports) {
      const f = path.join(cache, `${r.id}.csv`);
      if (!fs.existsSync(f)) fs.writeFileSync(f, await gapi<string>(r.downloadUrl, { raw: true }), "utf-8");
    }
    // aggregate every cached CSV: impressions summed, CTR weighted by impressions
    const agg = new Map<string, { imp: number; clicks: number }>();
    for (const f of fs.readdirSync(cache).filter((x) => x.endsWith(".csv"))) {
      const [head, ...lines] = fs.readFileSync(path.join(cache, f), "utf-8").trim().split("\n");
      const h = head.split(",");
      const iv = h.indexOf("video_id"), ii = h.indexOf("video_thumbnail_impressions"), ic = h.indexOf("video_thumbnail_impressions_ctr");
      if (iv < 0 || ii < 0) continue;
      for (const line of lines) {
        const c = line.split(",");
        const imp = +c[ii] || 0, ctr = ic >= 0 ? +c[ic] || 0 : 0;
        const a = agg.get(c[iv]) ?? { imp: 0, clicks: 0 };
        a.imp += imp; a.clicks += imp * ctr;
        agg.set(c[iv], a);
      }
    }
    for (const v of videos) { const a = agg.get(v.ytId); if (a?.imp) { v.impressions = a.imp; v.ctr = a.clicks / a.imp; } }
    reach.status = reports.length ? "ok" : "pending";
    reach.note = reports.length ? `${reports.length} daily reports since ${day(new Date(job.createTime))}` : `job ${type.id} created ${day(new Date(job.createTime))}: Google has not produced the first report yet (usually 1-2 days)`;
  }
} catch (e: any) { reach.note = e.message; errors.push(`reach: ${e.message}`); }

const snap: Snapshot = {
  fetchedAt: new Date().toISOString(),
  channel: { id: ch.id, title: ch.snippet.title, handle: ch.snippet.customUrl, subs: +(ch.statistics.subscriberCount ?? 0), views: +(ch.statistics.viewCount ?? 0), videos: +(ch.statistics.videoCount ?? 0), thumb: ch.snippet.thumbnails?.default?.url },
  range: { start, end: today }, daily, videos, reach,
  quota: { dataApiUnits: units, calls: calls.length }, errors,
};
writeJson(SNAPSHOT, snap);
const log = readJson<any[]>(path.join(DIR, "fetch_log.json")) ?? [];
writeJson(path.join(DIR, "fetch_log.json"), [...log.slice(-49), { at: snap.fetchedAt, ms: Date.now() - t0, calls: calls.length, dataApiUnits: units, errors: errors.length }]);
console.log(`✅ snapshot saved: ${calls.length} API calls (${units} Data API units of 10,000/day) in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log(`   impressions/CTR: ${reach.status} (${reach.note})`);
for (const e of errors) console.log(`   ⚠️  ${e}`);
