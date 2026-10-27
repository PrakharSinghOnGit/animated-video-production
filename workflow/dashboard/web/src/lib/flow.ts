import type { Details, Run, Timing } from "./types";

/** Dashboard runs (dashboard_runs.json, newest last) for one job label such as "Write script" or "Author A01". */
export const runsFor = (d: Details, label: string): Run[] => d.runs.filter((r) => r.label === label);
export const lastRun = (d: Details, label: string): Run | null => runsFor(d, label).at(-1) ?? null;
/** How many times a step actually ran (finished runs plus one that is running now): used to light a loop-back arrow. */
export const ranCount = (d: Details, labels: string[]): number => labels.reduce((n, l) => n + runsFor(d, l).length + (d.jobs.some((j) => j.label === l && j.status === "running") ? 1 : 0), 0);

/** Cost and time the pipeline recorded (timings.json) for rows whose step matches. */
export function costOf(d: Details, re: RegExp | null): { ms: number; cost: number; at?: string; n: number } | null {
  if (!re) return null;
  const rows: Timing[] = d.timings.filter((t) => re.test(t.step));
  if (!rows.length) return null;
  return { ms: rows.reduce((a, r) => a + (r.ms ?? 0), 0), cost: rows.reduce((a, r) => a + (r.costUsd ?? 0), 0), at: rows.at(-1)?.at, n: rows.length };
}

export type BlockStatus = "done" | "running" | "failed" | "todo";
