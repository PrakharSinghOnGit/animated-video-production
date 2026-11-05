export type St = "none" | "done" | "stale" | "partial" | "running" | "failed";
export type StepKey = "script" | "voice" | "align" | "plan" | "acts" | "sound" | "render" | "publish" | "shorts";

export interface OptDef {
  key: string; label: string; help?: string; type: "select" | "number" | "bool" | "text" | "multi";
  choices?: string[]; def?: string | number | boolean | string[]; min?: number; max?: number; step?: number; volatile?: boolean;
  /** shown only while option `key` has one of these values */
  when?: { key: string; in: string[] };
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
  startedAt: number; endedAt: number | null; ms: number; cmd?: string; cmds: string[]; cmdIndex: number; cmdCount: number; opts: Record<string, unknown>; locks?: string[]; stats: JobStats;
}
export interface FileInfo { path: string; size: number; mtime: number }
/** Your review of one voice section (03-voiceover/review.json). */
export interface VoiceReview { note: string; direction?: string; status: "open" | "regenerated"; at: string; regeneratedAt?: string }
export interface VoiceSection {
  id: string; part: number; partTitle: string; chapterTitle: string | null; file: FileInfo | null; text: string; instruction: string; direction: string;
  pauses: { at: number; dur: number }[]; pausesStale: boolean; wer: number | null; review: VoiceReview | null; prev: FileInfo | null;
}
export interface Loudness { integrated: number; truePeak: number; lra: number }
export interface MasterReport {
  at: string; options: Record<string, number | boolean>; chain: { stage: string; what: string; settings: string; on: boolean }[];
  before: Loudness; after: Loudness; durationIn: number; durationOut: number;
}
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
export interface PlanBeat { startMs: number; endMs: number; vo: string; visual: string; camera: string; hits: { word: string; occurrence: number; what: string }[]; data: { label: string; value: number | string; unit: string; source: string }[] }
export interface PlanAct { id: string; slug?: string; title: string; startMs: number; endMs: number; bpm?: number; chapter: { n: number; title: string } | null; idea: string; beats: number;
  detail: { sheet: string; signature: string; camera: string; transitionIn: string; sound: string; intensity: number | null; beats: PlanBeat[] } }
export type Variant = "A" | "B" | "C";
export interface PubPackage { title: string; type: string; rationale: string; thumbnail: string; hypothesis: string }
export interface PubChecks { errors: string[]; warnings: string[] }
export interface PubMeta {
  video: string; at: string; model: string; durationS: number; titles: Record<Variant, PubPackage>; description: string;
  chapters: { ms: number; time: string; title: string }[]; tags: string[]; hashtags: string[]; checks: PubChecks; edited?: boolean;
}
export interface PubThumb {
  id: Variant; file: FileInfo | null; source: FileInfo | null; notes: string; notesMtime: number; checks: PubChecks | null;
  info: { concept: string; text: string; numbers: string[]; focal: string; hypothesis: string; clear: string } | null;
}
export interface PubIssue { kind: string; severity: string; seen: string; fix: string }
export interface PubReview { file: string; agent: string; at: string; overall: number; summary?: string; all: PubIssue[]; variants: Record<string, { score: number; issues: PubIssue[] }>; costUsd: number; ms: number }
export interface PublishInfo {
  metadata: PubMeta | null; metaFile: FileInfo | null; metaNotes: string; metaNotesMtime: number;
  thumbs: PubThumb[]; preview: FileInfo | null; previewSmall: FileInfo | null;
  reviews: PubReview[]; review: (FileInfo & { text: string }) | null;
  /** your approval of these exact thumbnails + metadata; valid = nothing changed since */
  approval: { at: string; valid: boolean } | null; stale: string[]; exported: FileInfo[]; badge: string;
}
export interface ShortFiles { draft: FileInfo | null; final: FileInfo | null; sheet: FileInfo | null; preview: FileInfo | null; mix: FileInfo | null; voice: FileInfo | null; srt: FileInfo | null }
export const SHORT_STAGES = ["script", "approved", "voice", "align", "plan", "act", "sound", "render", "qc", "exported"] as const;
export type ShortProgress = Record<(typeof SHORT_STAGES)[number], boolean>;
export interface ShortItem {
  id: string;
  entry: { kind?: string; title?: string; hook?: string; payoff?: string; loop?: string; why?: string; words?: number; description?: string; hashtags?: string[]; data?: { label: string; value: number | string; unit?: string; source: string }[] };
  checks: PubChecks | null; progress: ShortProgress;
  /** approved | changed since approval | not approved | no script */
  approval: string; approvedAt: string | null;
  script: string; scriptMtime: number; words: number;
  feedback: string; feedbackMtime: number; notes: string; notesMtime: number;
  files: ShortFiles; thumbs: FileInfo[]; qc: (FileInfo & { text: string }) | null;
  timings: { runs: number; ms: number; costUsd: number };
}
export interface CompactEntry { at: string; bytes: number; deep: boolean; daw: boolean; final: boolean; items: { why: string; n: number; bytes: number }[] }
export interface ShortsInfo {
  items: ShortItem[]; notes: string | null; indexFile: FileInfo | null; feedback: string; feedbackMtime: number; exported: FileInfo[]; compact: CompactEntry[];
}
export interface Details {
  id: string; style: string | null; title: string | null; statuses: Record<string, St>; meta: Record<string, StepMeta | null>;
  script: { file: FileInfo | null; sections: number; idea: string; feedback: string; notes: string; approval: string; approvedAt: string | null; words: number };
  runs: Run[]; totals: { ms: number; costUsd: number };
  voice: { parts: { part: string; files: FileInfo[] }[]; combined: FileInfo[]; sectionCount: number; freshWavs: number; running: boolean;
    sections: VoiceSection[]; scanned: boolean; baseStyle: string | null; engine: string | null };
  align: { holds: HoldsSummary; voice: FileInfo | null; post: { speed: number; gap: number; chapterGap: number; maxPause: number } | null; master: FileInfo | null; masterReport: MasterReport | null; rawVoice: FileInfo | null;
    transcript: { model: string | null; at: string | null; clips: { id: string; startMs: number; durationMs: number; matchedPct: number | null; text: string; words: number }[] } | null;
    srt: FileInfo | null; words: number | null; durationMs: number | null; chapters: { n: number; title: string; startMs: number }[] };
  plan: { file: FileInfo | null; logline: string | null; style: string | null; treatment: Record<string, string>; acts: PlanAct[]; unverified: string[]; approval: { at: string; valid: boolean } | null };
  acts: ActRow[];
  publish: PublishInfo;
  shorts: ShortsInfo;
  sound: { daw: DawInfo; files: FileInfo[]; stems: FileInfo[]; events: number | null; credits: string; eventTypes: [string, number][]; eventActs: [string, number][];
    library: { tracks: MusicTrack[]; prompts: { about: string; common: string; prompts: MusicPrompt[] } | null };
    music: { duration: number; crossfadeSec: number | null; planDuration: number | null; sections: { label: string; title: string | null; t0: number; t1: number; intro: string | null; source: string; bpm: number | null; key: string | null; intensity: number | null }[] } | null };
  render: { videos: FileInfo[]; qc: (FileInfo & { text: string }) | null; draft: St; final: St; seams: SeamsReport | null };
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
export type ProviderId = "claude" | "claude-iit" | "codex" | "opencode" | "agy" | "ollama";
export interface Tok { in: number; cacheWrite: number; cacheRead: number; out: number; replies: number }
/** Tokens per day and model; Claude rows also carry kind + project, OpenCode rows a reported cost. */
export interface URow extends Tok { day: string; model: string; kind?: string; project?: string; cost?: number }
export interface LimitBar { label: string; usedPct: number; resetsAt: number | null; windowMin?: number }
export interface ProviderReport {
  id: ProviderId; label: string; source: string; found: boolean; files: number;
  costKind: "estimate" | "reported" | "subscription" | "free";
  rows: URow[]; limits?: LimitBar[]; limitsAt?: number | null; note?: string;
  recent: { id: string; last: string; model: string; title?: string; project?: string; kind?: string; total: Tok; cost?: number }[];
}
export interface UsageReport {
  scannedAt: number; scanMs: number; files: number; rows: TokRow[];
  sessions: { id: string; project: string; kind: string; last: string; models: Record<string, unknown>; total: { in: number; cacheWrite: number; cacheRead: number; out: number; replies: number } }[];
  pipeline: (Timing & { ws: string; provider?: ProviderId })[];
  providers?: ProviderReport[];
}

export interface LimitWindow { used_percentage: number; resets_at: number | null }
export interface Limits { five_hour: LimitWindow | null; seven_day: LimitWindow | null; updatedAt: number | null }
export interface EnvEntry { key: string; secret: boolean; set: boolean; value: string | null; help: string }
export interface EnvView { file: string; exists: boolean; entries: EnvEntry[]; suggested: string[] }

export interface DeliverItem { key: string; group: string; label: string; file: string; bytes: number; present: boolean; note?: string }
export interface DeliverInfo { builtAt: number; items: DeliverItem[] }
/** Disk size and the downloads of the long video and of each short (GET /overview). */
export interface Overview { bytes: { total: number; shorts: Record<string, number> }; deliver: { video: DeliverInfo | null; shorts: Record<string, DeliverInfo | null> } }
/** One foley event of events_all.json (the user's edits annotated). */
export interface SfxEvent { key: string; t: number; type: string; act: string; d?: number; gain?: number; pan?: number; off?: boolean; gainDb?: number }
export interface SfxClip { key: string; file: string; type: string; act: string; t: number; dur: number }
export interface SfxEdits { off: string[]; gainDb: Record<string, number> }
export interface SfxInfo { events: SfxEvent[] | null; eventsAt: number; edits: SfxEdits; clips: SfxClip[] | null; clipsMissing: number | null; draft: FileInfo | null }

/** Settings → Agent models (/api/models) */
export type ProviderKey = "claude" | "claude-iit" | "codex" | "opencode" | "ollama" | "agy";
export interface ModelEntry { id: string; label: string; free?: boolean; tools?: boolean }
export interface ProviderState { label: string; billing: "subscription" | "free" | "local"; edits: boolean; note: string; ok: boolean; error?: string; models: ModelEntry[] }
export interface RoleRow { key: string; label: string; group: string; edits: boolean; builtin: string; current: string; custom: boolean }
export interface ModelsData { roles: RoleRow[]; providers: Record<ProviderKey, ProviderState> }

/** Align → Pauses for the picture (03-voiceover/holds.json + how the last merge applied them). */
export interface HoldItem {
  id: string; section: string; after: number | "end"; word: string; next?: string; ms: number; on: boolean; by: string;
  why?: string; act?: string; note?: string; key?: string;
  status?: "applied" | "waiting" | "failed" | "off"; failWhy?: string; mergedAt?: number | null;
}
export interface HoldsSummary {
  holds: HoldItem[]; pending: number; scannedAt: string | null; cleanPoints: number; addedMs: number; dirty: boolean;
  planShift: { changed: boolean; shifted: boolean; baseSame: boolean } | null;
}
export interface HoldPoints {
  at: string | null;
  sections: { id: string; part: number; startS: number; words: string[]; points: { after: number; word: string; next: string; clean: boolean; why: string; quietDb: number | null }[] }[];
}

export interface MusicTrack { file: string; title: string; mood: string[]; bpm: number | null; energy: number | null; duration: number; source: string; license: string; credit?: string }
export interface MusicPrompt { id: string; style: string; mood: string[]; energy: number; bpm: number; seconds: number; prompt: string }

/** Render → Seams: one row per act-to-act cut (seams.ts / seams_check.py). */
export interface SeamRow {
  a: string; b: string; owner: string; kind: string; how: string; cutFrame: number; atS: number;
  /** frame-to-frame change (0-255) before / at / after the cut */
  d?: number[]; back?: number; flag?: "ok" | "flicker" | "jump" | "empty"; note?: string; strip: string;
}
export interface SeamsReport { at: string; mtime: number; seams: SeamRow[] }
