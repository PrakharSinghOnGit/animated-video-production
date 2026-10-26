/**
 * Per-video log of how long each pipeline step took and what it cost.
 * Stored at workspace/<ID>/timings.json; `bun run timings --video <ID>` prints it.
 */
import fs from "node:fs";
import path from "node:path";

export interface TimingEntry {
  step: string;
  at: string;
  ms: number;
  model?: string;
  costUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  note?: string;
}

export function timingsPath(workspaceDir: string): string {
  return path.join(workspaceDir, "timings.json");
}

export function readTimings(workspaceDir: string): TimingEntry[] {
  try {
    return JSON.parse(fs.readFileSync(timingsPath(workspaceDir), "utf-8"));
  } catch {
    return [];
  }
}

export function recordTiming(workspaceDir: string, entry: Omit<TimingEntry, "at">): void {
  const all = readTimings(workspaceDir);
  all.push({ ...entry, at: new Date().toISOString() });
  fs.writeFileSync(timingsPath(workspaceDir), JSON.stringify(all, null, 2), "utf-8");
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** Run fn, record its wall time under `step`, and print it. */
export async function timed<T>(workspaceDir: string, step: string, fn: () => T | Promise<T>, note?: string): Promise<T> {
  const t0 = Date.now();
  const out = await fn();
  const ms = Date.now() - t0;
  recordTiming(workspaceDir, { step, ms, note });
  console.log(`⏱  ${step}: ${formatDuration(ms)}`);
  return out;
}
