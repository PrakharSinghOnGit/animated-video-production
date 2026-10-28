import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Details, Job, Limits, Schema, StudioState, SystemInfo, UsageReport, WsSummary } from "@/lib/types";
import { useRoute, type Route } from "./useRoute";
import { usePoll } from "./usePoll";
import { useStored } from "@/lib/storage";

interface Toast { id: number; msg: string }
interface App {
  route: Route; go: (p: Partial<Route>) => void;
  ws: string | null;
  list: WsSummary[]; studio: StudioState | null; reloadList: () => Promise<void>;
  schema: Schema;
  d: Details | null; refresh: () => Promise<void>;
  /** the job running in the selected video, if any */
  busy: Job | null;
  /** every job the server knows (all videos), newest first */
  activity: Job[]; runningAnywhere: Job[];
  system: SystemInfo | null;
  limits: Limits | null;
  usage: UsageReport | null; loadUsage: (force?: boolean) => Promise<void>;
  toasts: Toast[]; toast: (m: string) => void;
  run: (key: string, act?: string, opts?: Record<string, unknown>) => Promise<void>;
  stop: () => Promise<void>;
  file: (rel: string) => string;
  logTab: string | null; showLog: (jobId: string | null) => void;
  logRequest: number;
  /** workspace page mode: step list or node graph (shared by the top bar toggle and the page) */
  mode: Mode; setMode: (m: Mode) => void;
}
export type Mode = "list" | "nodes";

const Ctx = createContext<App | null>(null);
export const useApp = () => { const c = useContext(Ctx); if (!c) throw new Error("no AppProvider"); return c; };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [route, go] = useRoute();
  const [list, setList] = useState<WsSummary[]>([]);
  const [studio, setStudio] = useState<StudioState | null>(null);
  const [schema, setSchema] = useState<Schema>({});
  const [d, setD] = useState<Details | null>(null);
  const [activity, setActivity] = useState<Job[]>([]);
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [limits, setLimits] = useState<Limits | null>(null);
  const [usage, setUsage] = useState<UsageReport | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [logTab, setLogTab] = useState<string | null>(null);
  const [logRequest, setLogRequest] = useState(0);
  const [mode, setMode] = useStored<Mode>("ws.mode", "list");
  const seq = useRef(0);

  const toast = useCallback((msg: string) => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-2), { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const reloadList = useCallback(async () => {
    try { const r = await api.workspaces(); setList((p) => (same(p, r.workspaces) ? p : r.workspaces)); setStudio(r.studio); } catch { /* server restarting */ }
  }, []);

  // default selection: the newest video
  const ws = route.ws ?? list[list.length - 1]?.id ?? null;

  const refresh = useCallback(async () => {
    if (!ws) return;
    try {
      const r = await api.status(ws);
      setD((p) => (p && p.id === r.id && same(p, r) ? p : r));
    } catch (e) { if (!String((e as Error).message).includes("no such workspace")) return; setD(null); }
  }, [ws]);

  // switching video: drop the old video's data at once so nothing from it is shown under the new name
  useEffect(() => { setD(null); setLogTab(null); }, [ws]);

  useEffect(() => { api.schema().then(setSchema).catch(() => {}); }, []);
  usePoll(reloadList, 6000);
  usePoll(refresh, 3000, !!ws);
  usePoll(async () => { try { const r = await api.activity(); setActivity((p) => (same(p, r.jobs) ? p : r.jobs)); setStudio(r.studio); } catch { /* ignore */ } }, 3000);
  usePoll(async () => { try { setSystem(await api.system()); } catch { /* ignore */ } }, 2000);

  usePoll(async () => { try { setLimits(await api.limits()); } catch { /* ignore */ } }, 30000);
  const loadUsage = useCallback(async (force = false) => { try { setUsage(await api.usage(force)); } catch (e) { if (force) toast((e as Error).message); } }, [toast]);
  usePoll(() => loadUsage(), 60000);

  const busy = useMemo(() => d?.jobs.find((j) => j.status === "running") ?? null, [d]);
  const runningAnywhere = useMemo(() => activity.filter((j) => j.status === "running"), [activity]);

  const showLog = useCallback((id: string | null) => { setLogTab(id); setLogRequest((n) => n + 1); }, []);

  const run = useCallback(async (key: string, act?: string, opts: Record<string, unknown> = {}) => {
    if (!ws) return;
    const a = schema[key];
    if (a?.paid && !window.confirm(`${a.label}${act ? ` ${act}` : ""} calls Claude and costs about ${a.paid}. Run it?`)) return;
    try {
      const r = await api.run(ws, key, opts, act);
      toast(`Started: ${r.job.label}`);
      showLog(r.job.id);
      await refresh();
    } catch (e) { toast((e as Error).message); }
  }, [ws, schema, toast, showLog, refresh]);

  const stop = useCallback(async () => {
    if (!ws || !window.confirm("Stop the running job?")) return;
    try { await api.stop(ws); toast("Stopping…"); } catch (e) { toast((e as Error).message); }
  }, [ws, toast]);

  const file = useCallback((rel: string) => api.fileUrl(ws ?? "", rel), [ws]);

  const value: App = { route, go, ws, list, studio, reloadList, schema, d, refresh, busy, activity, runningAnywhere, system, limits, usage, loadUsage, toasts, toast, run, stop, file, logTab, showLog, logRequest, mode, setMode };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
