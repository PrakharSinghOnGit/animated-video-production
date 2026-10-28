export type St = "none" | "done" | "stale" | "partial" | "running" | "failed";
export type StepKey = "script" | "voice" | "align" | "plan" | "acts" | "sound" | "render";

export interface OptDef {
  key: string; label: string; help?: string; type: "select" | "number" | "bool" | "text" | "multi";
  choices?: string[]; def?: string | number | boolean | string[]; min?: number; max?: number; step?: number;
}
export interface ChainLink { label: string; action?: string }
export interface ActionDef {
  step: string; label: string; help: string; paid: string | null; long: string | null; perAct: boolean; opts: OptDef[];
  /** master buttons: the commands they run in order; `action` is set when another button runs that command on its own */
  chain?: ChainLink[];
}
export type Schema = Record<string, ActionDef>;

export interface JobStats { cpuAvg: number | null; cpuPeak: number | null; rssPeakMB: number | null; gpuAvg: number | null; gpuPeak: number | null; cur: { cpu: number; rssMB: number; top: string[] } | null }
export interface Job {
  id: string; ws: string; step: string; label: string; status: "running" | "done" | "failed" | "stopped"; exitCode: number | null;
  startedAt: number; endedAt: number | null; ms: number; cmd?: string; cmds: string[]; cmdIndex: number; cmdCount: number; opts: Record<string, unknown>; stats: JobStats;
}
export interface FileInfo { path: string; size: number; mtime: number }
export interface Timing { step: string; ms?: number; model?: string; costUsd?: number; inputTokens?: number; outputTokens?: number; cacheReadTokens?: number; at?: string; note?: string }
export interface StepMeta { runs: number; totalMs: number; totalCost: number; last: { step: string; ms?: number; costUsd?: number; model?: string; at?: string } }
export interface Run { id: string; step: string; label: string; cmds?: string[]; opts?: Record<string, unknown>; status: string; start: number; end: number; ms: number; cpuAvg?: number | null; cpuPeak?: number | null; rssPeakMB?: number | null; gpuAvg?: number | null; gpuPeak?: number | null }
export interface Issue { time: string; severity: string; kind: string; seen: string; said?: string; fix: string }
export interface Review { file: string; agent: string; at: string; sync: number; overall: number; summary?: string; issues: Issue[]; costUsd: number; ms: number; give: string[] }
export interface ActRow {
  id: string; title: string; status: St; scene: FileInfo | null; thumbs: FileInfo[]; sheet: FileInfo | null;
  critic: { file: string; score: number; pass: boolean; issues: { time: string; problem: string; fix: string }[] } | null;
  notes: string; preview: FileInfo | null; reviews: Review[]; start: number; end: number; idea?: string; notesMtime: number; meta: StepMeta | null;
  /** explicit human approval, valid only while the scene file is the one approved */
  approval: { at: string; sceneMtime: number } | null;
}
export interface PlanAct { id: string; slug?: string; title: string; startMs: number; endMs: number; bpm?: number; chapter: { n: number; title: string } | null; idea: string; beats: number }
export interface Details {
  id: string; style: string | null; title: string | null; statuses: Record<string, St>; meta: Record<string, StepMeta | null>;
  script: { file: FileInfo | null; sections: number; idea: string; feedback: string; notes: string; approval: string; approvedAt: string | null; words: number };
  runs: Run[]; totals: { ms: number; costUsd: number };
  voice: { parts: { part: string; files: FileInfo[] }[]; combined: FileInfo[]; sectionCount: number; freshWavs: number; running: boolean };
  align: { master: FileInfo | null; words: number | null; durationMs: number | null; chapters: { n: number; title: string; startMs: number }[] };
  plan: { file: FileInfo | null; logline: string | null; acts: PlanAct[]; unverified: string[] };
  acts: ActRow[];
  sound: { daw: DawInfo; files: FileInfo[]; stems: FileInfo[]; events: number | null; credits: string };
  render: { videos: FileInfo[]; qc: (FileInfo & { text: string }) | null; draft: St; final: St };
  timings: Timing[]; jobs: Job[];
}
export interface WsSummary { id: string; statuses: Record<string, St>; running: Job | null; title: string | null; totals: { ms: number; costUsd: number } }
export interface DawInfo {
  setUp: boolean; bundle: FileInfo | null; mix: FileInfo | null; autoMix: FileInfo | null; bundleStale: boolean;
  build: { builtAt: number; regions: number; samples: number; bytes: number; events: number; music: boolean; tracks: string[] } | null;
}
export interface DawState { setUp: boolean; port: number; running: boolean; ready: boolean; url: string | null; exited: number | null; tail: string }
export interface StudioState { ws: string; running: boolean; port: number | null; url: string | null; exited: number | null }
export interface Sample {
  t: number; cpu: number; cores: number[]; memUsedGB: number; memTotalGB: number; swapUsedGB: number; gpu: number | null; gpuMemGB: number | null; load: number[]; diskFreeGB: number | null;
}
export interface SystemInfo {
  machine: { cpu: string; cores: number; memGB: number; host: string }; now: Sample; history: Sample[];
  top: { pid: number; comm: string; cpu: number; rssMB: number }[];
}
export interface TokRow { day: string; model: string; kind: string; project: string; in: number; cacheWrite: number; cacheRead: number; out: number; replies: number }
export interface UsageReport {
  scannedAt: number; scanMs: number; files: number; rows: TokRow[];
  sessions: { id: string; project: string; kind: string; last: string; models: Record<string, unknown>; total: { in: number; cacheWrite: number; cacheRead: number; out: number; replies: number } }[];
  pipeline: (Timing & { ws: string })[];
}

export interface LimitWindow { used_percentage: number; resets_at: number | null }
export interface Limits { five_hour: LimitWindow | null; seven_day: LimitWindow | null; updatedAt: number | null }
export interface EnvEntry { key: string; secret: boolean; set: boolean; value: string | null; help: string }
export interface EnvView { file: string; exists: boolean; entries: EnvEntry[]; suggested: string[] }
