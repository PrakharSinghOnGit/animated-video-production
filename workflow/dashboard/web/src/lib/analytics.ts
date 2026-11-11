/** Types and calls for the Analytics page (server: workflow/dashboard/analytics.ts). */
export interface RetPoint { r: number; watch: number; rel?: number }
export interface YtVideo {
  ytId: string; title: string; publishedAt: string; durationS: number; thumb?: string; views: number; likes: number; comments: number;
  minutes?: number; avdS?: number; avgPct?: number; subsGained?: number; subsLost?: number; shares?: number;
  impressions?: number; ctr?: number; retention?: RetPoint[]; traffic?: { source: string; views: number; minutes: number }[]; ws?: string; short?: boolean; parent?: string; shortId?: string;
}
export interface Snapshot {
  fetchedAt: string; mock?: boolean;
  channel: { id: string; title: string; handle?: string; subs: number; views: number; videos: number; thumb?: string };
  range: { start: string; end: string };
  daily: { day: string; views: number; minutes: number; subsNet: number }[];
  videos: YtVideo[];
  reach: { status: "ok" | "pending" | "unavailable"; note: string; since?: string };
  quota: { dataApiUnits: number; calls: number };
  errors: string[];
}
export interface Flag {
  area: string; kind: "problem" | "strength" | "note"; severity: 1 | 2 | 3; text: string; targets: string[];
  metric?: string; value?: string; baseline?: string; basis?: string; at?: { s: number; act?: string; words?: string };
}
export interface Metrics { ctr?: number; impressions?: number; avgPct?: number; ret30?: number; relEarly?: number; relAll?: number; subsPer1k?: number; engPer1k?: number }
export interface ActStat { id: string; title: string; startS: number; endS: number; startWatch: number; endWatch: number; lossPerMin: number; rel?: number }
export interface VideoDiag { ytId: string; ws?: string; metrics: Metrics; flags: Flag[]; acts: ActStat[]; dips: { s: number; drop: number; act?: string; words?: string }[] }
export interface Diagnosis { baseline: Metrics & { n: number }; videos: Record<string, VideoDiag> }
export type LessonStatus = "proposed" | "active" | "rejected" | "retired";
export interface Lesson {
  id: string; target: string; rule: string; why: string; evidence: { video: string; metric: string; value: string; baseline?: string; note?: string }[];
  confidence: "low" | "medium" | "high"; basis: number; status: LessonStatus; createdAt: string; decidedAt?: string;
  source?: { review: string; agent: string }; replaces?: string; verify?: string; reason?: string;
}
export interface LessonStore { version: number; lessons: Lesson[]; log: { at: string; action: string; id: string; note?: string; version: number }[] }
export interface Review {
  at: string; agent: string; costUsd: number; ms: number; video: string | null; mock: boolean; proposed: string[]; summary: string;
  findings?: { video: string; area: string; kind: string; finding: string }[]; retire?: { id: string; why: string }[]; watch?: string[];
}
export type AuthState = { state: "no-client" } | { state: "no-token" } | { state: "expired"; error: string } | { state: "ok"; since: string };
export interface AnalyticsData {
  auth: AuthState; mock: boolean; mockAvailable: boolean; realAvailable: boolean;
  snapshot: Snapshot | null; diagnosis: Diagnosis | null;
  lessons: LessonStore; targets: string[]; targetInfo: Record<string, string>; cap: number;
  workspaces: { id: string; ytId: string | null; title: string | null }[];
  acts: Record<string, { id: string; title: string; startMs: number; endMs: number }[]>;
  reviews: Review[]; fetchLog: { at: string; ms: number; calls: number; dataApiUnits: number; errors: number }[];
  running: { id: string; step: string; label: string; status: string; startedAt: number } | null;
}

export const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
export const pct = (x?: number, d = 1) => (x === undefined || x === null || !Number.isFinite(x) ? "—" : `${(x * 100).toFixed(d)}%`);
export const num = (x?: number, d = 1) => (x === undefined || x === null || !Number.isFinite(x) ? "—" : x.toFixed(d));
export const int = (x?: number) => (x === undefined || x === null || !Number.isFinite(x) ? "—" : x >= 1e6 ? `${(x / 1e6).toFixed(1)}M` : x >= 1e4 ? `${(x / 1e3).toFixed(1)}k` : Math.round(x).toLocaleString());
export const TRAFFIC: Record<string, string> = {
  BROWSE: "Browse / home", YT_SEARCH: "YouTube search", RELATED_VIDEO: "Suggested videos", SHORTS: "Shorts feed", EXT_URL: "External",
  NO_LINK_OTHER: "Direct / unknown", SUBSCRIBER: "Subscriptions", PLAYLIST: "Playlists", YT_CHANNEL: "Channel pages", NOTIFICATION: "Notifications",
  END_SCREEN: "End screens", ANNOTATION: "Cards", HASHTAGS: "Hashtags", YT_OTHER_PAGE: "Other YouTube", CAMPAIGN_CARD: "Campaign cards",
};

// ───────────── comments (bun run yt:comments → workspace/_analytics/comments.json) ─────────────
export type CommentKind = "praise" | "question" | "addition" | "disagreement" | "factual" | "quality" | "troll" | "spam";
export interface YtComment {
  id: string; videoId: string; author: string; text: string; at: string; likes: number;
  replies: { id: string; author: string; text: string; at: string; mine: boolean }[]; repliedByMe: boolean;
  status: "todo" | "done" | "skip";
  triage?: { kind: CommentKind; reply: boolean; heart: boolean; summary: string; draft: string; check: string; model: string; at: string; edited?: boolean };
}
export interface CommentStore { fetchedAt: string; channelId: string; videos: Record<string, { title: string; short: boolean; ws?: string }>; comments: Record<string, YtComment> }
export interface CommentsData { store: CommentStore | null; hasKey: boolean; model: string; running: { id: string; step: string; label: string } | null }
export const commentUrl = (c: YtComment) => `https://www.youtube.com/watch?v=${c.videoId}&lc=${c.id}`;

// ───────────── ideas (bun run ideas → workspace/_ideas/ideas.json) ─────────────
export interface IdeaCompetitor {
  ytId: string; title: string; channel: string; channelId: string; publishedAt: string; durationS: number; views: number; channelSubs: number; channelAvgViews: number; ratio: number; thumb?: string; query: string;
  /** views ÷ the median of the channel's recent same-format uploads (yt-viral); absent → only `ratio` (lifetime average) */
  median?: number; multiple?: number; sampleN?: number; formula?: string;
}
/** yt-package/title.py on a title + thumbnail text */
export interface TitleLint { title?: string; score: number; chars: number; issues: [string, string][]; good: string[] }
export interface IdeaVerdict {
  verdict: "make" | "rework" | "drop"; summary: string;
  fit: { score: number; tests: { test: string; pass: boolean | null; note: string }[] };
  demand: { level: "high" | "medium" | "low" | "unclear"; evidence: string };
  overlap: { video: string; note: string }[]; angle: string; packages: { title: string; thumbnail: string; thumbText?: string; why: string; lint?: TitleLint }[]; risks: string[]; sources: string[];
}
/** found by Find ideas (bun run ideas --discover): ranked from recent outliers in the niche */
export interface IdeaFound {
  at: string; rank: number; score: number; fit: number; demand: number; why: string; risk: string; focus: string;
  inspiredBy: { ytId: string; title: string; channel: string; views: number; multiple: number | null }[];
  package?: { title: string; thumbnail: string; thumbText?: string; lint?: TitleLint };
}
export interface Idea {
  id: string; title: string; note: string; keywords: string; status: "new" | "researched" | "started" | "dropped"; createdAt: string; ws?: string; found?: IdeaFound;
  research?: { at: string; queries: string[]; competitors: IdeaCompetitor[]; verdict: IdeaVerdict | null; model: string; costUsd: number; quotaUnits: number; error?: string; formulas?: { formula: string; n: number }[] };
}
export interface IdeasData { store: { ideas: Idea[] }; audience: string; hasKey: boolean; model: string; queryModel: string; running: { id: string; step: string; label: string } | null }
