/**
 * Where each video and short is posted: YouTube, Instagram, Facebook. One table across every project, so the creator
 * sees at a glance what is ready, what is a draft and what is live.
 *
 * - YouTube fills itself in: the upload linked to the project (07-publish/youtube.json, the analytics link) and its
 *   privacy from the last analytics snapshot (public = live; private, unlisted or scheduled = draft).
 * - Instagram and Facebook are marked by hand (no API posting): <ws>/07-publish/posted.json
 *   { "video" | "S1": { instagram?: {status, url?, at}, facebook?: {...} } }.
 * - Each row carries ready-to-paste captions built from the project's own packaging (metadata.json / short.json).
 */
import fs from "node:fs";
import path from "node:path";
import { mapping, readSnapshot, shortLinkMap, shortIds, workspaces, wsDir, type Video } from "../09-analytics/lib";

export const MANUAL = ["instagram", "facebook"] as const;
export type Manual = (typeof MANUAL)[number];
export type Status = "none" | "draft" | "live";
export interface Mark { status: Status; url?: string; at: string }
type Store = Record<string, Partial<Record<Manual, Mark>>>;

export interface YtCell { ytId: string | null; status: Status; label: string; url: string | null; publishAt?: string | null }
export interface PostedRow {
  ws: string; short: string | null; kind: "video" | "short";
  /** finished: the final render exists, or it is already on YouTube (compacted projects lose their final) */
  title: string; ready: boolean; finalAt: number | null;
  youtube: YtCell; instagram: Mark | null; facebook: Mark | null;
  captions: { youtube: string; instagram: string; facebook: string };
}

const readJson = <T,>(f: string): T | null => { try { return JSON.parse(fs.readFileSync(f, "utf-8")) as T; } catch { return null; } };
export const postedFile = (ws: string) => path.join(wsDir(ws), "07-publish", "posted.json");
const mtime = (f: string) => { try { return fs.statSync(f).mtimeMs; } catch { return null; } };

export function readPosted(ws: string): Store { return readJson<Store>(postedFile(ws)) ?? {}; }

/** Mark one item on Instagram or Facebook ("none" clears it). */
export function setPosted(ws: string, item: string, platform: Manual, status: Status, url?: string): void {
  if (!workspaces().includes(ws)) throw new Error("no such workspace");
  if (item !== "video" && !shortIds(ws).includes(item)) throw new Error("no such short");
  if (item === "video" && ws.startsWith("SH")) throw new Error("a shorts project has no long video");
  if (!MANUAL.includes(platform)) throw new Error("platform: instagram or facebook");
  if (!["none", "draft", "live"].includes(status)) throw new Error("status: none, draft or live");
  const s = readPosted(ws), cur = { ...(s[item] ?? {}) };
  if (status === "none") delete cur[platform];
  else cur[platform] = { status, ...(url?.trim() ? { url: url.trim() } : cur[platform]?.url ? { url: cur[platform]!.url } : {}), at: new Date().toISOString() };
  if (Object.keys(cur).length) s[item] = cur; else delete s[item];
  fs.mkdirSync(path.dirname(postedFile(ws)), { recursive: true });
  fs.writeFileSync(postedFile(ws), JSON.stringify(s, null, 2), "utf-8");
}

/** YouTube status from the snapshot's privacy (fetched by bun run yt:fetch). */
export function ytCell(ytId: string | null, v: Video | undefined): YtCell {
  if (!ytId) return { ytId: null, status: "none", label: "not linked", url: null };
  const url = v?.short ? `https://www.youtube.com/shorts/${ytId}` : `https://www.youtube.com/watch?v=${ytId}`;
  if (!v) return { ytId, status: "draft", label: "not found on the channel", url };
  if (!v.privacy) return { ytId, status: "live", label: "linked (refresh for status)", url };
  if (v.privacy === "public") return { ytId, status: "live", label: "public", url };
  if (v.publishAt) return { ytId, status: "draft", label: `scheduled ${v.publishAt.slice(0, 10)}`, url, publishAt: v.publishAt };
  return { ytId, status: "draft", label: v.privacy, url };
}

/** Captions: YouTube keeps #Shorts; Instagram and Facebook drop it (it means nothing there). */
export function captions(title: string, description: string, hashtags: string[]) {
  const tags = (all: boolean) => hashtags.filter((h) => all || h.toLowerCase() !== "#shorts").join(" ");
  const body = (all: boolean) => [title, description.trim(), tags(all)].filter(Boolean).join("\n\n");
  return { youtube: body(true), instagram: body(false), facebook: body(false) };
}

export function postedRows(): { rows: PostedRow[]; fetchedAt: string | null } {
  const snap = readSnapshot();
  const byId = new Map((snap?.videos ?? []).map((v) => [v.ytId, v] as const));
  const linked = Object.fromEntries(Object.entries(mapping()).map(([id, ws]) => [ws, id]));
  const rows: PostedRow[] = [];
  for (const ws of workspaces()) {
    const store = readPosted(ws);
    if (!ws.startsWith("SH")) {
      const meta = readJson<any>(path.join(wsDir(ws), "07-publish", "metadata.json"));
      const id = linked[ws] ?? null, v = id ? byId.get(id) : undefined;
      const title = v?.title ?? meta?.titles?.A?.title ?? ws;
      const final = path.join(wsDir(ws), "05-video", "final.mp4");
      rows.push({
        ws, short: null, kind: "video", title, ready: !!mtime(final) || !!id, finalAt: mtime(final),
        youtube: ytCell(id, v), instagram: store.video?.instagram ?? null, facebook: store.video?.facebook ?? null,
        captions: captions(title, meta?.description ?? "", meta?.hashtags ?? []),
      });
    }
    const links = shortLinkMap(ws);
    for (const s of shortIds(ws)) {
      const sw = path.join(wsDir(ws), "shorts", s);
      const sj = readJson<any>(path.join(sw, "02-scripting", "short.json")) ?? {};
      const id = links[s] ?? null, v = id ? byId.get(id) : undefined;
      const final = path.join(sw, "05-video", "final.mp4");
      const title = sj.title ?? v?.title ?? `${ws} ${s}`;
      rows.push({
        ws, short: s, kind: "short", title, ready: !!mtime(final) || !!id, finalAt: mtime(final),
        youtube: ytCell(id, v), instagram: store[s]?.instagram ?? null, facebook: store[s]?.facebook ?? null,
        captions: captions(title, sj.description ?? "", sj.hashtags ?? []),
      });
    }
  }
  return { rows, fetchedAt: snap?.fetchedAt ?? null };
}
