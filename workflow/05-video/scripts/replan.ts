/**
 * Update the plan to a changed voice instead of planning again (free, no model).
 *
 * Usage: bun run replan --video <ID> [--auto] [--dry] [--force]
 *   --auto   quiet no-op when the plan already matches the voice (Align runs it after building captions)
 *   --dry    report what would move and which acts changed, write nothing
 *   --force  re-time even when most of the narration changed (normally: plan again instead)
 *
 * 1. Matches the words the plan was timed against (05-video/plan_captions.json) to the current captions.json.
 * 2. Moves every act and beat start/end through the unchanged words (an act boundary in rewritten text snaps to the
 *    nearest sentence end there); chapter acts stay on their chapter's pause.
 * 3. Acts whose spoken words changed get their beats' narration updated, hits/holds/silences on words that are gone
 *    removed, and are listed in 05-video/changed_acts.json with what was said before and now. Acts → "Update changed
 *    acts" (bun run act --changed) revises just those, in their author's session.
 * 4. Acts whose words did not change keep their scene file as is (it is still current: no redo).
 * acts.json is backed up (acts.<time>.prereplan.json); your plan approval is kept.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { resolveJobPaths } from "../src/lib/workspaceBridge";
import { actsToStoryboard, checkActs, findWord, type ActsPlan, type Caption, type Chapter } from "../src/lib/acts";
import { capWords, changedActsPath, currentActs, keepActsCurrent, matchWords, planCaptionsPath, snapshotPlanCaptions, spoken, timeMap } from "../src/lib/replan";
import { isShortWorkspace } from "../src/lib/format";

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const videoId = flag("--video") ?? flag("-v");
if (!videoId) { console.error("Usage: bun run replan --video <ID> [--auto] [--dry] [--force]"); process.exit(1); }
const auto = args.includes("--auto"), dry = args.includes("--dry"), force = args.includes("--force");
const paths = resolveJobPaths(videoId);
const out = paths.outputDir, wsDir = path.dirname(out);
const actsFile = path.join(out, "acts.json"), capsFile = path.join(out, "captions.json"), snap = planCaptionsPath(out);
const read = <T,>(f: string, d: T): T => { try { return JSON.parse(fs.readFileSync(f, "utf-8")); } catch { return d; } };

if (!fs.existsSync(actsFile)) { if (!auto) console.log("no plan yet: nothing to update"); process.exit(0); }
if (!fs.existsSync(capsFile)) { console.error("❌ no captions.json: run Align first"); process.exit(1); }
if (!fs.existsSync(snap)) {
  // plans made before this step existed: their captions were never recorded. Only safe to adopt when the plan is newer.
  if (fs.statSync(actsFile).mtimeMs >= fs.statSync(capsFile).mtimeMs) { snapshotPlanCaptions(out); if (!auto) console.log("recorded the captions this plan is timed against; nothing to move"); process.exit(0); }
  console.error("❌ there is no record of the captions this plan was timed against (it predates this step), so its times can't be moved safely. Re-run Plan, or approve the plan as it is.");
  process.exit(auto ? 0 : 1);
}

const oldC: Caption[] = read(snap, []), newC: Caption[] = read(capsFile, []);
const same = oldC.length === newC.length && oldC.every((c, i) => c.text === newC[i].text && c.startMs === newC[i].startMs && c.endMs === newC[i].endMs);
if (same) { if (!auto) console.log("✅ the plan already matches the voice: nothing to move"); process.exit(0); }

const raw = fs.readFileSync(actsFile, "utf-8");
const plan: ActsPlan = JSON.parse(raw);
const oldW = capWords(oldC), newW = capWords(newC);
const { oldToNew, newToOld } = matchWords(oldW, newW);
const keptWords = oldToNew.filter((j) => j >= 0).length;
const changedShare = 1 - keptWords / Math.max(oldW.length, newW.length, 1);
console.log(`🔁 ${keptWords}/${oldW.length} words unchanged (${newW.length} now), ${(changedShare * 100).toFixed(0)}% of the narration changed`);
if (changedShare > 0.5 && !force) {
  console.error("❌ more than half of the narration changed: re-run Plan instead (or --force to re-time anyway)");
  process.exit(1);
}

// chapters: old ones come from the plan itself (chapter acts start on their pause), new ones from chapters.json
const chapters: Chapter[] = read(path.join(out, "chapters.json"), []);
const chapterActs = plan.acts.filter((a) => a.chapter);
if (chapterActs.length && chapterActs.length !== chapters.length) {
  console.error(`❌ the script now has ${chapters.length} chapters, the plan ${chapterActs.length}: the structure changed, re-run Plan`);
  process.exit(1);
}

// anchors: every unchanged word's start and end; chapter pauses; the very start
const pairs: [number, number][] = [[0, 0]];
oldToNew.forEach((j, i) => { if (j >= 0) { pairs.push([oldC[i].startMs, newC[j].startMs]); pairs.push([oldC[i].endMs, newC[j].endMs]); } });
for (const a of chapterActs) { const ch = chapters.find((c) => c.n === a.chapter!.n); if (ch) pairs.push([a.startMs, ch.pauseStartMs]); }
const base = timeMap(pairs);

// a boundary inside rewritten text: move it to the nearest sentence end among the new words there
const sentenceGaps = newC.flatMap((c, j) => /[.?!]["')\]]*$/.test(c.text.trim()) && j + 1 < newC.length ? [{ j, at: Math.round((c.endMs + newC[j + 1].startMs) / 2) }] : []);
const chapterStarts = new Set(chapterActs.map((a) => a.startMs));
function mapBoundary(ms: number): number {
  const t = base(ms);
  if (chapterStarts.has(ms)) return t;
  // is the new time inside (or touching) a run of new words without an old partner?
  const k = newC.findIndex((c) => c.endMs > t);
  if (k < 0) return t;
  const near = [k - 1, k].filter((x) => x >= 0 && x < newC.length);
  if (!near.some((x) => newToOld[x] < 0)) return t;
  let lo = near[0], hi = near[near.length - 1];
  while (lo > 0 && newToOld[lo - 1] < 0) lo--;
  while (hi < newC.length - 1 && newToOld[hi + 1] < 0) hi++;
  const cands = sentenceGaps.filter((g) => g.j >= lo - 1 && g.j <= hi);
  if (!cands.length) return t;
  return cands.reduce((b, g) => (Math.abs(g.at - t) < Math.abs(b.at - t) ? g : b)).at;
}
const memo = new Map<number, number>();
const map = (ms: number) => { if (!memo.has(ms)) memo.set(ms, mapBoundary(ms)); return memo.get(ms)!; };

// which acts' words changed (old words inside the old act, new words inside the new act)
const wasCurrent = currentActs(out, plan.acts.map((a) => a.id));
const oldActs = plan.acts.map((a) => ({ ...a }));
const report: Record<string, { before: string; now: string; notes: string[] }> = {};
const lastEndOld = plan.acts[plan.acts.length - 1].endMs;
for (const a of plan.acts) {
  for (const b of a.beats) { b.startMs = map(b.startMs); b.endMs = map(b.endMs); }
  a.startMs = map(a.startMs); a.endMs = map(a.endMs);
}
// the first act starts with the narration, the last one runs to its end (plus the same tail as before)
plan.acts[0].startMs = Math.min(plan.acts[0].startMs, newC[0]?.startMs ?? 0); plan.acts[0].beats[0].startMs = plan.acts[0].startMs;
const tail = Math.max(0, lastEndOld - (oldC[oldC.length - 1]?.endMs ?? lastEndOld));
const last = plan.acts[plan.acts.length - 1];
last.endMs = (newC[newC.length - 1]?.endMs ?? last.endMs) + tail; last.beats[last.beats.length - 1].endMs = last.endMs;

const mid = (c: Caption) => (c.startMs + c.endMs) / 2;
plan.acts.forEach((a, k) => {
  const o = oldActs[k];
  const oldIdx = oldC.map((c, i) => i).filter((i) => mid(oldC[i]) >= o.startMs && mid(oldC[i]) < o.endMs);
  const newIdx = newC.map((c, j) => j).filter((j) => mid(newC[j]) >= a.startMs && mid(newC[j]) < a.endMs);
  const removed = oldIdx.filter((i) => oldToNew[i] < 0), added = newIdx.filter((j) => newToOld[j] < 0);
  // words that are unchanged but moved into another act (a boundary moved) also count
  const movedIn = newIdx.filter((j) => newToOld[j] >= 0 && !oldIdx.includes(newToOld[j]));
  const movedOut = oldIdx.filter((i) => oldToNew[i] >= 0 && !newIdx.includes(oldToNew[i]));
  if (!removed.length && !added.length && !movedIn.length && !movedOut.length) return;
  const notes: string[] = [];
  for (const b of a.beats) {
    b.vo = spoken(newC, b.startMs, b.endMs);
    const keep = (b.hits ?? []).filter((h) => findWord(newC, h.word, h.occurrence ?? 1, b.startMs, b.endMs));
    for (const h of (b.hits ?? []).filter((h) => !keep.includes(h))) notes.push(`hit on "${h.word}" (${h.what}) removed: the word is no longer spoken in that beat`);
    if (b.hits) b.hits = keep;
  }
  for (const key of ["holds", "silence"] as const) {
    const list = (a[key] ?? []) as { word: string; occurrence?: number }[];
    const keep = list.filter((h) => findWord(newC, h.word, h.occurrence ?? 1, a.startMs, a.endMs));
    for (const h of list.filter((h) => !keep.includes(h))) notes.push(`${key === "holds" ? "pause" : "silence"} after "${h.word}" removed: the word is gone`);
    if (a[key]) (a as any)[key] = keep;
  }
  // readable before/now: the changed stretches with a few words around them
  const span = (idx: number[], C: Caption[]) => {
    if (!idx.length) return "";
    const runs: number[][] = [];
    for (const i of idx) { const r = runs[runs.length - 1]; if (r && i - r[r.length - 1] <= 4) r.push(i); else runs.push([i]); }
    return runs.map((r) => C.slice(Math.max(0, r[0] - 3), r[r.length - 1] + 4).map((c) => c.text.trim()).join(" ")).join(" … ");
  };
  report[a.id] = {
    before: span([...removed, ...movedOut].sort((x, y) => x - y), oldC) || "(nothing removed)",
    now: span([...added, ...movedIn].sort((x, y) => x - y), newC) || "(nothing added)",
    notes,
  };
});

const errs = checkActs(plan, newC, chapters, { short: isShortWorkspace(wsDir) });
const moved = plan.acts.map((a, k) => ({ id: a.id, d: a.startMs - oldActs[k].startMs, len: Math.round((a.endMs - a.startMs) / 1000), was: Math.round((oldActs[k].endMs - oldActs[k].startMs) / 1000) }));
for (const m of moved) console.log(`   ${m.id} ${report[m.id] ? "✏️  narration changed" : m.d ? "↔ moved" : "  unchanged"}  start ${m.d >= 0 ? "+" : ""}${(m.d / 1000).toFixed(1)} s · ${m.was} s → ${m.len} s`);
for (const [id, r] of Object.entries(report)) {
  console.log(`\n   ${id} before: ${r.before}\n   ${id} now:    ${r.now}`);
  for (const n of r.notes) console.log(`   ${id} ⚠️  ${n}`);
}
if (errs.length) console.log(`\n⚠️  the updated plan breaks ${errs.length} plan rule(s) (it is still usable; re-plan if an act got far too long or short):\n${errs.slice(0, 8).map((e) => "   - " + e).join("\n")}`);
if (dry) { console.log("\n(dry run: nothing written)"); process.exit(0); }

fs.copyFileSync(actsFile, actsFile.replace(/\.json$/, `.${Date.now()}.prereplan.json`));
const outJson = JSON.stringify(plan, null, 2);
fs.writeFileSync(actsFile, outJson);
fs.writeFileSync(path.join(out, "storyboard.json"), JSON.stringify(actsToStoryboard(plan), null, 2));
// your approval stays (the times follow the voice you approved; changed acts are listed for you)
const approvedPath = path.join(out, "plan_approved.json");
try {
  const ap = JSON.parse(fs.readFileSync(approvedPath, "utf-8"));
  if (ap.sha256 === crypto.createHash("sha256").update(raw).digest("hex"))
    fs.writeFileSync(approvedPath, JSON.stringify({ ...ap, sha256: crypto.createHash("sha256").update(outJson).digest("hex"), replannedAt: new Date().toISOString() }, null, 2));
} catch { /* not approved */ }
// acts that were current and whose words did not change stay current
keepActsCurrent(out, wasCurrent.filter((id) => !report[id]));
// the change list accumulates until each act is updated
const prev = (() => { try { return JSON.parse(fs.readFileSync(changedActsPath(out), "utf-8")).acts ?? {}; } catch { return {}; } })();
const at = new Date().toISOString();
const merged = { ...prev };
for (const [id, r] of Object.entries(report)) merged[id] = prev[id] ? { ...r, before: prev[id].before, notes: [...prev[id].notes, ...r.notes], at } : { ...r, at };
if (Object.keys(merged).length) fs.writeFileSync(changedActsPath(out), JSON.stringify({ at, acts: merged }, null, 2));
snapshotPlanCaptions(out);
const n = Object.keys(report).length;
console.log(`\n✅ plan moved to the new voice: ${plan.acts.length - n} act(s) keep their drawing${n ? `, ${n} changed (${Object.keys(report).join(", ")}): Acts → Update changed acts` : ""}`);
