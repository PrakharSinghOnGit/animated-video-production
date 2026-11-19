/**
 * Claude plan usage (the 5-hour window) for unattended runs, without an open Claude Code session.
 *
 * Every headless `claude -p --output-format stream-json` run prints a `rate_limit_event` with the window's utilization
 * and reset time. agent.ts records the last one of every run here (free); when that reading is stale, `usageNow` asks
 * with a one-word Haiku probe (~$0.003 of plan usage). One file per Claude profile:
 *   ~/.claude/wealthgap/usage-<claude|claude-iit>.json   { pct, resetsAt (unix s), status, type, at (ms) }
 *
 * The act batch's autopilot (--wait) also learns what one act costs: the window's usage before and after each act that
 * ran alone in one window, in ~/.claude/wealthgap/act_usage.json, so it starts an act only when it is likely to finish.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CLAUDE_DIRS } from "./models";

export type ClaudeProfile = "claude" | "claude-iit";
export interface Usage {
  /** % of the 5-hour window used (0-100) */
  pct: number;
  /** when the window resets (unix seconds), or null */
  resetsAt: number | null;
  /** "allowed" | "allowed_warning" | "rejected" (Claude Code's words) */
  status: string;
  /** the window that limits: "five_hour", "seven_day", ... */
  type: string;
  /** when this was read (ms) */
  at: number;
}

const DIR = path.join(os.homedir(), ".claude", "wealthgap");
const file = (p: ClaudeProfile) => path.join(DIR, `usage-${p}.json`);
const ACT_FILE = path.join(DIR, "act_usage.json");

/** A stream-json `rate_limit_event` → Usage (null when it is something else). */
export function fromEvent(ev: any, at = Date.now()): Usage | null {
  const i = ev?.type === "rate_limit_event" ? ev.rate_limit_info : null;
  if (!i) return null;
  const five = i.unifiedWindows?.five_hour;
  const util = typeof five?.utilization === "number" ? five.utilization : typeof i.utilization === "number" ? i.utilization : null;
  const rejected = i.status === "rejected";
  if (util === null && !rejected) return null;
  return {
    pct: util === null ? 100 : Math.round(util * 1000) / 10,
    resetsAt: typeof (five?.resetsAt ?? i.resetsAt) === "number" ? (five?.resetsAt ?? i.resetsAt) : null,
    status: String(i.status ?? "allowed"),
    type: String(i.rateLimitType ?? "five_hour"),
    at,
  };
}

export function recordUsage(p: ClaudeProfile, u: Usage): void {
  try { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(file(p), JSON.stringify(u)); } catch {}
}

/** The last reading, with a window that has reset since counted as empty. */
export function lastUsage(p: ClaudeProfile): Usage | null {
  try {
    const u = JSON.parse(fs.readFileSync(file(p), "utf-8")) as Usage;
    if (u.resetsAt && u.resetsAt * 1000 <= Date.now()) return { ...u, pct: 0, status: "allowed", resetsAt: null };
    return u;
  } catch { return null; }
}

/** Ask Claude Code itself: a one-word Haiku run whose stream carries the rate-limit event. */
export async function probeUsage(p: ClaudeProfile): Promise<Usage | null> {
  const proc = Bun.spawn(["claude", "-p", "--model", "haiku", "--output-format", "stream-json", "--verbose", "--max-turns", "1"], {
    stdin: new TextEncoder().encode("Reply with the single word ok."), stdout: "pipe", stderr: "ignore",
    env: { ...process.env, ...(p === "claude-iit" ? { CLAUDE_CONFIG_DIR: CLAUDE_DIRS["claude-iit"] } : {}) },
  });
  const timer = setTimeout(() => proc.kill(), 90_000);
  const out = await new Response(proc.stdout).text();
  clearTimeout(timer);
  let u: Usage | null = null;
  for (const line of out.split("\n")) {
    try { u = fromEvent(JSON.parse(line)) ?? u; } catch {}
  }
  // a refused probe still says so in its result: "You've hit your 5-hour limit · resets 3am"
  if (!u && /hit your [^"]*limit/i.test(out)) u = { pct: 100, resetsAt: null, status: "rejected", type: "five_hour", at: Date.now() };
  if (u) recordUsage(p, u);
  return u;
}

/** The current usage: the last reading if it is younger than `maxAgeMs`, else a probe. */
export async function usageNow(p: ClaudeProfile, maxAgeMs = 3 * 60_000): Promise<Usage | null> {
  const u = lastUsage(p);
  if (u && Date.now() - u.at < maxAgeMs) return u;
  return (await probeUsage(p)) ?? u;
}

// ───────────── what one act costs ─────────────

interface ActSample { profile: ClaudeProfile; model: string; pct: number; at: number }
/** Before any act was measured: a cautious guess (an Opus act measured ~15-25% of a Max 5-hour window). */
export const DEFAULT_ACT_PCT = 22;

export function recordActUsage(profile: ClaudeProfile, model: string, pct: number): void {
  if (!(pct > 0 && pct < 100)) return;
  let all: ActSample[] = [];
  try { all = JSON.parse(fs.readFileSync(ACT_FILE, "utf-8")); } catch {}
  all.push({ profile, model, pct: Math.round(pct * 10) / 10, at: Date.now() });
  try { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(ACT_FILE, JSON.stringify(all.slice(-60), null, 1)); } catch {}
}

/** % of the window one act is expected to use: a high percentile of the last measurements for this model (so most acts
 *  fit), or DEFAULT_ACT_PCT. `n` = how many measurements it rests on. */
export function actEstimate(profile: ClaudeProfile, model: string): { pct: number; n: number } {
  let all: ActSample[] = [];
  try { all = JSON.parse(fs.readFileSync(ACT_FILE, "utf-8")); } catch {}
  const mine = all.filter((s) => s.profile === profile && s.model === model).slice(-12).map((s) => s.pct).sort((a, b) => a - b);
  if (!mine.length) return { pct: DEFAULT_ACT_PCT, n: 0 };
  // 75th percentile: an act that runs long still fits; with few samples lean on the largest
  const q = mine[Math.min(mine.length - 1, Math.ceil(mine.length * 0.75) - 1)];
  return { pct: mine.length < 3 ? Math.max(q, DEFAULT_ACT_PCT * 0.8) : q, n: mine.length };
}

/** "3:10 am" in local time, for messages. */
export const clock = (unixS: number) => new Date(unixS * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
