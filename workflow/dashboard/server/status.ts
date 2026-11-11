/** Step status derived from files on disk plus dashboard.log: nothing is stored, so it survives restarts and hand edits. */
import fs from "node:fs";
import path from "node:path";
import * as pub from "../../07-publish/lib";
import * as sh from "../../08-shorts/lib";
import { actIds, exists, ls, mtime, readJson, readText, wsDir } from "./core";
import { runningJobs } from "./jobs";

// ───────────────────────────── status from disk ─────────────────────────────

export type St = "none" | "done" | "stale" | "partial" | "running" | "failed";

/** none: no outputs. partial: some outputs. stale: an input is newer than an output. */
export function derive(ws: string, inputs: string[], outputs: string[], extraInputMs = 0): St {
  const d = wsDir(ws);
  const outs = outputs.map((o) => mtime(path.join(d, o)));
  const have = outs.filter(Boolean);
  if (!have.length) return "none";
  if (have.length < outs.length) return "partial";
  const newestIn = Math.max(extraInputMs, ...inputs.map((i) => mtime(path.join(d, i))));
  return Math.min(...outs) + 1000 < newestIn ? "stale" : "done";
}

/** Last recorded run per step key from dashboard.log (survives restarts). Cached by size+mtime. */
export const logCache = new Map<string, { size: number; mtime: number; last: Record<string, { exit: string; end: number; job: string }> }>();
export function lastRuns(ws: string) {
  const p = path.join(wsDir(ws), "dashboard.log");
  let st: fs.Stats;
  try { st = fs.statSync(p); } catch { return {}; }
  const c = logCache.get(ws);
  if (c && c.size === st.size && c.mtime === st.mtimeMs) return c.last;
  const last: Record<string, { exit: string; end: number; job: string }> = {};
  const started: Record<string, string> = {};
  const text = fs.readFileSync(p, "utf-8");
  for (const m of text.matchAll(/^(▶▶|◀◀) \[(\w+)\] step=(\S+) (?:start (\S+)|exit=(\S+) end (\S+))/gm)) {
    const [, kind, job, step, , exit, end] = m;
    if (kind === "▶▶") { started[job] = step; last[step] = { exit: "interrupted", end: 0, job }; }
    else last[step] = { exit, end: Date.parse(end), job };
  }
  logCache.set(ws, { size: st.size, mtime: st.mtimeMs, last });
  return last;
}

/** Act ID → its scene file: the plan's `<id>_<slug>.tsx` when there, else any file with the ID. */
export function sceneFiles(ws: string): Record<string, string> {
  const out: Record<string, string> = {};
  const slugs = new Map<string, string>(((readJson<any>(path.join(wsDir(ws), "05-video/acts.json"))?.acts ?? []) as any[]).map((a) => [a.id, a.slug]));
  for (const f of ls(path.join(wsDir(ws), "05-video/src/scenes"), /^A\d+_.*\.tsx$/)) {
    const id = f.split("_")[0];
    if (!out[id] || f === `${id}_${slugs.get(id)}.tsx`) out[id] = `05-video/src/scenes/${f}`;
  }
  return out;
}

/** Hash of one act's own entry in acts.json (so editing another act's plan does not make this one stale). */
export const planHash = (ws: string, id: string): string => {
  const a = (readJson<any>(path.join(wsDir(ws), "05-video/acts.json"))?.acts ?? []).find((x: any) => x.id === id);
  return new Bun.CryptoHasher("sha256").update(JSON.stringify(a ?? null)).digest("hex");
};
export const planHashPath = (ws: string, id: string) => path.join(wsDir(ws), `05-video/review/${id}/plan.hash`);
/**
 * Stale = this act's plan entry changed since its scene was written (same rule as planChanged in
 * 05-video/src/lib/scenes.ts, which the act author uses). A recorded hash counts when it was written with or after the
 * scene and not after a plan change the scene predates; otherwise stale = acts.json is newer than the scene. A missing
 * hash is recorded only for a scene newer than the plan, so an old act is never stamped with a new plan.
 */
export function actStale(ws: string, id: string, sceneMs: number): boolean {
  const f = planHashPath(ws, id), cur = planHash(ws, id), plan = mtime(path.join(wsDir(ws), "05-video/acts.json")), h = exists(f) ? mtime(f) : 0;
  const [hash, mark] = h ? readText(f).trim().split("\n") : [""];
  // "kept": replan / a pause shift moved only this act's times and re-stamped it (05-video/src/lib/scenes.ts)
  if (h >= sceneMs && (mark === "kept" || !(sceneMs < plan && plan < h))) return hash.trim() !== cur;
  if (plan > sceneMs) return true;
  try { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, cur); } catch {}
  return false;
}
/** Your approval of the plan; valid while acts.json is the file you approved. */
export function planApproval(ws: string): { at: string; valid: boolean } | null {
  const a = readJson<any>(path.join(wsDir(ws), "05-video/plan_approved.json")), f = path.join(wsDir(ws), "05-video/acts.json");
  if (!a || !exists(f)) return null;
  return { at: a.at, valid: a.sha256 === new Bun.CryptoHasher("sha256").update(fs.readFileSync(f)).digest("hex") };
}
export const approvalPath = (ws: string, id: string) => path.join(wsDir(ws), `05-video/review/${id}/approved.json`);
/** Explicit human approval; valid only while the scene is the one that was approved. */
export function actApproval(ws: string, id: string, sceneMs: number): { at: string; sceneMtime: number } | null {
  const a = readJson<any>(approvalPath(ws, id));
  return a && sceneMs && a.sceneMtime === sceneMs ? { at: a.at, sceneMtime: a.sceneMtime } : null;
}
/** Status of one act's scene file against the plan (approval overrides stale). */
export function sceneStatus(ws: string, id: string, rel: string | undefined): St {
  if (!rel) return "none";
  const ms = mtime(path.join(wsDir(ws), rel));
  return actStale(ws, id, ms) && !actApproval(ws, id, ms) ? "stale" : "done";
}

export function overlay(ws: string, key: string, st: St, outputs: string[]): St {
  if (runningJobs(ws).some((run) => run.step === key || run.step.startsWith(key + ":"))) return "running";
  const last = lastRuns(ws)[key];
  if (last && last.exit !== "0") {
    const newestOut = Math.max(0, ...outputs.map((o) => mtime(path.join(wsDir(ws), o))));
    if (last.exit === "interrupted" || last.end > newestOut) return "failed";
  }
  return st;
}

/** draft / final file against the mix, timeline and scenes (current = nothing newer than the file). */
export function renderStates(ws: string): { draft: St; final: St } {
  const sceneMax = Math.max(0, ...Object.values(sceneFiles(ws)).map((r) => mtime(path.join(wsDir(ws), r))));
  const ins = ["06-audio/mix.wav", "05-video/timeline.json"];
  return { draft: derive(ws, ins, ["05-video/draft.mp4"], sceneMax), final: derive(ws, ins, ["05-video/final.mp4"], sceneMax) };
}

// ── publish: titles + thumbnails (workspace/<ID>/07-publish) ──

export const PUB_FILES = (ws: string) => pub.VARIANTS.map((v) => pub.thumbPath(ws, v));
export const approvalFile = (ws: string) => pub.pubFile(ws, "approval.json");
export const hashCache = new Map<string, { stamp: string; hash: string }>();
/** sha256 over the three thumbnails and the metadata fields a viewer sees: what an approval stands for. Cached by file times. */
export function publishHash(ws: string): string {
  const files = [...PUB_FILES(ws), pub.pubFile(ws, "metadata.json")];
  const stamp = files.map((p) => (p ? `${p}:${mtime(p)}` : "none")).join("|");
  const c = hashCache.get(ws);
  if (c?.stamp === stamp) return c.hash;
  const h = new Bun.CryptoHasher("sha256");
  for (const p of PUB_FILES(ws)) h.update(p ? fs.readFileSync(p) : "none");
  const m = readJson<any>(pub.pubFile(ws, "metadata.json"));
  h.update(JSON.stringify({ t: m?.titles && pub.VARIANTS.map((v) => m.titles[v]?.title), d: m?.description, g: m?.tags, h: m?.hashtags }));
  const hash = h.digest("hex");
  hashCache.set(ws, { stamp, hash });
  return hash;
}
/** The human approval of the packages; valid only while the thumbnails and the metadata are the ones approved. */
export function publishApproval(ws: string): { at: string; valid: boolean } | null {
  const a = readJson<any>(approvalFile(ws));
  return a?.hash ? { at: a.at, valid: a.hash === publishHash(ws) } : null;
}
/** Why the step's outputs are out of date (empty = current): a thumbnail older than its source, metadata older than the script, an approval that no longer matches. */
export function publishStaleReasons(ws: string): string[] {
  const out: string[] = [];
  for (const v of pub.VARIANTS) {
    const p = pub.thumbPath(ws, v), src = pub.pubFile(ws, `remotion/thumbs/${v}.tsx`);
    if (p && mtime(src) > mtime(p) + 1000) out.push(`${v}: the thumbnail file changed after its render`);
  }
  const meta = pub.pubFile(ws, "metadata.json");
  if (exists(meta) && mtime(path.join(wsDir(ws), "02-scripting/script_raw.md")) > mtime(meta) + 1000) out.push("the script changed after the titles and description were written");
  const ap = publishApproval(ws);
  if (ap && !ap.valid) out.push("the thumbnails or the metadata changed after you approved them");
  return out;
}
export function publishStatus(ws: string): St {
  const thumbs = PUB_FILES(ws);
  const outs = ["07-publish/metadata.json", ...pub.VARIANTS.map((v, i) => (thumbs[i] ? path.relative(wsDir(ws), thumbs[i]!) : `07-publish/thumbnails/${v}.png`)), "07-publish/preview.png"];
  const have = outs.filter((o) => exists(path.join(wsDir(ws), o)));
  let st: St = !have.length ? "none" : have.length < outs.length ? "partial" : "done";
  if (st === "done") {
    if (publishStaleReasons(ws).length) st = "stale";
    else if (!publishApproval(ws)?.valid) st = "partial";   // complete but waiting for your approval, like an unapproved script
  }
  return overlay(ws, "publish", st, outs);
}

/** none: no shorts. done: every short exported. partial: some. running/failed from the shorts jobs (step key "shorts"). */
export function shortsStatus(ws: string): St {
  const ids = sh.listShorts(ws);
  let st: St = "none";
  if (ids.length) {
    const ex = ids.filter((id) => sh.shortProgress(ws, id).exported).length;
    st = ex === ids.length ? "done" : "partial";
  }
  return overlay(ws, "shorts", st, ids.map((id) => `shorts/${id}/05-video/final.mp4`));
}

export function stepStatuses(ws: string): Record<string, St> {
  const S = (key: string, inputs: string[], outputs: string[], extra = 0) => overlay(ws, key, derive(ws, inputs, outputs, extra), outputs);
  const scenes = sceneFiles(ws);
  const ids = actIds(ws);
  const sceneMax = Math.max(0, ...Object.values(scenes).map((r) => mtime(path.join(wsDir(ws), r))));
  let acts: St = "none";
  if (ids.length) {
    const have = ids.filter((i) => scenes[i]);
    acts = have.length === 0 ? "none" : have.length < ids.length ? "partial" : have.some((i) => sceneStatus(ws, i, scenes[i]) === "stale") ? "stale" : "done";
  }
  if (runningJobs(ws).some((run) => /^(acts|act:|fix:|frames:|preview:|review:)/.test(run.step))) acts = "running";
  const render = (() => {
    const { draft, final: fin } = renderStates(ws);
    const st: St = fin !== "none" ? fin : draft;
    return overlay(ws, "render", st, ["05-video/draft.mp4", "05-video/final.mp4", "05-video/review/qc-report.md"]);
  })();
  return {
    script: exists(path.join(wsDir(ws), "02-scripting/script_raw.md"))
      ? (["not approved", "changed since approval"].includes(approvalState(ws)) ? overlay(ws, "script", "partial", []) : S("script", ["02-scripting/script_raw.md"], ["03-voiceover/sections/index.ts"]))
      : exists(path.join(wsDir(ws), "02-scripting/idea.md")) ? overlay(ws, "script", "partial", []) : "none",
    voice: S("voice", ["03-voiceover/sections/index.ts"], ["03-voiceover/audio/voice.json"]),
    align: S("align", ["03-voiceover/audio/voice.json"], ["03-voiceover/audio/combined/full_voiceover.wav", "04-transcription/full_transcript.json", "06-audio/voiceover_master.wav", "05-video/captions.json"]),
    plan: planApproval(ws)?.valid ? overlay(ws, "plan", "done", ["05-video/acts.json"]) : S("plan", ["05-video/captions.json"], ["05-video/acts.json"]),
    acts,
    sound: S("sound", ["06-audio/voiceover_master.wav"], ["05-video/events.json", "06-audio/music_plan.json", "06-audio/music.wav", "06-audio/mix.wav"], sceneMax),
    render,
    publish: publishStatus(ws),
    shorts: shortsStatus(ws),
    timings: S("timings", [], ["timings.json"]),
  };
}

/** Same rule as write_script.ts / format_sections.ts: approved = approved.json holds the sha256 of the current script. */
export function approvalState(ws: string): string {
  const d = wsDir(ws), f = path.join(d, "02-scripting/script_raw.md"), a = readJson<any>(path.join(d, "02-scripting/approved.json"));
  if (!exists(f)) return "no script";
  if (!a) return exists(path.join(d, "02-scripting/idea.md")) ? "not approved" : "legacy";
  return a.sha256 === new Bun.CryptoHasher("sha256").update(fs.readFileSync(f)).digest("hex") ? "approved" : "changed since approval";
}
