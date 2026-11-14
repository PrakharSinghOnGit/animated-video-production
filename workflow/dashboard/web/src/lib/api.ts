import type { AnalyticsData, CommentsData, Idea, IdeasData, YtComment, LessonStore, TitleLint, WatchEntry } from "./analytics";
import type { DawState, Details, EnvView, HoldItem, HoldPoints, Limits, Job, ModelsData, Overview, PostedData, PostStatus, Schema, SfxEdits, SfxInfo, StudioState, SystemInfo, UsageReport, WsSummary } from "./types";

/** The only place that talks to server.ts. Every write carries `x-wg: 1` (the server rejects writes without it). */
async function call<T>(path: string, init: { method?: string; body?: unknown; text?: boolean } = {}): Promise<T> {
  const write = init.method && init.method !== "GET";
  const isText = typeof init.body === "string";
  const r = await fetch(path, {
    method: init.method ?? "GET",
    headers: { ...(write ? { "x-wg": "1" } : {}), ...(write && init.body !== undefined && !isText ? { "content-type": "application/json" } : {}) },
    body: init.body === undefined ? undefined : isText ? (init.body as string) : JSON.stringify(init.body),
  });
  // over the internet (bun run dashboard:public) a missing or expired session sends the page to the login screen
  if (r.status === 401 && path !== "/api/login") { location.assign(`/login?next=${encodeURIComponent(location.pathname + location.hash)}`); return new Promise<T>(() => {}); }
  const ct = r.headers.get("content-type") ?? "";
  const data = ct.includes("json") ? await r.json() : await r.text();
  if (!r.ok) throw new Error((data as { error?: string })?.error ?? r.statusText);
  return data as T;
}

const w = (ws: string) => `/api/ws/${encodeURIComponent(ws)}`;

export const api = {
  listenVoices: () => call<{ voices: { name: string; lang: string }[]; default: string; available: boolean }>("/api/listen/voices"),
  listen: (ws: string, text: string, voice: string, wpm: number) => call<{ url: string; bytes: number; voice: string; wpm: number }>(`/api/ws/${encodeURIComponent(ws)}/listen`, { method: "POST", body: { text, voice, wpm } }),
  workspaces: () => call<{ workspaces: WsSummary[]; studio: StudioState | null; renames?: Record<string, string> }>("/api/workspaces"),
  /** no id: the next number, untitled (named automatically once its idea or script is written) */
  createWorkspace: (id: string | null, kind: "video" | "shorts" = "video") => call<{ id: string; job: Job }>("/api/workspaces", { method: "POST", body: { id, kind } }),
  /** a name sets it; none asks the naming model */
  wsRename: (ws: string, name?: string) => call<{ ok: true; id: string }>(`/api/ws/${encodeURIComponent(ws)}/rename`, { method: "POST", body: { name } }),
  schema: () => call<Schema>("/api/schema"),
  system: () => call<SystemInfo>("/api/system"),
  activity: () => call<{ jobs: Job[]; studio: StudioState | null }>("/api/activity"),
  usage: (refresh = false) => call<UsageReport>(`/api/usage${refresh ? "?refresh=1" : ""}`),
  session: () => call<{ remote: boolean; publicUrl: string | null }>("/api/session"),
  logout: () => call<{ ok: true }>("/api/logout", { method: "POST" }),
  limits: () => call<Limits>("/api/limits"),
  models: (refresh = false) => call<ModelsData>("/api/models", refresh ? { method: "POST" } : undefined),
  modelSet: (role: string, spec: string | null) => call<{ ok: true }>("/api/models", { method: "PUT", body: { role, spec } }),
  env: () => call<EnvView>("/api/settings/env"),
  envReveal: (key: string) => call<{ value: string }>(`/api/settings/env?reveal=${encodeURIComponent(key)}`),
  notify: () => call<{ macAvailable: boolean; mac: boolean; phone: boolean; topicSet: boolean }>("/api/settings/notify"),
  notifyTest: (only?: "mac" | "phone") => call<{ ok: boolean; sent: { mac: boolean; phone: boolean } }>("/api/settings/notify/test", { method: "POST", body: { only } }),
  envSave: (set: Record<string, string>, remove: string[] = []) => call<EnvView>("/api/settings/env", { method: "PUT", body: { set, remove } }).then((r) => { window.dispatchEvent(new Event("wg:env")); return r; }),
  settingsFiles: () => call<{ files: { path: string; mtime: number }[] }>("/api/settings/files"),
  settingsFile: (p: string) => call<string>(`/api/settings/file?path=${encodeURIComponent(p)}`),
  saveSettingsFile: (p: string, text: string) => call<unknown>(`/api/settings/file?path=${encodeURIComponent(p)}`, { method: "PUT", body: text }),
  daw: () => call<DawState>("/api/daw"),
  startDaw: () => call<DawState>("/api/daw/start", { method: "POST", body: {} }),
  stopDaw: () => call<{ ok: true }>("/api/daw/stop", { method: "POST", body: {} }),
  stopStudio: () => call<{ ok: true }>("/api/studio/stop", { method: "POST", body: {} }),

  status: (ws: string) => call<Details>(`${w(ws)}/status`),
  run: (ws: string, action: string, opts: Record<string, unknown>, act?: string) => call<{ job: Job }>(`${w(ws)}/run`, { method: "POST", body: { action, act, opts } }),
  stop: (ws: string, job?: string) => call<{ ok: true }>(`${w(ws)}/stop`, { method: "POST", body: { job } }),
  startStudio: (ws: string) => call<unknown>(`${w(ws)}/studio`, { method: "POST", body: {} }),
  lastLog: (ws: string, step: string) => call<string>(`${w(ws)}/log?step=${encodeURIComponent(step)}`),
  script: (ws: string) => call<string>(`${w(ws)}/script`),
  saveScript: (ws: string, text: string) => call<unknown>(`${w(ws)}/script`, { method: "PUT", body: text }),
  saveText: (ws: string, which: "idea" | "feedback" | "research", text: string) => call<unknown>(`${w(ws)}/text/${which}`, { method: "PUT", body: text }),
  saveNotes: (ws: string, act: string, text: string) => call<unknown>(`${w(ws)}/notes/${act}`, { method: "PUT", body: text }),

  approveAct: (ws: string, act: string) => call<unknown>(`${w(ws)}/approve/${act}`, { method: "POST", body: {} }),
  unapproveAct: (ws: string, act: string) => call<unknown>(`${w(ws)}/approve/${act}`, { method: "DELETE" }),
  approvePlan: (ws: string) => call<unknown>(`${w(ws)}/plan/approve`, { method: "POST", body: {} }),
  unapprovePlan: (ws: string) => call<unknown>(`${w(ws)}/plan/approve`, { method: "DELETE" }),
  saveVoiceReview: (ws: string, rv: Record<string, unknown>) => call<unknown>(`${w(ws)}/voice/review`, { method: "PUT", body: rv }),
  holdPoints: (ws: string) => call<HoldPoints>(`${w(ws)}/align/holdpoints`),
  saveHolds: (ws: string, holds: HoldItem[]) => call<unknown>(`${w(ws)}/align/holds`, { method: "PUT", body: { holds: holds.map(({ status: _s, failWhy: _f, mergedAt: _m, ...h }) => h) } }),
  seamMark: (ws: string, seam: string, mark: { ok: boolean; note: string; side: string } | null) => call<unknown>(`${w(ws)}/seams/mark`, { method: "POST", body: mark ? { seam, ...mark } : { seam, ok: null } }),
  stopBatch: (ws: string) => call<unknown>(`${w(ws)}/acts/stop-batch`, { method: "POST", body: {} }),

  saveMetadata: (ws: string, body: { titles?: Record<string, string>; description?: string; tags?: string[]; hashtags?: string[] }) => call<{ ok: true; checks: { errors: string[]; warnings: string[] } }>(`${w(ws)}/publish/metadata`, { method: "PUT", body }),
  savePublishNotes: (ws: string, which: string, text: string) => call<unknown>(`${w(ws)}/publish/notes/${which}`, { method: "PUT", body: text }),
  saveShortText: (ws: string, short: string, which: "script" | "feedback" | "notes", text: string) => call<unknown>(`${w(ws)}/shorts/${short}/${which}`, { method: "PUT", body: text }),
  saveShortsFeedback: (ws: string, text: string) => call<unknown>(`${w(ws)}/shorts/feedback`, { method: "PUT", body: text }),
  acceptCheck: (ws: string, b: { scope: string; text: string; short?: string; undo?: boolean }) => call<unknown>(`${w(ws)}/accept`, { method: "POST", body: b }),
  approvePublish: (ws: string) => call<unknown>(`${w(ws)}/publish/approve`, { method: "POST", body: {} }),
  unapprovePublish: (ws: string) => call<unknown>(`${w(ws)}/publish/approve`, { method: "DELETE" }),

  overview: (ws: string) => call<Overview>(`${w(ws)}/overview`),
  sfx: (ws: string, short?: string | null) => call<SfxInfo>(`${w(ws)}/sfx${short ? `?short=${short}` : ""}`),
  saveSfx: (ws: string, short: string | null | undefined, edits: SfxEdits) => call<{ ok: true; edits: SfxEdits }>(`${w(ws)}/sfx${short ? `?short=${short}` : ""}`, { method: "PUT", body: edits }),

  analytics: (mock = false) => call<AnalyticsData>(`/api/analytics${mock ? "?mock=1" : ""}`),
  posted: () => call<PostedData>("/api/posted"),
  setPosted: (b: { ws: string; short: string | null; platform: "instagram" | "facebook"; status: PostStatus; url?: string }) => call<unknown>("/api/posted", { method: "PUT", body: b }),
  ideas: () => call<IdeasData>("/api/ideas"),
  ideaAdd: (b: { title: string; note?: string; keywords?: string }) => call<{ ok: true; idea: Idea; store: IdeasData["store"] }>("/api/ideas", { method: "POST", body: b }),
  ideaUpdate: (id: string, b: { title?: string; note?: string; keywords?: string; status?: Idea["status"] }) => call<{ ok: true; store: IdeasData["store"] }>(`/api/ideas/${id}`, { method: "PUT", body: b }),
  ideaDelete: (id: string) => call<{ ok: true; store: IdeasData["store"] }>(`/api/ideas/${id}`, { method: "DELETE" }),
  ideaResearch: (id: string) => call<{ job: { id: string; label: string } }>(`/api/ideas/${id}/research`, { method: "POST", body: {} }),
  ideaStart: (id: string, name?: string) => call<{ ws: string; job: { id: string; label: string } }>(`/api/ideas/${id}/start`, { method: "POST", body: { name } }),
  ideaDiscover: (focus: string, check: number, watchlist = false) => call<{ job: { id: string; label: string } }>("/api/ideas/discover", { method: "POST", body: { focus, check, watchlist } }),
  watchlistSave: (channels: WatchEntry[]) => call<{ ok: true; watchlist: WatchEntry[] }>("/api/ideas/watchlist", { method: "PUT", body: { channels } }),
  watchlistScan: (days: number, min: number) => call<{ job: { id: string; label: string } }>("/api/ideas/watchlist/scan", { method: "POST", body: { days, min } }),
  ideaLint: (title: string, thumb: string) => call<TitleLint>("/api/ideas/lint", { method: "POST", body: { title, thumb } }),
  comments: () => call<CommentsData>("/api/analytics/comments"),
  commentUpdate: (id: string, patch: { status?: YtComment["status"]; draft?: string }) => call<{ ok: true; comment: YtComment }>(`/api/analytics/comments/${id}`, { method: "PUT", body: patch }),
  analyticsRun: (action: "auth" | "fetch" | "mock" | "review" | "learn" | "comments", extra: { agent?: string; video?: string; mock?: boolean; redraft?: boolean } = {}) => call<{ job: { id: string; label: string } }>("/api/analytics/run", { method: "POST", body: { action, ...extra } }),
  analyticsLink: (ws: string, id: string | null, short?: string) => call<{ ok: true; id: string | null }>("/api/analytics/link", { method: "PUT", body: { ws, id, short } }),
  lesson: (id: string, action: "approve" | "reject" | "retire" | "restore" | "edit", extra: { reason?: string; rule?: string } = {}) => call<{ ok: true; lessons: LessonStore }>(`/api/analytics/lessons/${id}`, { method: "POST", body: { action, ...extra } }),
  analyticsLogUrl: (job: string) => `/api/analytics/log/${job}`,

  /** attachment download of any file inside the workspace (the server refuses paths that leave it) */
  downloadUrl: (ws: string, rel: string) => `${w(ws)}/download?path=${encodeURIComponent(rel)}`,
  fileUrl: (ws: string, rel: string) => `${w(ws)}/file?path=${encodeURIComponent(rel)}`,
  logUrl: (ws: string, jobId: string) => `${w(ws)}/log/${jobId}`,
  logPlainUrl: (ws: string, jobId: string) => `${w(ws)}/log/${jobId}?plain=1`,
};
