/**
 * YouTube analytics: shared paths, OAuth tokens, the snapshot shape and the video ↔ workspace mapping.
 * Imported by auth.ts, fetch.ts, review.ts and the dashboard server (no side effects at import).
 *
 * Files:
 *   youtube_client.json            OAuth Desktop client from Google Cloud (repo root or .secrets/; gitignored)
 *   youtube_token.json             refresh token written by `bun run yt:auth`, next to the client file (gitignored)
 *   workspace/_analytics/          cache: snapshot.json, raw/, reach/ (Reporting API CSVs), reviews/
 *   workspace/<VID>/07-publish/youtube.json   { videoId } links a workspace to its upload
 */
import fs from "node:fs";
import path from "node:path";

export const REPO = path.resolve(import.meta.dir, "../..");
export const DIR = path.join(REPO, "workspace", "_analytics");
export const SNAPSHOT = path.join(DIR, "snapshot.json");
export const MOCK_SNAPSHOT = path.join(DIR, "snapshot.mock.json");
export const SCOPES = ["https://www.googleapis.com/auth/yt-analytics.readonly", "https://www.googleapis.com/auth/youtube.readonly"];

export const readJson = <T = any>(p: string): T | null => { try { return JSON.parse(fs.readFileSync(p, "utf-8")); } catch { return null; } };
export const readText = (p: string) => { try { return fs.readFileSync(p, "utf-8"); } catch { return ""; } };
export function writeJson(p: string, data: unknown, mode?: number) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", { encoding: "utf-8", mode });
  fs.renameSync(tmp, p);
}

// ───────────── OAuth ─────────────

export function clientFile(): string | null {
  for (const p of [path.join(REPO, ".secrets/youtube_client.json"), path.join(REPO, "youtube_client.json"), path.join(REPO, "workspace/.secrets/youtube_client.json")]) if (fs.existsSync(p)) return p;
  return null;
}
export const tokenFile = () => path.join(path.dirname(clientFile() ?? path.join(REPO, "youtube_client.json")), "youtube_token.json");

export interface Client { client_id: string; client_secret: string; auth_uri: string; token_uri: string }
export function readClient(): Client {
  const f = clientFile();
  if (!f) throw new Error("no youtube_client.json (download the OAuth Desktop client JSON from Google Cloud into the repo root)");
  const j = readJson<any>(f);
  const c = j?.installed ?? j?.web;
  if (!c?.client_id) throw new Error(`${path.basename(f)} is not an OAuth client JSON`);
  return { client_id: c.client_id, client_secret: c.client_secret, auth_uri: c.auth_uri ?? "https://accounts.google.com/o/oauth2/auth", token_uri: c.token_uri ?? "https://oauth2.googleapis.com/token" };
}

export interface Token { access_token: string; refresh_token: string; expires_at: number; scope?: string; obtained_at: string }
export const readToken = () => readJson<Token>(tokenFile());
export const saveToken = (t: Token) => writeJson(tokenFile(), t, 0o600);

export type AuthState = { state: "no-client" } | { state: "no-token" } | { state: "expired"; error: string } | { state: "ok"; since: string };
export function authState(): AuthState {
  if (!clientFile()) return { state: "no-client" };
  const t = readToken();
  if (!t?.refresh_token) return { state: "no-token" };
  const bad = readJson<{ error: string }>(path.join(DIR, "auth_error.json"));
  if (bad?.error) return { state: "expired", error: bad.error };
  return { state: "ok", since: t.obtained_at };
}

/** A valid access token, refreshing it when needed. A revoked/expired refresh token (Testing apps expire after 7 days) throws. */
export async function accessToken(): Promise<string> {
  const t = readToken();
  if (!t?.refresh_token) throw new Error("not connected: run bun run yt:auth");
  if (t.access_token && t.expires_at - 60_000 > Date.now()) return t.access_token;
  const c = readClient();
  const r = await fetch(c.token_uri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c.client_id, client_secret: c.client_secret, refresh_token: t.refresh_token, grant_type: "refresh_token" }),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) {
    const error = `${j.error ?? r.status}: ${j.error_description ?? "token refresh failed"}`;
    if (j.error === "invalid_grant") writeJson(path.join(DIR, "auth_error.json"), { error, at: new Date().toISOString() });
    throw new Error(`${error} (run bun run yt:auth again)`);
  }
  saveToken({ ...t, access_token: j.access_token, expires_at: Date.now() + Number(j.expires_in ?? 3600) * 1000 });
  return j.access_token;
}

/** GET/POST a Google API with the stored token. Every call is counted so a refresh can report what it spent. */
export const calls: { url: string; ms: number; status: number }[] = [];
export async function gapi<T = any>(url: string, init: { method?: string; body?: unknown; raw?: boolean } = {}): Promise<T> {
  const t0 = Date.now();
  const tok = await accessToken();
  const r = await fetch(url, {
    method: init.method ?? "GET",
    headers: { authorization: `Bearer ${tok}`, ...(init.body ? { "content-type": "application/json" } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  calls.push({ url: url.replace(/\?.*/, ""), ms: Date.now() - t0, status: r.status });
  if (init.raw) { if (!r.ok) throw new Error(`${r.status} ${url.replace(/\?.*/, "")}`); return (await r.text()) as T; }
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${r.status} ${url.replace(/\?.*/, "")}: ${j?.error?.message ?? r.statusText}`);
  return j as T;
}

// ───────────── snapshot ─────────────

export interface RetPoint { r: number; watch: number; rel?: number }
export interface Video {
  ytId: string; title: string; publishedAt: string; durationS: number; thumb?: string;
  views: number; likes: number; comments: number;
  /** Analytics API over the snapshot range (lifetime when the range starts before the upload) */
  minutes?: number; avdS?: number; avgPct?: number; subsGained?: number; subsLost?: number; shares?: number;
  /** Reporting API (reach report): only from the reporting job's start onward */
  impressions?: number; ctr?: number;
  retention?: RetPoint[];
  traffic?: { source: string; views: number; minutes: number }[];
  ws?: string;
  short?: boolean;
}
export interface Snapshot {
  fetchedAt: string; mock?: boolean;
  channel: { id: string; title: string; handle?: string; subs: number; views: number; videos: number; thumb?: string };
  range: { start: string; end: string };
  daily: { day: string; views: number; minutes: number; subsNet: number }[];
  videos: Video[];
  reach: { status: "ok" | "pending" | "unavailable"; note: string; since?: string };
  quota: { dataApiUnits: number; calls: number };
  errors: string[];
}
/** The cached snapshot with the current workspace links applied (linking takes effect without a refetch; mock keeps its own). */
export function readSnapshot(mock = false): Snapshot | null {
  const s = readJson<Snapshot>(mock ? MOCK_SNAPSHOT : SNAPSHOT);
  if (!s) return null;
  const links = mapping();
  for (const v of s.videos) v.ws = links[v.ytId] ?? (mock ? v.ws : undefined);
  return s;
}

// ───────────── mapping ─────────────

const WS_ID = /^VID\d+_[A-Za-z0-9_]+$/;
export const wsDir = (id: string) => path.join(REPO, "workspace", id);
export function workspaces(): string[] {
  try { return fs.readdirSync(path.join(REPO, "workspace")).filter((f) => WS_ID.test(f)).sort(); } catch { return []; }
}
/** Accepts a bare 11-char id or any youtube.com / youtu.be URL (watch, shorts, live, embed). */
export function parseYtId(s: string): string | null {
  s = s.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m = s.match(/(?:v=|youtu\.be\/|\/shorts\/|\/live\/|\/embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}
export const mapFile = (ws: string) => path.join(wsDir(ws), "07-publish", "youtube.json");
/** ytId → workspace id */
export function mapping(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const w of workspaces()) { const id = readJson<{ videoId: string }>(mapFile(w))?.videoId; if (id) out[id] = w; }
  return out;
}
export function setMapping(ws: string, ytId: string | null) {
  if (!WS_ID.test(ws) || !fs.existsSync(wsDir(ws))) throw new Error("no such workspace");
  if (ytId === null) { try { fs.rmSync(mapFile(ws)); } catch {} return; }
  writeJson(mapFile(ws), { videoId: ytId, setAt: new Date().toISOString() });
}

/** The workspace's plan acts (for overlaying act boundaries on a retention curve). */
export function planActs(ws: string): { id: string; title: string; startMs: number; endMs: number }[] {
  const plan = readJson<any>(path.join(wsDir(ws), "05-video/acts.json"));
  return (plan?.acts ?? []).filter((a: any) => Number.isFinite(a.startMs) && Number.isFinite(a.endMs)).map((a: any) => ({ id: a.id, title: a.title ?? a.id, startMs: a.startMs, endMs: a.endMs }));
}

export const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
export const median = (xs: number[]) => { const a = xs.filter((x) => Number.isFinite(x)).sort((p, q) => p - q); if (!a.length) return NaN; const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
