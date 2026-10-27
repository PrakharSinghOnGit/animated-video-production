import { lastRun, ranCount } from "@/lib/flow";
import type { Details } from "@/lib/types";

/** Shared helpers for step pages. */
export const ok = (d: Details, label: string) => lastRun(d, label)?.status === "done";
/** Re-runs of a step = runs beyond the first: that is what a loop-back arrow means. */
export const reruns = (d: Details, ...labels: string[]) => Math.max(0, ranCount(d, labels) - 1);
