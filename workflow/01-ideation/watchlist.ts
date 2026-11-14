/**
 * Niche radar: scan the recent uploads of every channel in watchlist.json and score each video against that
 * channel's own median for the same format (yt-viral/swipe.py). A search finds what YouTube ranks for words you
 * picked; the watchlist sees every upload of the channels whose viewers you want, so it catches the topics you would
 * not have searched for, and the medians come from a full sample (up to 50 uploads) instead of a handful.
 *
 * Quota: 1 unit per channel to resolve its handle (cached in workspace/_ideas/watchlist/channels.json), 1 per channel
 * for its upload list, 1 per 50 videos for their stats: ~45 units for 22 channels (a search is 100).
 * Every scanned video is merged into workspace/_ideas/watchlist/videos.json (views, title, thumbnail, channel median),
 * the dataset a later title + thumbnail scorer can be trained on.
 *
 * No side effects at import; the caller passes its YouTube Data API fetcher.
 */
import fs from "node:fs";
import path from "node:path";
import { swipe, type SwipeRow } from "./skills";
import { IDEAS_DIR, REPO, type Competitor } from "./lib";

export const WATCHLIST_FILE = path.join(REPO, "workflow/01-ideation/watchlist.json");
const DIR = path.join(IDEAS_DIR, "watchlist");
const CHANNELS_CACHE = path.join(DIR, "channels.json");
const DATASET = path.join(DIR, "videos.json");

export interface WatchEntry { handle: string; why?: string }
export interface WatchChannel { handle: string; channelId: string; title: string; country?: string; subs: number; uploads: string; resolvedAt: string }
export interface DatasetRow { ytId: string; channelId: string; channel: string; title: string; publishedAt: string; durationS: number; views: number; median?: number; multiple?: number; thumb?: string; seenAt: string }

export const isShort = (durationS: number) => durationS <= 180;
export const isoDur = (s: string) => { const m = s?.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/); return m ? (+(m[1] ?? 0)) * 86400 + (+(m[2] ?? 0)) * 3600 + (+(m[3] ?? 0)) * 60 + (+(m[4] ?? 0)) : 0; };

/** The list, handles normalised to "@name" and de-duplicated (case-insensitive). */
export function readWatchlist(file = WATCHLIST_FILE): WatchEntry[] {
  let j: any;
  try { j = JSON.parse(fs.readFileSync(file, "utf-8")); } catch (e) { throw new Error(`${path.relative(REPO, file)}: ${(e as Error).message}`); }
  return normaliseWatchlist(Array.isArray(j?.channels) ? j.channels : []);
}
export function normaliseWatchlist(raw: any[]): WatchEntry[] {
  const seen = new Set<string>(), out: WatchEntry[] = [];
  for (const c of raw) {
    const h = String(typeof c === "string" ? c : c?.handle ?? "").trim().replace(/^https?:\/\/(www\.)?youtube\.com\//i, "").replace(/\/.*$/, "");
    if (!h) continue;
    const handle = h.startsWith("@") ? h : `@${h}`;
    if (seen.has(handle.toLowerCase())) continue;
    seen.add(handle.toLowerCase());
    out.push({ handle, why: typeof c?.why === "string" ? c.why : undefined });
  }
  return out;
}

const readJson = <T>(f: string, d: T): T => { try { return JSON.parse(fs.readFileSync(f, "utf-8")); } catch { return d; } };
const writeJson = (f: string, v: unknown) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(`${f}.tmp`, JSON.stringify(v, null, 1)); fs.renameSync(`${f}.tmp`, f); };

/** Merge scanned videos into the dataset: the newest view count wins, nothing is ever dropped. */
export function mergeDataset(cur: DatasetRow[], add: DatasetRow[]): DatasetRow[] {
  const m = new Map(cur.map((r) => [r.ytId, r]));
  for (const r of add) m.set(r.ytId, { ...m.get(r.ytId), ...r });
  return [...m.values()];
}

type Yt = (pathAndQuery: string, cost: number) => Promise<any>;

/** Handles → channels, from the cache when known (a channel's id and upload list never change). */
async function resolve(list: WatchEntry[], yt: Yt, log: (s: string) => void): Promise<{ channels: WatchChannel[]; missing: string[] }> {
  const cache = readJson<Record<string, WatchChannel>>(CHANNELS_CACHE, {});
  const missing: string[] = [];
  for (const e of list) {
    const k = e.handle.toLowerCase();
    if (cache[k]) continue;
    try {
      const c = (await yt(`channels?part=snippet,statistics,contentDetails&forHandle=${encodeURIComponent(e.handle)}`, 1)).items?.[0];
      if (!c?.contentDetails?.relatedPlaylists?.uploads) { missing.push(e.handle); continue; }
      cache[k] = { handle: e.handle, channelId: c.id, title: c.snippet?.title ?? e.handle, country: c.snippet?.country, subs: Number(c.statistics?.subscriberCount ?? 0), uploads: c.contentDetails.relatedPlaylists.uploads, resolvedAt: new Date().toISOString() };
      log(`   + ${e.handle} → ${cache[k].title}${cache[k].country ? ` (${cache[k].country})` : ""}, ${cache[k].subs.toLocaleString()} subs${cache[k].subs < 10_000 ? "  ⚠️ tiny: probably not the channel you meant, check the handle" : ""}`);
    } catch (err) { missing.push(`${e.handle} (${(err as Error).message})`); }
  }
  writeJson(CHANNELS_CACHE, cache);
  return { channels: list.map((e) => cache[e.handle.toLowerCase()]).filter(Boolean), missing };
}

/**
 * Scan the watchlist. Returns every video published in the last `days`, each scored against its channel's median
 * of the same format over the last `perChannel` uploads (older uploads count for the median only).
 */
export async function scanWatchlist(yt: Yt, o: { days?: number; perChannel?: number; log?: (s: string) => void } = {}): Promise<{ videos: Competitor[]; channels: WatchChannel[]; missing: string[] }> {
  const log = o.log ?? console.log;
  const list = readWatchlist();
  if (!list.length) throw new Error(`no channels in ${path.relative(REPO, WATCHLIST_FILE)}`);
  const { channels, missing } = await resolve(list, yt, log);
  if (!channels.length) throw new Error("none of the watchlist handles resolved");

  const ids: { id: string; ch: WatchChannel }[] = [];
  for (let i = 0; i < channels.length; i += 8) {
    await Promise.all(channels.slice(i, i + 8).map(async (ch) => {
      try {
        const j = await yt(`playlistItems?part=contentDetails&maxResults=${Math.min(50, o.perChannel ?? 50)}&playlistId=${ch.uploads}`, 1);
        for (const it of j.items ?? []) if (it.contentDetails?.videoId) ids.push({ id: it.contentDetails.videoId, ch });
      } catch (err) { missing.push(`${ch.handle} uploads (${(err as Error).message})`); }
    }));
  }
  const byId = new Map(ids.map((x) => [x.id, x.ch]));
  const vids: any[] = [];
  const all = [...byId.keys()];
  for (let i = 0; i < all.length; i += 50) vids.push(...((await yt(`videos?part=snippet,statistics,contentDetails&id=${all.slice(i, i + 50).join(",")}`, 1)).items ?? []));

  const key = (channelId: string, durationS: number) => `${channelId}|${isShort(durationS) ? "short" : "long"}`;
  // uploads under a week old are still collecting views: they would drag the medians down, so they sit this one out
  const minAge = 7 * 864e5;
  const settled = vids.filter((v) => Date.now() - Date.parse(v.snippet.publishedAt) >= minAge);
  const rows: SwipeRow[] = settled.map((v) => ({ channel: key(v.snippet.channelId, isoDur(v.contentDetails?.duration)), title: v.snippet.title, views: Number(v.statistics?.viewCount ?? 0), url: v.id, duration: isoDur(v.contentDetails?.duration) }));
  const n = new Map<string, number>();
  for (const r of rows) n.set(r.channel, (n.get(r.channel) ?? 0) + 1);
  const hits = new Map(swipe(rows).outliers.map((h) => [h.url, h]));

  const after = Date.now() - (o.days ?? 180) * 864e5;
  const seenAt = new Date().toISOString();
  const scored: Competitor[] = vids.map((v) => {
    const ch = byId.get(v.id)!, durationS = isoDur(v.contentDetails?.duration), h = hits.get(v.id);
    return {
      ytId: v.id, title: v.snippet.title, channel: v.snippet.channelTitle, channelId: v.snippet.channelId, publishedAt: v.snippet.publishedAt,
      durationS, views: Number(v.statistics?.viewCount ?? 0), channelSubs: ch.subs, channelAvgViews: 0, ratio: 0,
      thumb: v.snippet.thumbnails?.medium?.url, query: `watchlist ${ch.handle}`,
      ...(h ? { median: h.median, multiple: h.multiple, formula: h.formula, sampleN: n.get(key(v.snippet.channelId, durationS)) } : {}),
    };
  });
  writeJson(DATASET, mergeDataset(readJson<DatasetRow[]>(DATASET, []), scored.map((c) => ({
    ytId: c.ytId, channelId: c.channelId, channel: c.channel, title: c.title, publishedAt: c.publishedAt, durationS: c.durationS, views: c.views,
    median: c.median, multiple: c.multiple, thumb: c.thumb, seenAt,
  }))));
  const recent = scored.filter((c) => { const t = Date.parse(c.publishedAt); return t >= after && Date.now() - t >= minAge; });
  return { videos: recent.sort((a, b) => (b.multiple ?? 0) - (a.multiple ?? 0)), channels, missing };
}

/** Countries of the watchlist channels (where the creator registered, NOT where the viewers are). */
export function countrySummary(channels: WatchChannel[]): string {
  const c = new Map<string, number>();
  for (const ch of channels) c.set(ch.country ?? "not set", (c.get(ch.country ?? "not set") ?? 0) + 1);
  return [...c].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ");
}
