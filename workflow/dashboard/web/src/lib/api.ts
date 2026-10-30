import type { DawState, Details, EnvView, Limits, Job, Overview, Schema, SfxEdits, SfxInfo, StudioState, SystemInfo, UsageReport, WsSummary } from "./types";

/** The only place that talks to server.ts. Every write carries `x-wg: 1` (the server rejects writes without it). */
async function call<T>(path: string, init: { method?: string; body?: unknown; text?: boolean } = {}): Promise<T> {
  const write = init.method && init.method !== "GET";
  const isText = typeof init.body === "string";
  const r = await fetch(path, {
    method: init.method ?? "GET",
    headers: { ...(write ? { "x-wg": "1" } : {}), ...(write && init.body !== undefined && !isText ? { "content-type": "application/json" } : {}) },
    body: init.body === undefined ? undefined : isText ? (init.body as string) : JSON.stringify(init.body),
  });
  const ct = r.headers.get("content-type") ?? "";
  const data = ct.includes("json") ? await r.json() : await r.text();
  if (!r.ok) throw new Error((data as { error?: string })?.error ?? r.statusText);
  return data as T;
}

const w = (ws: string) => `/api/ws/${encodeURIComponent(ws)}`;

export const api = {
  workspaces: () => call<{ workspaces: WsSummary[]; studio: StudioState | null }>("/api/workspaces"),
  createWorkspace: (id: string) => call<{ job: Job }>("/api/workspaces", { method: "POST", body: { id } }),
  schema: () => call<Schema>("/api/schema"),
  system: () => call<SystemInfo>("/api/system"),
  activity: () => call<{ jobs: Job[]; studio: StudioState | null }>("/api/activity"),
  usage: (refresh = false) => call<UsageReport>(`/api/usage${refresh ? "?refresh=1" : ""}`),
  limits: () => call<Limits>("/api/limits"),
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
  stop: (ws: string) => call<{ ok: true }>(`${w(ws)}/stop`, { method: "POST", body: {} }),
  startStudio: (ws: string) => call<unknown>(`${w(ws)}/studio`, { method: "POST", body: {} }),
  lastLog: (ws: string, step: string) => call<string>(`${w(ws)}/log?step=${encodeURIComponent(step)}`),
  script: (ws: string) => call<string>(`${w(ws)}/script`),
  saveScript: (ws: string, text: string) => call<unknown>(`${w(ws)}/script`, { method: "PUT", body: text }),
  saveText: (ws: string, which: "idea" | "feedback", text: string) => call<unknown>(`${w(ws)}/text/${which}`, { method: "PUT", body: text }),
  saveNotes: (ws: string, act: string, text: string) => call<unknown>(`${w(ws)}/notes/${act}`, { method: "PUT", body: text }),

  approveAct: (ws: string, act: string) => call<unknown>(`${w(ws)}/approve/${act}`, { method: "POST", body: {} }),
  unapproveAct: (ws: string, act: string) => call<unknown>(`${w(ws)}/approve/${act}`, { method: "DELETE" }),

  saveMetadata: (ws: string, body: { titles?: Record<string, string>; description?: string; tags?: string[]; hashtags?: string[] }) => call<{ ok: true; checks: { errors: string[]; warnings: string[] } }>(`${w(ws)}/publish/metadata`, { method: "PUT", body }),
  savePublishNotes: (ws: string, which: string, text: string) => call<unknown>(`${w(ws)}/publish/notes/${which}`, { method: "PUT", body: text }),
  saveShortText: (ws: string, short: string, which: "script" | "feedback" | "notes", text: string) => call<unknown>(`${w(ws)}/shorts/${short}/${which}`, { method: "PUT", body: text }),
  saveShortsFeedback: (ws: string, text: string) => call<unknown>(`${w(ws)}/shorts/feedback`, { method: "PUT", body: text }),
  approvePublish: (ws: string) => call<unknown>(`${w(ws)}/publish/approve`, { method: "POST", body: {} }),
  unapprovePublish: (ws: string) => call<unknown>(`${w(ws)}/publish/approve`, { method: "DELETE" }),

  overview: (ws: string) => call<Overview>(`${w(ws)}/overview`),
  sfx: (ws: string, short?: string | null) => call<SfxInfo>(`${w(ws)}/sfx${short ? `?short=${short}` : ""}`),
  saveSfx: (ws: string, short: string | null | undefined, edits: SfxEdits) => call<{ ok: true; edits: SfxEdits }>(`${w(ws)}/sfx${short ? `?short=${short}` : ""}`, { method: "PUT", body: edits }),

  /** attachment download of any file inside the workspace (the server refuses paths that leave it) */
  downloadUrl: (ws: string, rel: string) => `${w(ws)}/download?path=${encodeURIComponent(rel)}`,
  fileUrl: (ws: string, rel: string) => `${w(ws)}/file?path=${encodeURIComponent(rel)}`,
  logUrl: (ws: string, jobId: string) => `${w(ws)}/log/${jobId}`,
  logPlainUrl: (ws: string, jobId: string) => `${w(ws)}/log/${jobId}?plain=1`,
};
