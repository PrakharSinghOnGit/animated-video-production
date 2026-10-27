/**
 * Claude usage for the dashboard, from two local sources:
 *  1. Claude Code's session logs (~/.claude/projects/<project>/*.jsonl, incl. subagents/): tokens per assistant reply,
 *     with model, project, session, day and whether it was an interactive session ("cli") or a headless pipeline run
 *     ("sdk-cli" = `claude -p`). Read incrementally (only new bytes are parsed on each refresh).
 *  2. The pipeline's own accounting (workspace/<ID>/timings.json): wall time and the dollar cost `claude -p` reports.
 * Only aggregates leave this module. No prices are assumed here: dollar figures come from the pipeline's reported cost;
 * the page can apply per-model prices the user enters.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PROJECTS = path.join(os.homedir(), ".claude", "projects");

export interface Tok { in: number; cacheWrite: number; cacheRead: number; out: number; replies: number }
const zero = (): Tok => ({ in: 0, cacheWrite: 0, cacheRead: 0, out: 0, replies: 0 });
const add = (a: Tok, u: any) => {
  a.in += Number(u.input_tokens ?? 0); a.cacheWrite += Number(u.cache_creation_input_tokens ?? 0);
  a.cacheRead += Number(u.cache_read_input_tokens ?? 0); a.out += Number(u.output_tokens ?? 0); a.replies++;
};

interface SessionAgg { id: string; project: string; kind: string; first: string; last: string; models: Record<string, Tok>; sub: boolean }
interface FileState { size: number; offset: number; rest: string; seen: Set<string>; session: SessionAgg }

const files = new Map<string, FileState>();
/** day|model|kind|project → tokens */
const byKey = new Map<string, Tok>();
let lastScan = 0, scanning: Promise<void> | null = null, scanMs = 0;

const projectName = (dir: string) => dir.replace(/^-Users-[^-]+-/, "").replace(/-/g, "/");

function walk(): string[] {
  const out: string[] = [];
  let projects: string[] = [];
  try { projects = fs.readdirSync(PROJECTS); } catch { return out; }
  for (const p of projects) {
    const pd = path.join(PROJECTS, p);
    let entries: fs.Dirent[] = [];
    try { entries = fs.readdirSync(pd, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith(".jsonl")) out.push(path.join(pd, e.name));
      else if (e.isDirectory()) {
        const sd = path.join(pd, e.name, "subagents");
        try { for (const f of fs.readdirSync(sd)) if (f.endsWith(".jsonl")) out.push(path.join(sd, f)); } catch {}
      }
    }
  }
  return out;
}

async function scanFile(f: string): Promise<void> {
  let st: fs.Stats;
  try { st = fs.statSync(f); } catch { return; }
  let s = files.get(f);
  const rel = path.relative(PROJECTS, f), project = projectName(rel.split(path.sep)[0]);
  if (!s || st.size < s.size) {
    s = { size: 0, offset: 0, rest: "", seen: new Set(), session: { id: path.basename(f, ".jsonl"), project, kind: "", first: "", last: "", models: {}, sub: rel.includes(`${path.sep}subagents${path.sep}`) } };
    files.set(f, s);
  }
  if (st.size === s.offset) return;
  const fd = fs.openSync(f, "r");
  try {
    const CH = 4 * 1024 * 1024;
    const buf = Buffer.alloc(CH);
    while (s.offset < st.size) {
      const n = fs.readSync(fd, buf, 0, Math.min(CH, st.size - s.offset), s.offset);
      if (n <= 0) break;
      s.offset += n;
      const text = s.rest + buf.toString("utf-8", 0, n);
      const lines = text.split("\n");
      s.rest = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.includes('"usage"') || !line.includes('"type":"assistant"')) continue;
        let d: any;
        try { d = JSON.parse(line); } catch { continue; }
        const m = d.message;
        if (!m?.usage || !m.model || m.model === "<synthetic>") continue;
        if (m.id) { if (s.seen.has(m.id)) continue; s.seen.add(m.id); }     // one reply is split over several lines
        const day = String(d.timestamp ?? "").slice(0, 10), kind = s.session.sub ? "subagent" : d.entrypoint === "cli" ? "interactive" : "pipeline";
        s.session.kind ||= kind;
        s.session.first ||= d.timestamp; s.session.last = d.timestamp ?? s.session.last;
        add((s.session.models[m.model] ??= zero()), m.usage);
        const k = `${day}|${m.model}|${kind}|${project}`;
        add(byKey.get(k) ?? (byKey.set(k, zero()), byKey.get(k)!), m.usage);
      }
    }
    s.size = st.size;
  } finally { fs.closeSync(fd); }
}

export function refreshUsage(force = false): Promise<void> {
  if (scanning) return scanning;
  if (!force && Date.now() - lastScan < 15000) return Promise.resolve();
  scanning = (async () => {
    const t0 = Date.now();
    for (const f of walk()) { await scanFile(f); await new Promise((r) => setTimeout(r, 0)); }
    lastScan = Date.now(); scanMs = lastScan - t0;
  })().finally(() => { scanning = null; });
  return scanning;
}

export function usageReport(pipelineRows: { ws: string; step: string; model?: string; costUsd?: number; ms?: number; at?: string; inputTokens?: number; outputTokens?: number; cacheReadTokens?: number }[]) {
  const rows = [...byKey.entries()].map(([k, t]) => { const [day, model, kind, project] = k.split("|"); return { day, model, kind, project, ...t }; });
  const sessions = [...files.values()].map((f) => f.session).filter((s) => Object.keys(s.models).length)
    .map((s) => { const tot = zero(); for (const t of Object.values(s.models)) { tot.in += t.in; tot.cacheWrite += t.cacheWrite; tot.cacheRead += t.cacheRead; tot.out += t.out; tot.replies += t.replies; } return { ...s, total: tot }; })
    .sort((a, b) => String(b.last).localeCompare(String(a.last))).slice(0, 60);
  const paid = pipelineRows.filter((r) => r.costUsd || r.model);
  return { scannedAt: lastScan, scanMs, scanning: !!scanning, files: files.size, rows, sessions, pipeline: paid };
}
