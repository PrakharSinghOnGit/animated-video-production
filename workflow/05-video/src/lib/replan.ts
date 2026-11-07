/**
 * Keeping a plan in step with a changed voice, without planning again.
 *
 * The plan's times (act and beat start/end) are absolute ms on the narration it was made from. When the voice changes
 * (a script line rewritten and re-voiced, speed or gaps changed), every later time moves. This module:
 * - keeps a copy of the captions the plan was made from (05-video/plan_captions.json);
 * - matches those words to the new captions (longest common subsequence on normalised words), so every unchanged word
 *   is an anchor old ms → new ms, and maps any plan time through the anchors;
 * - tells which acts' narration actually changed (05-video/changed_acts.json), so only those are re-authored.
 * Acts time their hits from spoken words (ctx.word), so an act whose words are unchanged still fits after the move.
 */
import fs from "node:fs";
import path from "node:path";
import { normWord, type Caption } from "./acts";
import { planChanged, recordPlanHash, sceneFileFor } from "./scenes";

export const planCaptionsPath = (outputDir: string) => path.join(outputDir, "plan_captions.json");
export const changedActsPath = (outputDir: string) => path.join(outputDir, "changed_acts.json");

/** Record the captions the current plan is timed against (after planning, or after its times were moved). */
export function snapshotPlanCaptions(outputDir: string): void {
  const c = path.join(outputDir, "captions.json");
  if (fs.existsSync(c)) fs.copyFileSync(c, planCaptionsPath(outputDir));
}

/** Acts whose scene file is current with the plan right now (call before changing acts.json). */
export function currentActs(outputDir: string, ids: string[]): string[] {
  const scenes = path.join(outputDir, "src", "scenes");
  return ids.filter((id) => { const f = sceneFileFor(scenes, id); return !!f && !planChanged(outputDir, id, path.join(scenes, f)); });
}

/** After a times-only change to acts.json: the acts that were current stay current (no redo for a moved act). */
export function keepActsCurrent(outputDir: string, ids: string[]): void {
  for (const id of ids) recordPlanHash(outputDir, id, true);
}

export type Match = { oldToNew: Int32Array; newToOld: Int32Array };

/** Longest common subsequence of two word lists (common prefix/suffix trimmed first). -1 = no partner. */
export function matchWords(a: string[], b: string[]): Match {
  const oldToNew = new Int32Array(a.length).fill(-1), newToOld = new Int32Array(b.length).fill(-1);
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) { oldToNew[s] = s; newToOld[s] = s; s++; }
  let ea = a.length, eb = b.length;
  while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) { ea--; eb--; oldToNew[ea] = eb; newToOld[eb] = ea; }
  const n = ea - s, m = eb - s;
  if (n && m) {
    const W = m + 1, L = new Uint32Array((n + 1) * W);
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
      L[i * W + j] = a[s + i] === b[s + j] ? L[(i + 1) * W + j + 1] + 1 : Math.max(L[(i + 1) * W + j], L[i * W + j + 1]);
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (a[s + i] === b[s + j]) { oldToNew[s + i] = s + j; newToOld[s + j] = s + i; i++; j++; }
      else if (L[(i + 1) * W + j] >= L[i * W + j + 1]) i++;
      else j++;
    }
  }
  return { oldToNew, newToOld };
}

/** A monotonic map old ms → new ms through anchor pairs (linear between anchors, a constant shift past the ends). */
export function timeMap(pairs: [number, number][]): (ms: number) => number {
  const sorted = pairs.slice().sort((x, y) => x[0] - y[0]);
  const P: [number, number][] = [];
  for (const p of sorted) {
    const last = P[P.length - 1];
    if (last && p[0] === last[0]) continue;
    if (last && p[1] < last[1]) continue;      // keep it monotonic
    P.push(p);
  }
  return (ms: number) => {
    if (!P.length) return ms;
    if (ms <= P[0][0]) return Math.round(ms + P[0][1] - P[0][0]);
    const L = P[P.length - 1];
    if (ms >= L[0]) return Math.round(ms + L[1] - L[0]);
    let lo = 0, hi = P.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (P[mid][0] <= ms) lo = mid; else hi = mid; }
    const [x0, y0] = P[lo], [x1, y1] = P[hi];
    return Math.round(y0 + ((ms - x0) / (x1 - x0)) * (y1 - y0));
  };
}

export const capWords = (c: Caption[]) => c.map((w) => normWord(w.text));
export const spoken = (c: Caption[], from: number, to: number) =>
  c.filter((w) => (w.startMs + w.endMs) / 2 >= from && (w.startMs + w.endMs) / 2 < to).map((w) => w.text.trim()).join(" ");
