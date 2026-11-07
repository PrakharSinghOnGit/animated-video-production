#!/usr/bin/env bun
/**
 * Pauses for the picture ("holds"): extra silence in the voice where an act needs time to show something.
 *
 *   bun run voice:holds --video <ID> --scan         find every place a pause can go (phrase ends / joining words, truly
 *                                                   silent in the take) -> 03-voiceover/audio/hold_points.json
 *   bun run voice:holds --video <ID> --import       collect requests from the plan (acts[].holds) and from act authors
 *                                                   (05-video/review/<ACT>/holds.json) into 03-voiceover/holds.json, each
 *                                                   moved to the nearest clean pause point (or refused)
 *   bun run voice:holds --video <ID> --shift-plan   after Align re-ran with new holds: move the plan's times (act and beat
 *                                                   start/end) by the pauses added or removed, keeping your approval
 *   bun run voice:holds --video <ID> --list
 *
 * Request shape (plan act or author file): {"word": "orders", "occurrence": 1, "ms": 1200, "why": "the order flood needs time"}
 * = pause after the nth "orders" spoken in that act. Holds themselves are applied by tts:post (Align → Merge).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { resolveWorkspace } from "./src/workspace";
import {
  readHolds, writeHolds, readJson, holdsPy, pointsPath, retimePath, wordsPath, toBase, fromBase, MAX_HOLD_MS,
  type Hold, type PointsFile, type Point,
} from "./src/holdlib";
import { snapshotPlanCaptions, currentActs, keepActsCurrent } from "../05-video/src/lib/replan";

const argv = process.argv.slice(2);
const flag = (n: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const video = flag("--video");
if (!video) { console.error("Usage: bun run voice:holds --video <ID> --scan | --import | --shift-plan | --list"); process.exit(1); }
const ws = resolveWorkspace(video), root = ws.rootDir;
const audio = ws.audioDir;

/** Voice section files in order: [{id, wav}] (part-N/NN_id.wav). */
function sectionFiles(): { id: string; wav: string }[] {
  const parts = fs.existsSync(audio) ? fs.readdirSync(audio).filter((d) => /^part-\d+$/.test(d)).sort((a, b) => parseInt(a.slice(5)) - parseInt(b.slice(5))) : [];
  return parts.flatMap((p) => fs.readdirSync(path.join(audio, p)).filter((f) => f.endsWith(".wav")).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((f) => ({ id: f.replace(/\.wav$/, ""), wav: path.join(audio, p, f) })));
}

function scan() {
  const jobs = sectionFiles().filter((s) => fs.existsSync(wordsPath(root, s.id))).map((s) => ({ ...s, words: wordsPath(root, s.id) }));
  if (!jobs.length) { console.error("❌ no transcribed sections: run Align (transcribe) first"); process.exit(1); }
  const tmp = path.join(audio, ".scan_jobs.json");
  fs.writeFileSync(tmp, JSON.stringify(jobs));
  const sections = holdsPy(["scan", "--batch", tmp]);
  fs.rmSync(tmp, { force: true });
  const out: PointsFile = { at: new Date().toISOString(), sections };
  fs.writeFileSync(pointsPath(root), JSON.stringify(out));
  const all = Object.values(sections).flatMap((s: any) => s.points ?? []) as Point[];
  console.log(`🔎 ${jobs.length} sections: ${all.filter((p) => p.clean).length} clean pause points inside sections (+ ${jobs.length - 1} section ends); ${all.filter((p) => !p.clean).length} phrase ends with breath or sound at the cut (not usable)`);
}

interface Req { word: string; occurrence?: number; ms: number; why?: string }

/** Caption index -> (section, word index), from the per-section transcripts in voice order. */
function captionMap(): { section: string; idx: number; word: string; startMs: number; endMs: number }[] {
  const out: { section: string; idx: number; word: string; startMs: number; endMs: number }[] = [];
  let off = 0;
  for (const s of sectionFiles()) {
    const w = readJson<any>(wordsPath(root, s.id), null);
    if (!w) continue;
    (w.words as any[]).forEach((x, i) => out.push({ section: s.id, idx: i, word: x.word, startMs: Math.round((off + x.start) * 1000), endMs: Math.round((off + x.end) * 1000) }));
    off += w.duration;
  }
  return out;
}
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function importRequests() {
  const plan = readJson<any>(path.join(root, "05-video/acts.json"), null);
  if (!plan) { console.error("❌ no plan (05-video/acts.json)"); process.exit(1); }
  const pts = readJson<PointsFile | null>(pointsPath(root), null);
  if (!pts) { console.error("❌ no pause points yet: run --scan first"); process.exit(1); }
  const cmap = captionMap(), file = readHolds(root);
  const sectionsInOrder = sectionFiles().map((s) => s.id);
  let added = 0, updated = 0, refused = 0;
  for (const act of plan.acts ?? []) {
    const sources: [string, Req[]][] = [["director", act.holds ?? []]];
    const af = path.join(root, "05-video/review", act.id, "holds.json");
    if (fs.existsSync(af)) sources.push([`author ${act.id}`, readJson<any>(af, []).holds ?? readJson<any>(af, [])]);
    for (const [by, reqs] of sources) for (const r of reqs as Req[]) {
      if (!r?.word || !(r.ms > 0)) continue;
      const ms = Math.min(MAX_HOLD_MS, Math.round(r.ms)), occ = r.occurrence ?? 1;
      const key = `${by}|${act.id}|${norm(r.word)}|${occ}`;
      // the nth spoken r.word inside the act
      let n = 0;
      const hit = cmap.find((c) => { const mid = (c.startMs + c.endMs) / 2; return mid >= act.startMs - 400 && mid <= act.endMs + 400 && norm(c.word) === norm(r.word) && ++n === occ; });
      const base: Omit<Hold, "section" | "after" | "word"> = { id: crypto.randomUUID().slice(0, 8), ms, on: true, by, why: r.why, act: act.id, key };
      let place: { section: string; after: number | "end"; word: string; next?: string; note?: string } | null = null;
      if (hit) {
        const sec = pts.sections[hit.section];
        const words = cmap.filter((c) => c.section === hit.section);
        const isLast = hit.idx === words.length - 1;
        const exact = sec?.points.find((p) => p.after === hit.idx && p.clean);
        if (exact) place = { section: hit.section, after: hit.idx, word: exact.word, next: exact.next };
        else if (isLast && sectionsInOrder.indexOf(hit.section) < sectionsInOrder.length - 1) place = { section: hit.section, after: "end", word: words[hit.idx].word };
        else {
          // nearest clean point after the word (within ~2.5 s), else the end of its section, else the closest before (~1.5 s)
          const t = hit.endMs / 1000 - (cmap.find((c) => c.section === hit.section)!.startMs / 1000);
          const later = sec?.points.filter((p) => p.clean && p.after > hit.idx && p.t0 - t <= 2.5).sort((a, b) => a.after - b.after)[0];
          const earlier = sec?.points.filter((p) => p.clean && p.after < hit.idx && t - p.t0 <= 1.5).sort((a, b) => b.after - a.after)[0];
          const endOk = sectionsInOrder.indexOf(hit.section) < sectionsInOrder.length - 1 && (words[words.length - 1].endMs - hit.endMs) / 1000 <= 2.5;
          const p = later ?? (endOk ? null : earlier);
          if (p) place = { section: hit.section, after: p.after, word: p.word, next: p.next, note: `moved from after “${r.word}” to the nearest clean pause (after “${p.word}”)` };
          else if (endOk) place = { section: hit.section, after: "end", word: words[words.length - 1].word, note: `moved from after “${r.word}” to the end of its sentence group` };
          else if (earlier) place = { section: hit.section, after: earlier.after, word: earlier.word, next: earlier.next, note: `moved from after “${r.word}” to the nearest clean pause (after “${earlier.word}”)` };
        }
      }
      const old = file.holds.find((h) => h.key === key);
      if (!place) {
        refused++;
        console.log(`  ✗ ${by} ${act.id}: after “${r.word}” (${occ}): ${hit ? "no clean pause point near it (it sits mid-phrase or on a breath)" : "word not spoken in this act"}`);
        continue;
      }
      if (old) { Object.assign(old, { ...place, why: r.why ?? old.why }); updated++; }   // keep your on/off and length
      else { file.holds.push({ ...base, ...place }); added++; }
    }
  }
  writeHolds(root, file);
  console.log(`📥 requests: ${added} new, ${updated} updated, ${refused} refused · ${file.holds.length} pauses in 03-voiceover/holds.json (${file.holds.filter((h) => h.on).length} on)`);
}

function shiftPlan() {
  const rt = readJson<any>(retimePath(root), null);
  const planPath = path.join(root, "05-video/acts.json");
  if (!rt || !fs.existsSync(planPath)) { console.log("nothing to shift (no retime record or no plan)"); return; }
  if (rt.shifted) { console.log("plan already matches the last merge"); return; }
  if (!rt.changed) { console.log("pauses unchanged: plan times stay"); rt.shifted = true; fs.writeFileSync(retimePath(root), JSON.stringify(rt, null, 2)); return; }
  if (!rt.baseSame) { console.log("ℹ️  the voice itself changed (speed, gaps or regenerated sections), not only the pauses: replan moves the plan by its words instead"); return; }
  const raw = fs.readFileSync(planPath, "utf-8"), plan = JSON.parse(raw);
  const approvedPath = path.join(root, "05-video/plan_approved.json");
  const wasApproved = (() => { try { return JSON.parse(fs.readFileSync(approvedPath, "utf-8")).sha256 === crypto.createHash("sha256").update(raw).digest("hex"); } catch { return false; } })();
  const map = (ms: number) => Math.round(fromBase(toBase(ms / 1000, rt.old), rt.new) * 1000);
  let n = 0;
  const walk = (o: any) => {
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (!o || typeof o !== "object") return;
    for (const k of Object.keys(o)) {
      if ((k === "startMs" || k === "endMs") && typeof o[k] === "number") { const v = map(o[k]); if (v !== o[k]) n++; o[k] = v; }
      else walk(o[k]);
    }
  };
  walk(plan.acts);
  // the last act always runs to the end of the (longer or shorter) voice
  const delta = rt.new.reduce((s: number, h: any) => s + h.ms, 0) - rt.old.reduce((s: number, h: any) => s + h.ms, 0);
  const current = currentActs(path.join(root, "05-video"), plan.acts.map((a: any) => a.id));
  fs.copyFileSync(planPath, planPath.replace(/\.json$/, `.${Date.now()}.preshift.json`));
  const out = JSON.stringify(plan, null, 2);
  fs.writeFileSync(planPath, out);
  if (wasApproved) fs.writeFileSync(approvedPath, JSON.stringify({ ...JSON.parse(fs.readFileSync(approvedPath, "utf-8")), sha256: crypto.createHash("sha256").update(out).digest("hex"), shiftedAt: new Date().toISOString() }, null, 2));
  // moved acts are not changed acts: they keep their drawing; and the plan is now timed against these captions
  keepActsCurrent(path.join(root, "05-video"), current);
  snapshotPlanCaptions(path.join(root, "05-video"));
  rt.shifted = true; fs.writeFileSync(retimePath(root), JSON.stringify(rt, null, 2));
  console.log(`🧭 plan moved to the new pauses: ${n} times shifted, voice ${delta >= 0 ? "+" : ""}${(delta / 1000).toFixed(1)} s${wasApproved ? " (your approval kept)" : ""}. Acts use word-relative times, so their code still fits; render their frames again to see the extra room.`);
}

function list() {
  const f = readHolds(root), pts = readJson<PointsFile | null>(pointsPath(root), null);
  for (const h of f.holds) console.log(`${h.on ? "●" : "○"} ${h.section} after ${h.after === "end" ? "the section" : `“${h.word}”`} +${h.ms} ms · ${h.by}${h.act ? ` ${h.act}` : ""}${h.why ? ` · ${h.why}` : ""}`);
  if (pts) console.log(`${Object.values(pts.sections).reduce((s: number, x: any) => s + (x.points ?? []).filter((p: Point) => p.clean).length, 0)} clean pause points (scan ${pts.at})`);
}

if (argv.includes("--scan")) scan();
else if (argv.includes("--import")) importRequests();
else if (argv.includes("--shift-plan")) shiftPlan();
else list();
