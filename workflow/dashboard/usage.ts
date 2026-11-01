/**
 * Model usage for the dashboard, from each tool's own local records plus the pipeline's accounting:
 *  - claude / claude-iit: Claude Code session logs (<config dir>/projects/<project>/*.jsonl, incl. subagents/), one
 *    entry per assistant reply with tokens, model, project and whether it was interactive or a `claude -p` run.
 *  - codex: ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl, cumulative `token_count` events (we take the deltas) and
 *    the latest rate-limit windows; the model comes from `turn_context` lines.
 *  - opencode: ~/.local/share/opencode/opencode.db (session_v2: tokens and cost per session).
 *  - agy: Antigravity CLI transcripts (~/.gemini/antigravity-cli|acp/brain/<id>/.system_generated/logs/transcript.jsonl),
 *    tokens per planner step.
 *  - ollama: local and free; nothing is logged by Ollama itself, so only pipeline runs show up.
 *  - pipeline: workspace/<ID>/timings.json rows (wall time, reported cost, tokens), grouped by the provider prefix of
 *    their model spec ("<provider>:<model>"; bare opus/sonnet/haiku = claude, "agy" = agy).
 * Logs are read incrementally (only bytes appended since the last scan are parsed). Only aggregates leave this module.
 * No prices are assumed: dollar figures are what a tool reported (pipeline, opencode); the page can apply prices.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const HOME = os.homedir();

export type ProviderId = "claude" | "claude-iit" | "codex" | "opencode" | "agy" | "ollama";
export const PROVIDERS: { id: ProviderId; label: string }[] = [
  { id: "claude", label: "Claude" }, { id: "claude-iit", label: "Claude IIT" }, { id: "codex", label: "Codex" },
  { id: "opencode", label: "OpenCode" }, { id: "agy", label: "agy" }, { id: "ollama", label: "Ollama" },
];

export interface Tok { in: number; cacheWrite: number; cacheRead: number; out: number; replies: number }
const zero = (): Tok => ({ in: 0, cacheWrite: 0, cacheRead: 0, out: 0, replies: 0 });
const addTok = (a: Tok, b: Partial<Tok>) => {
  a.in += b.in ?? 0; a.cacheWrite += b.cacheWrite ?? 0; a.cacheRead += b.cacheRead ?? 0; a.out += b.out ?? 0; a.replies += b.replies ?? 0;
};

/** One aggregated row: tokens per day and model (Claude rows also carry kind + project). */
export interface URow extends Tok { day: string; model: string; kind?: string; project?: string; cost?: number }
export interface LimitBar { label: string; usedPct: number; resetsAt: number | null; windowMin?: number }
export interface Recent { id: string; last: string; model: string; title?: string; project?: string; kind?: string; total: Tok; cost?: number }
export interface ProviderReport {
  id: ProviderId; label: string; source: string; found: boolean; files: number;
  costKind: "estimate" | "reported" | "subscription" | "free";
  rows: URow[]; recent: Recent[]; limits?: LimitBar[]; limitsAt?: number | null; note?: string;
}

// ───────────────────────────── incremental line reader ─────────────────────────────

interface Tail { size: number; offset: number; rest: string }
/** Calls onLine for every complete line appended since the last call; restarts when the file shrank (rewritten). */
function readNew(f: string, t: Tail, filter: (line: string) => boolean, onLine: (line: string) => void): "same" | "grew" | "reset" | "gone" {
  let st: fs.Stats;
  try { st = fs.statSync(f); } catch { return "gone"; }
  let res: "grew" | "reset" = "grew";
  if (st.size < t.size || st.size < t.offset) { t.size = 0; t.offset = 0; t.rest = ""; res = "reset"; }
  if (st.size === t.offset) return "same";
  const fd = fs.openSync(f, "r");
  try {
    const CH = 4 * 1024 * 1024, buf = Buffer.alloc(CH);
    while (t.offset < st.size) {
      const n = fs.readSync(fd, buf, 0, Math.min(CH, st.size - t.offset), t.offset);
      if (n <= 0) break;
      t.offset += n;
      const lines = (t.rest + buf.toString("utf-8", 0, n)).split("\n");
      t.rest = lines.pop() ?? "";
      for (const line of lines) if (filter(line)) onLine(line);
    }
    t.size = st.size;
  } finally { fs.closeSync(fd); }
  return res;
}
const yieldNow = () => new Promise((r) => setTimeout(r, 0));
const ls = (d: string) => { try { return fs.readdirSync(d, { withFileTypes: true }); } catch { return [] as fs.Dirent[]; } };

// ───────────────────────────── Claude Code profiles ─────────────────────────────

interface ClaudeSession { id: string; project: string; kind: string; first: string; last: string; models: Record<string, Tok>; sub: boolean }
interface ClaudeFile extends Tail { seen: Set<string>; session: ClaudeSession }

class ClaudeProfile {
  files = new Map<string, ClaudeFile>();
  /** day|model|kind|project → tokens */
  byKey = new Map<string, Tok>();
  constructor(public id: ProviderId, public dir: string) {}
  get projects() { return path.join(this.dir, "projects"); }

  walk(): string[] {
    const out: string[] = [];
    for (const p of ls(this.projects)) {
      if (!p.isDirectory()) continue;
      const pd = path.join(this.projects, p.name);
      for (const e of ls(pd)) {
        if (e.isFile() && e.name.endsWith(".jsonl")) out.push(path.join(pd, e.name));
        else if (e.isDirectory()) for (const s of ls(path.join(pd, e.name, "subagents"))) if (s.name.endsWith(".jsonl")) out.push(path.join(pd, e.name, "subagents", s.name));
      }
    }
    return out;
  }

  scan(f: string) {
    const rel = path.relative(this.projects, f), project = rel.split(path.sep)[0].replace(/^-Users-[^-]+-/, "").replace(/-/g, "/");
    let s = this.files.get(f);
    if (!s) {
      s = { size: 0, offset: 0, rest: "", seen: new Set(), session: { id: path.basename(f, ".jsonl"), project, kind: "", first: "", last: "", models: {}, sub: rel.includes(`${path.sep}subagents${path.sep}`) } };
      this.files.set(f, s);
    }
    const state = s;
    readNew(f, state, (l) => l.includes('"usage"') && l.includes('"type":"assistant"'), (line) => {
      let d: any;
      try { d = JSON.parse(line); } catch { return; }
      const m = d.message;
      if (!m?.usage || !m.model || m.model === "<synthetic>") return;
      if (m.id) { if (state.seen.has(m.id)) return; state.seen.add(m.id); }     // one reply is split over several lines
      const u = m.usage;
      const t = { in: Number(u.input_tokens ?? 0), cacheWrite: Number(u.cache_creation_input_tokens ?? 0), cacheRead: Number(u.cache_read_input_tokens ?? 0), out: Number(u.output_tokens ?? 0), replies: 1 };
      const day = String(d.timestamp ?? "").slice(0, 10), kind = state.session.sub ? "subagent" : d.entrypoint === "cli" ? "interactive" : "pipeline";
      state.session.kind ||= kind;
      state.session.first ||= d.timestamp; state.session.last = d.timestamp ?? state.session.last;
      addTok((state.session.models[m.model] ??= zero()), t);
      const k = `${day}|${m.model}|${kind}|${project}`;
      addTok(this.byKey.get(k) ?? (this.byKey.set(k, zero()), this.byKey.get(k)!), t);
    });
  }

  async refresh() { for (const f of this.walk()) { this.scan(f); await yieldNow(); } }

  rows(): URow[] {
    return [...this.byKey.entries()].map(([k, t]) => { const [day, model, kind, project] = k.split("|"); return { day, model, kind, project, ...t }; });
  }
  sessions() {
    return [...this.files.values()].map((f) => f.session).filter((s) => Object.keys(s.models).length)
      .map((s) => { const total = zero(); for (const t of Object.values(s.models)) addTok(total, t); return { ...s, total }; })
      .sort((a, b) => String(b.last).localeCompare(String(a.last))).slice(0, 60);
  }
}

const claude = new ClaudeProfile("claude", process.env.CLAUDE_CONFIG_DIR_DEFAULT || path.join(HOME, ".claude"));
const claudeIit = new ClaudeProfile("claude-iit", process.env.CLAUDE_IIT_DIR || path.join(HOME, ".claude-iit"));

// ───────────────────────────── Codex ─────────────────────────────

const CODEX = path.join(HOME, ".codex", "sessions");
interface CodexFile extends Tail { model: string; prev: { in: number; cached: number; out: number }; first: string; last: string; total: Tok }
const codexFiles = new Map<string, CodexFile>();
const codexByKey = new Map<string, Tok>();
let codexLimits: { at: string; rl: any } | null = null;

function codexWalk(): string[] {
  const out: string[] = [];
  const rec = (d: string, depth: number) => {
    for (const e of ls(d)) {
      const p = path.join(d, e.name);
      if (e.isDirectory() && depth < 4) rec(p, depth + 1);
      else if (e.isFile() && e.name.endsWith(".jsonl")) out.push(p);
    }
  };
  rec(CODEX, 0);
  return out;
}

function codexScan(f: string) {
  let s = codexFiles.get(f);
  if (!s) { s = { size: 0, offset: 0, rest: "", model: "", prev: { in: 0, cached: 0, out: 0 }, first: "", last: "", total: zero() }; codexFiles.set(f, s); }
  const st = s;
  const r = readNew(f, st, (l) => l.includes('"token_count"') || l.includes('"turn_context"') || l.includes('"session_meta"'), (line) => {
    let d: any;
    try { d = JSON.parse(line); } catch { return; }
    const p = d.payload ?? {};
    if (d.type === "turn_context" && p.model) { st.model = String(p.model); return; }
    if (d.type === "session_meta") { st.first ||= d.timestamp ?? ""; if (p.model) st.model ||= String(p.model); return; }
    if (d.type !== "event_msg" || p.type !== "token_count") return;
    if (p.rate_limits && (!codexLimits || String(d.timestamp) >= codexLimits.at)) codexLimits = { at: String(d.timestamp), rl: p.rate_limits };
    const tu = p.info?.total_token_usage;
    if (!tu) return;
    // totals are cumulative per session: count the growth since the previous event
    const cur = { in: Number(tu.input_tokens ?? 0), cached: Number(tu.cached_input_tokens ?? 0), out: Number(tu.output_tokens ?? 0) };
    if (cur.in < st.prev.in) st.prev = { in: 0, cached: 0, out: 0 };
    const dCached = Math.max(0, cur.cached - st.prev.cached), dIn = Math.max(0, cur.in - st.prev.in - dCached), dOut = Math.max(0, cur.out - st.prev.out);
    st.prev = cur;
    if (!dIn && !dCached && !dOut) return;
    // OpenAI counts cached input inside input_tokens: split it so totals do not double count
    const t = { in: dIn, cacheRead: dCached, out: dOut, replies: 1 };
    const day = String(d.timestamp ?? "").slice(0, 10), model = st.model || "codex";
    st.first ||= d.timestamp ?? ""; st.last = d.timestamp ?? st.last;
    addTok(st.total, t);
    const k = `${day}|${model}`;
    addTok(codexByKey.get(k) ?? (codexByKey.set(k, zero()), codexByKey.get(k)!), t);
  });
  if (r === "reset") { /* rewritten file: its earlier deltas stay counted; rare for append-only rollouts */ }
}

function codexReport(): ProviderReport {
  const rows: URow[] = [...codexByKey.entries()].map(([k, t]) => { const [day, model] = k.split("|"); return { day, model, ...t }; });
  const recent: Recent[] = [...codexFiles.entries()].filter(([, s]) => s.total.replies)
    .map(([f, s]) => ({ id: path.basename(f, ".jsonl").replace(/^rollout-/, ""), last: s.last, model: s.model || "codex", total: s.total }))
    .sort((a, b) => b.last.localeCompare(a.last)).slice(0, 40);
  const limits: LimitBar[] = [];
  const win = (w: any, fallback: string) => {
    if (!w || typeof w.used_percent !== "number") return;
    const m = Number(w.window_minutes ?? 0);
    const label = m >= 1440 * 6 ? `${Math.round(m / 1440)}-day window` : m >= 60 ? `${Math.round(m / 60)}-hour window` : m ? `${m}-min window` : fallback;
    limits.push({ label, usedPct: w.used_percent, resetsAt: typeof w.resets_at === "number" ? w.resets_at : null, windowMin: m || undefined });
  };
  if (codexLimits) { win(codexLimits.rl.primary, "Primary"); win(codexLimits.rl.secondary, "Secondary"); }
  return {
    id: "codex", label: "Codex", source: "~/.codex/sessions", found: codexFiles.size > 0, files: codexFiles.size, costKind: "subscription",
    rows, recent, limits, limitsAt: codexLimits ? Date.parse(codexLimits.at) : null,
    note: "Cached input is split out of input tokens. Codex on a ChatGPT plan has no per-token bill: see the rate-limit windows.",
  };
}

// ───────────────────────────── OpenCode ─────────────────────────────

const OPENCODE_DB = path.join(HOME, ".local", "share", "opencode", "opencode.db");
let ocCache: { stamp: string; report: ProviderReport } | null = null;

function opencodeReport(): ProviderReport {
  const base: ProviderReport = { id: "opencode", label: "OpenCode", source: "~/.local/share/opencode/opencode.db", found: false, files: 0, costKind: "reported", rows: [], recent: [] };
  const stamp = ["", "-wal"].map((x) => { try { const s = fs.statSync(OPENCODE_DB + x); return `${s.size}:${s.mtimeMs}`; } catch { return "-"; } }).join("|");
  if (stamp.startsWith("-")) return base;
  if (ocCache?.stamp === stamp) return ocCache.report;
  let report = base;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Database } = require("bun:sqlite") as typeof import("bun:sqlite");
    const db = new Database(OPENCODE_DB, { readonly: true });
    try {
      const sessions = db.query("select id, title, directory, model, cost, tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write, time_created, time_updated from session_v2").all() as any[];
      const byKey = new Map<string, URow>();
      const recent: Recent[] = [];
      for (const s of sessions) {
        let model = "unknown";
        try { const m = JSON.parse(s.model ?? "{}"); model = m.providerID ? `${m.providerID}/${m.id}` : String(m.id ?? model); } catch { model = String(s.model ?? model); }
        const t: Tok = { in: Number(s.tokens_input ?? 0), cacheWrite: Number(s.tokens_cache_write ?? 0), cacheRead: Number(s.tokens_cache_read ?? 0), out: Number(s.tokens_output ?? 0) + Number(s.tokens_reasoning ?? 0), replies: 1 };
        const last = new Date(Number(s.time_updated ?? s.time_created ?? 0)).toISOString();
        const day = last.slice(0, 10), k = `${day}|${model}`;
        const row = byKey.get(k) ?? (byKey.set(k, { day, model, ...zero(), cost: 0 }), byKey.get(k)!);
        addTok(row, t); row.cost = (row.cost ?? 0) + Number(s.cost ?? 0);
        recent.push({ id: String(s.id), last, model, title: s.title ?? undefined, project: s.directory ? path.basename(s.directory) : undefined, total: t, cost: Number(s.cost ?? 0) });
      }
      report = {
        ...base, found: true, files: sessions.length, rows: [...byKey.values()],
        recent: recent.sort((a, b) => b.last.localeCompare(a.last)).slice(0, 40),
        note: "Per session (dated by its last activity). Cost is what OpenCode recorded; free models and subscription providers (claude-agent) report $0.",
      };
    } finally { db.close(); }
  } catch (e) {
    report = { ...base, note: `Could not read the OpenCode database: ${(e as Error).message}` };
  }
  ocCache = { stamp, report };
  return report;
}

// ───────────────────────────── agy (Antigravity CLI) ─────────────────────────────

const AGY_ROOTS = ["antigravity-cli", "antigravity-acp"].map((d) => path.join(HOME, ".gemini", d, "brain"));
interface AgyFile extends Tail { first: string; last: string; total: Tok }
const agyFiles = new Map<string, AgyFile>();
const agyByDay = new Map<string, Tok>();

function agyWalk(): string[] {
  const out: string[] = [];
  for (const root of AGY_ROOTS) for (const c of ls(root)) if (c.isDirectory()) {
    const f = path.join(root, c.name, ".system_generated", "logs", "transcript.jsonl");
    if (fs.existsSync(f)) out.push(f);
  }
  return out;
}

function agyScan(f: string) {
  let s = agyFiles.get(f);
  if (!s) { s = { size: 0, offset: 0, rest: "", first: "", last: "", total: zero() }; agyFiles.set(f, s); }
  const st = s;
  readNew(f, st, (l) => l.includes('"input_tokens"'), (line) => {
    let d: any;
    try { d = JSON.parse(line); } catch { return; }
    if (typeof d.input_tokens !== "number") return;
    // agy reports cache reads separately from input (input excludes them)
    const t = { in: Number(d.input_tokens ?? 0), cacheRead: Number(d.cache_read_tokens ?? 0), out: Number(d.output_tokens ?? 0), replies: 1 };
    const day = String(d.created_at ?? "").slice(0, 10);
    st.first ||= d.created_at ?? ""; st.last = d.created_at ?? st.last;
    addTok(st.total, t);
    addTok(agyByDay.get(day) ?? (agyByDay.set(day, zero()), agyByDay.get(day)!), t);
  });
}

function agyReport(): ProviderReport {
  const rows: URow[] = [...agyByDay.entries()].map(([day, t]) => ({ day, model: "gemini (agy)", ...t }));
  const recent: Recent[] = [...agyFiles.entries()].filter(([, s]) => s.total.replies)
    .map(([f, s]) => ({ id: path.basename(path.dirname(path.dirname(path.dirname(f)))), last: s.last, model: "gemini (agy)", total: s.total }))
    .sort((a, b) => b.last.localeCompare(a.last)).slice(0, 40);
  return {
    id: "agy", label: "agy", source: "~/.gemini/antigravity-cli/brain", found: agyFiles.size > 0, files: agyFiles.size, costKind: "free", rows, recent,
    note: "Tokens per planner step from agy's transcripts. Its logs do not name the model; the pipeline uses Gemini Flash by default.",
  };
}

// ───────────────────────────── refresh + report ─────────────────────────────

let lastScan = 0, scanning: Promise<void> | null = null, scanMs = 0;

export function refreshUsage(force = false): Promise<void> {
  if (scanning) return scanning;
  if (!force && Date.now() - lastScan < 15000) return Promise.resolve();
  scanning = (async () => {
    const t0 = Date.now();
    await claude.refresh();
    await claudeIit.refresh();
    for (const f of codexWalk()) { codexScan(f); await yieldNow(); }
    for (const f of agyWalk()) { agyScan(f); await yieldNow(); }
    lastScan = Date.now(); scanMs = lastScan - t0;
  })().finally(() => { scanning = null; });
  return scanning;
}

type PipeRow = { ws: string; step: string; model?: string; costUsd?: number; ms?: number; at?: string; inputTokens?: number; outputTokens?: number; cacheReadTokens?: number };

/** Provider of a pipeline model spec: "<provider>:<model>", bare claude aliases/ids = claude, "agy" = agy. */
export function providerOf(model?: string): ProviderId {
  const m = String(model ?? "").trim();
  const pre = m.includes(":") ? m.slice(0, m.indexOf(":")) : "";
  if (PROVIDERS.some((p) => p.id === pre)) return pre as ProviderId;
  if (/^agy\b|gemini/i.test(m)) return "agy";
  if (/^ollama\b/i.test(m)) return "ollama";
  if (/^codex\b|^gpt-|^o\d/i.test(m)) return "codex";
  if (/^opencode\b/i.test(m)) return "opencode";
  return "claude";
}

function claudeReport(p: ClaudeProfile, label: string): ProviderReport {
  const found = fs.existsSync(p.projects);
  return {
    id: p.id, label, source: path.join(p.dir.replace(HOME, "~"), "projects"), found: found && p.files.size > 0, files: p.files.size, costKind: "estimate",
    rows: p.rows(),
    recent: p.sessions().map((s) => ({ id: s.id, last: s.last, model: Object.keys(s.models).join(", "), project: s.project, kind: s.kind, total: s.total })),
  };
}

export function usageReport(pipelineRows: PipeRow[]) {
  const paid = pipelineRows.filter((r) => r.costUsd || r.model).map((r) => ({ ...r, provider: providerOf(r.model) }));
  const providers: ProviderReport[] = [
    claudeReport(claude, "Claude"),
    claudeReport(claudeIit, "Claude IIT"),
    codexReport(),
    opencodeReport(),
    agyReport(),
    { id: "ollama", label: "Ollama", source: "pipeline runs only", found: paid.some((r) => r.provider === "ollama"), files: 0, costKind: "free", rows: [], recent: [], note: "Local models are free; Ollama keeps no usage log, so only pipeline runs are counted." },
  ];
  // legacy fields (default Claude profile) keep older clients working
  const sessions = claude.sessions();
  return { scannedAt: lastScan, scanMs, scanning: !!scanning, files: claude.files.size, rows: claude.rows(), sessions, pipeline: paid, providers };
}
