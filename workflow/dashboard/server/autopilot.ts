/**
 * Autopilot: moves a video along by itself, from the idea to the downloads, doing each step the way you picked:
 *
 *   research → script → voice → align → plan → acts → act review → sound → draft → final → publish → short scripts → shorts → downloads
 *
 * Every step has a mode:
 *   auto   = run it and go on (where a later step needs an approval, e.g. the script, autopilot approves it for you)
 *   review = run it, then wait for your OK: the step's own approval where it has one (script, plan, packages, short
 *            scripts), else Continue in the autopilot bar. An OK holds for that version of the step's output: redo the
 *            step and it asks again.
 *   me     = never start it: wait until you have done it yourself, then go on
 *   off    = not part of this run (a later step that needs it runs only if it is already done)
 *
 * Each step is an ordinary dashboard job (same commands, same log, same locks), run with the options you last saved on
 * its card (sent when you switch autopilot on). You get a notification when it needs you, when it waits for a usage
 * reset, when something fails twice, and when it is done. It never runs while another job of the video runs, and
 * stopping one of its jobs yourself switches it off. Modes can be changed while it runs.
 *
 * State: workspace/<ID>/autopilot.json (survives restarts; a job cut off by a restart is simply run again).
 */
import fs from "node:fs";
import path from "node:path";
import * as sh from "../../08-shorts/lib";
import { exists, mtime, readJson, wsDir, WS_ROOT } from "./core";
import { jobs, runningJobs, startJob, clashWith, type Job } from "./jobs";
import { notify } from "./notify";
import { approvalState, planApproval, publishApproval, publishStaleReasons, PUB_FILES, renderStates, sceneFiles, stepStatuses } from "./status";
import { commandFor } from "./actions";

export const MODES = ["auto", "review", "me", "off"] as const;
export type Mode = (typeof MODES)[number];

export interface AutopilotCfg {
  on: boolean;
  /** what autopilot does at each step (STAGES) */
  modes: Record<string, Mode>;
  /** options per action, as saved on its card in the dashboard */
  opts: Record<string, Record<string, unknown>>;
  startedAt: number;
}
export interface AutopilotState extends AutopilotCfg {
  /** what it is doing or waiting for, in words */
  now: string;
  /** set while it waits for you: the step key (or "idea") */
  waiting: string | null;
  /** set while it waits at a step you review with Continue (no approval of its own): the step key */
  review: string | null;
  /** the job it started and has not seen end yet */
  current: { action: string; target?: string; jobId: string; startedAt: number } | null;
  /** failed runs per action since autopilot was switched on (two failures stop it) */
  failures: Record<string, number>;
  /** finished steps, newest last */
  history: { at: number; action: string; result: string }[];
  /** notifications already sent (so a wait is announced once) */
  told: string[];
  /** Continue given per step: the step's output fingerprint at the time (a newer output asks again) */
  oks: Record<string, number>;
  /** the free review ran after the acts were last drawn (scene files' newest mtime) */
  reviewedAt: number;
  endedAt: number | null;
  endReason: string | null;
}

/** What one step wants next: run an action, wait for you (input or a decision), or stop; null = the step is done. */
type Want = { run: string; target?: string; opts?: Record<string, unknown>; why: string } | { wait: string; why: string } | { stop: string } | null;
interface Ctx { ws: string; mode: Mode; s: Pick<AutopilotState, "reviewedAt" | "opts"> }
export interface Stage {
  key: string;
  label: string;
  /** steps whose output this one uses: if one of them is off and not done, this step is skipped */
  needs: string[];
  def: Mode;
  /** the actions it runs (their card options are sent along) */
  actions: string[];
  /** the step handles review itself through its own approval (script, plan, packages, short scripts) */
  approval?: boolean;
  next(c: Ctx): Want;
  /** newest output: what a Continue is given for */
  print?(ws: string): number;
}

const f = (ws: string, rel: string) => path.join(wsDir(ws), rel);
const newestScene = (ws: string) => Math.max(0, ...Object.values(sceneFiles(ws)).map((r) => mtime(f(ws, r))));
const SHORT_RUN = ["voice", "align", "plan", "act", "sound", "draft", "render"] as const;
const shortDone = (ws: string, sid: string, stage: string): boolean => {
  const p = sh.shortProgress(ws, sid) as Record<string, boolean>;
  return stage === "draft" ? exists(path.join(sh.shortWs(ws, sid), "05-video/draft.mp4")) : stage === "render" ? p.qc : !!p[stage];
};
const shortsTo = (s: Ctx["s"]) => (String(s.opts["shorts.run"]?.to ?? "draft") === "render" ? "render" : "draft");

/** The steps in the order autopilot walks them. */
export const STAGES: Stage[] = [
  {
    key: "research", label: "Research", needs: [], def: "off", actions: ["script.research"],
    next: ({ ws }) => (exists(f(ws, "02-scripting/research.md")) ? null
      : exists(f(ws, "02-scripting/idea.md")) ? { run: "script.research", why: "research the claims in your idea" } : { wait: "idea", why: "write the idea (Script → idea.md) first" }),
    print: (ws) => mtime(f(ws, "02-scripting/research.md")),
  },
  {
    key: "script", label: "Script", needs: [], def: "review", actions: ["script.write"], approval: true,
    next: ({ ws, mode }) => {
      if (!exists(f(ws, "02-scripting/script_raw.md"))) {
        return exists(f(ws, "02-scripting/idea.md")) ? { run: "script.write", why: "write the script from your idea" } : { wait: "idea", why: "write the idea (Script → idea.md) first" };
      }
      const ap = approvalState(ws);
      if (ap !== "not approved" && ap !== "changed since approval") return null;
      if (mode === "auto") return { run: "script.approve", why: "approve the script (Script is on auto)" };
      return { wait: "script", why: ap === "not approved" ? "the script is ready for you to review and approve" : "the script changed after you approved it: approve it again" };
    },
  },
  {
    key: "voice", label: "Voice", needs: ["script"], def: "auto", actions: ["script.format", "script.apply", "voice.run"],
    next: ({ ws }) => {
      const st = stepStatuses(ws);
      if (st.script !== "done") return exists(f(ws, "03-voiceover/audio/voice.json")) ? { run: "script.apply", why: "voice the changed lines of the approved script" } : { run: "script.format", why: "split the approved script into voice sections" };
      return st.voice === "done" ? null : { run: "voice.run", why: "generate the voice" };
    },
    print: (ws) => mtime(f(ws, "03-voiceover/audio/voice.json")),
  },
  {
    key: "align", label: "Align", needs: ["voice"], def: "auto", actions: ["align.all"],
    next: ({ ws }) => (stepStatuses(ws).align === "done" ? null : { run: "align.all", why: "align the voice (transcribe, master, captions)" }),
    print: (ws) => mtime(f(ws, "05-video/captions.json")),
  },
  {
    key: "plan", label: "Plan", needs: ["align"], def: "auto", actions: ["plan.run"], approval: true,
    next: ({ ws, mode }) => {
      const st = stepStatuses(ws).plan;
      if (st === "none" || st === "failed") return { run: "plan.run", why: "plan the acts" };
      if (st === "stale") {
        // align moves an existing plan to the new voice (replan); a plan still out of date then needs a decision
        return Object.keys(sceneFiles(ws)).length ? { wait: "plan-stale", why: "the plan is older than the voice and acts are already drawn: re-plan or run Align yourself" } : { run: "plan.run", why: "plan the acts again (the voice changed)" };
      }
      if (mode === "review" && !planApproval(ws)?.valid) return { wait: "plan", why: "the plan is ready for you to approve (Plan step)" };
      return null;
    },
  },
  {
    key: "acts", label: "Acts", needs: ["plan"], def: "auto", actions: ["acts.all"],
    next: ({ ws }) => {
      const st = stepStatuses(ws).acts;
      if (st === "done") return null;
      if (st === "stale") return { wait: "acts-stale", why: "some acts are out of date with the plan: redo them (Acts) or approve them as they are" };
      return { run: "acts.all", why: "draw the acts (waits through usage resets)" };
    },
    print: newestScene,
  },
  {
    key: "actReview", label: "Act review", needs: ["acts"], def: "off", actions: ["acts.reviewAll"],
    next: ({ ws, s }) => (s.reviewedAt >= newestScene(ws) ? null : { run: "acts.reviewAll", why: "render previews and run the free review" }),
    print: newestScene,
  },
  {
    key: "sound", label: "Sound", needs: ["acts"], def: "auto", actions: ["sound.all"],
    next: ({ ws }) => (stepStatuses(ws).sound === "done" ? null : { run: "sound.all", why: "build the sound (cues, music stem, mix)" }),
    print: (ws) => mtime(f(ws, "06-audio/mix.wav")),
  },
  {
    key: "draft", label: "Draft render", needs: ["sound"], def: "review", actions: ["render.draft"],
    next: ({ ws }) => (renderStates(ws).draft === "done" ? null : { run: "render.draft", why: "render the draft" }),
    print: (ws) => mtime(f(ws, "05-video/draft.mp4")),
  },
  {
    key: "final", label: "Final render", needs: ["sound"], def: "auto", actions: ["render.final"],
    next: ({ ws }) => (renderStates(ws).final === "done" ? null : { run: "render.final", why: "render the final video + QC" }),
    print: (ws) => mtime(f(ws, "05-video/final.mp4")),
  },
  {
    key: "publish", label: "Publish", needs: ["final"], def: "off", actions: ["publish.all", "publish.export"], approval: true,
    next: ({ ws, mode }) => {
      const have = [...PUB_FILES(ws), f(ws, "07-publish/metadata.json")].every((p) => p && exists(p));
      if (!have) return { run: "publish.all", why: "write the titles and description, draw and review the thumbnails" };
      const stale = publishStaleReasons(ws).filter((r) => !r.includes("after you approved"));
      if (stale.length) return { wait: "publish-stale", why: `the packages are out of date (${stale.join("; ")}): redo them (Publish)` };
      if (mode === "review" && !publishApproval(ws)?.valid) return { wait: "publish", why: "the three packages are ready for you to approve (Publish)" };
      return mtime(f(ws, "07-publish/export/titles.txt")) >= mtime(f(ws, "07-publish/metadata.json")) ? null : { run: "publish.export", why: "export the packages" };
    },
  },
  {
    key: "shortScripts", label: "Short scripts", needs: ["plan"], def: "off", actions: ["shorts.write"], approval: true,
    next: ({ ws, mode }) => {
      const ids = sh.listShorts(ws);
      if (!ids.length) return { run: "shorts.write", why: "write the short scripts" };
      const open = ids.filter((id) => sh.approvalState(sh.shortWs(ws, id)) !== "approved");
      if (!open.length) return null;
      if (mode === "auto") return { run: "shorts.approve", target: open[0], why: `approve short ${open[0]}'s script (Short scripts is on auto)` };
      return { wait: "shortScripts", why: `short script${open.length > 1 ? "s" : ""} ${open.join(", ")} ready for you to approve (Shorts)` };
    },
  },
  {
    key: "shorts", label: "Shorts", needs: ["shortScripts"], def: "off", actions: ["shorts.run", "shorts.export"],
    next: ({ ws, s }) => {
      const to = shortsTo(s), upto = SHORT_RUN.slice(0, SHORT_RUN.indexOf(to) + 1);
      for (const id of sh.listShorts(ws)) {
        if (sh.approvalState(sh.shortWs(ws, id)) !== "approved") continue;   // a short you have not approved is left alone
        const from = upto.find((st) => !shortDone(ws, id, st));
        // the runner redoes every stage from `from` on, so it starts at the first one missing
        if (from) return { run: "shorts.run", target: id, opts: { from, to, force: false }, why: `make short ${id} (${from} → ${to})` };
      }
      if (to === "render" && sh.listShorts(ws).some((id) => sh.shortProgress(ws, id).qc && !sh.shortProgress(ws, id).exported)) return { run: "shorts.export", why: "export the finished shorts" };
      return null;
    },
    print: (ws) => Math.max(0, ...sh.listShorts(ws).flatMap((id) => ["draft.mp4", "final.mp4"].map((n) => mtime(path.join(sh.shortWs(ws, id), "05-video", n))))),
  },
  {
    key: "deliver", label: "Downloads", needs: ["final"], def: "off", actions: ["deliver.build"],
    next: ({ ws }) => (exists(f(ws, "05-video/final.mp4")) && mtime(f(ws, "08-deliver/deliver.json")) >= mtime(f(ws, "05-video/final.mp4")) ? null : { run: "deliver.build", why: "build the downloads and the Final Cut Pro project" }),
    print: (ws) => mtime(f(ws, "08-deliver/deliver.json")),
  },
];
const STAGE = Object.fromEntries(STAGES.map((st) => [st.key, st]));

/** Every action autopilot may run (approvals included), and the options it forces on top of yours. */
export const AUTOPILOT_ACTIONS = [...STAGES.flatMap((st) => st.actions), "script.approve", "shorts.approve"];
const FORCED: Record<string, Record<string, unknown>> = {
  // every act that needs drawing, waiting through usage resets
  "acts.all": { acts: [], wait: true, force: false },
  "acts.reviewAll": { acts: [] },
};

export const defaultModes = (): Record<string, Mode> => Object.fromEntries(STAGES.map((st) => [st.key, st.def]));
function cleanModes(m: unknown): Record<string, Mode> {
  const out = defaultModes();
  if (m && typeof m === "object") for (const st of STAGES) { const v = (m as any)[st.key]; if (MODES.includes(v)) out[st.key] = v; }
  return out;
}
function cleanOpts(o: unknown): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const k of AUTOPILOT_ACTIONS) { const v = (o as any)?.[k]; if (v && typeof v === "object" && !Array.isArray(v)) out[k] = v; }
  return out;
}

export const autopilotFile = (ws: string) => path.join(wsDir(ws), "autopilot.json");
/** The saved state; a file from the first autopilot (until + planGate) is read as the same choice in modes. */
export function readAutopilot(ws: string): AutopilotState | null {
  const s = readJson<any>(autopilotFile(ws));
  if (!s) return null;
  if (!s.modes) {
    s.modes = { ...defaultModes(), plan: s.planGate ? "review" : "auto", actReview: s.until === "review" ? "auto" : "off", sound: "off" };
    delete s.until; delete s.planGate;
  }
  s.oks ??= {}; s.review ??= null;
  return s as AutopilotState;
}
function save(ws: string, s: AutopilotState) {
  try { fs.writeFileSync(autopilotFile(ws), JSON.stringify(s, null, 1)); } catch {}
}

/** Steps you review with Continue that are already done when autopilot starts count as reviewed (you were there). */
function okDoneSteps(ws: string, s: AutopilotState) {
  for (const st of STAGES) {
    if (s.modes[st.key] !== "review" || st.approval || !st.print || s.oks[st.key]) continue;
    try { if (st.next({ ws, mode: "review", s }) === null) s.oks[st.key] = st.print(ws); } catch {}
  }
}

export function startAutopilot(ws: string, cfg: { modes?: unknown; opts?: unknown }): AutopilotState {
  const prev = readAutopilot(ws);
  const s: AutopilotState = {
    on: true, modes: cleanModes(cfg.modes), opts: cleanOpts(cfg.opts), startedAt: Date.now(),
    now: "starting", waiting: null, review: null, current: null, failures: {}, history: [], told: [], oks: prev?.oks ?? {},
    reviewedAt: prev?.reviewedAt ?? 0, endedAt: null, endReason: null,
  };
  okDoneSteps(ws, s);
  save(ws, s);
  tick(ws);
  return readAutopilot(ws)!;
}

/** Change the modes (and options) of a running autopilot; it goes on from where the files are. */
export function updateAutopilot(ws: string, cfg: { modes?: unknown; opts?: unknown }): AutopilotState | null {
  const s = readAutopilot(ws);
  if (!s?.on) return s;
  s.modes = cleanModes(cfg.modes ?? s.modes);
  if (cfg.opts) s.opts = cleanOpts(cfg.opts);
  okDoneSteps(ws, s);
  s.told = s.told.filter((k) => !k.startsWith("wait:"));
  save(ws, s);
  tick(ws);
  return readAutopilot(ws);
}

/** Your OK for a step reviewed with Continue: holds for its output as it is now. */
export function continueAutopilot(ws: string, step: string): AutopilotState | string {
  const s = readAutopilot(ws), st = STAGE[step];
  if (!s?.on) return "autopilot is off";
  if (!st?.print || st.approval) return "that step is approved on its own page";
  s.oks[step] = st.print(ws);
  s.history.push({ at: Date.now(), action: `${step}.ok`, result: "you said continue" });
  save(ws, s);
  tick(ws);
  return readAutopilot(ws)!;
}

export function stopAutopilot(ws: string, reason = "you switched it off"): AutopilotState | null {
  const s = readAutopilot(ws);
  if (!s) return null;
  if (s.on) { s.on = false; s.endedAt = Date.now(); s.endReason = reason; s.now = `off: ${reason}`; s.waiting = null; s.review = null; save(ws, s); }
  return s;
}

const tell = (ws: string, s: AutopilotState, key: string, title: string, body: string, ok = true, icon = "robot") => {
  if (s.told.includes(key)) return;
  s.told.push(key);
  notify(`${ws}: ${title}`, body, ok, icon);
};
const finish = (ws: string, s: AutopilotState, reason: string, ok: boolean) => {
  s.on = false; s.endedAt = Date.now(); s.endReason = reason; s.now = reason; s.waiting = null; s.review = null; s.current = null;
  notify(`${ws}: autopilot ${ok ? "done" : "stopped"}`, reason, ok, ok ? "checkered_flag" : "warning");
};

export type Next =
  | { run: string; target?: string; opts?: Record<string, unknown>; why: string; step: string }
  | { wait: string; why: string; step: string; review?: boolean }
  | { done: string }
  | { stop: string };

/**
 * What to do next, from the files on disk: walk the steps in order and return the first thing that is not done (an
 * action to run, or a reason to wait for you), or done. Pure apart from reading the workspace, so it is tested on its
 * own (test/autopilot.test.ts).
 */
export function nextStep(ws: string, s: Pick<AutopilotState, "modes" | "reviewedAt" | "opts" | "oks">): Next {
  const done = new Set<string>(), skipped: string[] = [];
  for (const st of STAGES) {
    const mode = s.modes[st.key] ?? st.def;
    const want = st.next({ ws, mode, s });
    if (want === null) {
      done.add(st.key);
      // a step reviewed with Continue: done, but not past you until you said so for this output
      if (mode === "review" && !st.approval && st.print && (s.oks[st.key] ?? -1) !== st.print(ws)) {
        return { wait: st.key, step: st.key, review: true, why: `${st.label} is done: look at it, then Continue` };
      }
      continue;
    }
    if (mode === "off") continue;
    const missing = st.needs.filter((n) => !done.has(n));
    if (missing.length) { skipped.push(`${st.label} (needs ${missing.map((n) => STAGE[n].label).join(", ")})`); continue; }
    if ("stop" in want) return want;
    if ("wait" in want) return { ...want, step: st.key };
    if (mode === "me") return { wait: st.key, step: st.key, why: `your turn: ${st.label} (${want.why}); autopilot goes on once it is done` };
    return { ...want, step: st.key };
  }
  return { done: `every step you picked is done${skipped.length ? `; skipped ${skipped.join(", ")}` : ""}: your turn` };
}

const runKey = (a: { action: string; target?: string }) => (a.target ? `${a.action}:${a.target}` : a.action);

/** One look at a video: note how its job ended, then start the next step or say what it waits for. */
export function tick(ws: string): void {
  const s = readAutopilot(ws);
  if (!s?.on) return;
  // the job autopilot started: still running → nothing to do; ended → record it
  if (s.current) {
    const j: Job | undefined = jobs.get(s.current.jobId);
    if (j?.status === "running") { s.now = `running: ${j.label}`; save(ws, s); return; }
    const result = j ? j.status : "interrupted";   // gone = the server restarted mid-run
    const key = runKey(s.current);
    s.history.push({ at: Date.now(), action: key, result });
    const action = s.current.action;
    s.current = null;
    if (result === "stopped") { finish(ws, s, `you stopped ${key}: autopilot is off`, false); save(ws, s); return; }
    if (action === "acts.reviewAll" && result === "done") s.reviewedAt = newestScene(ws);
    if (result === "failed") {
      s.failures[key] = (s.failures[key] ?? 0) + 1;
      if (s.failures[key] >= 2) { finish(ws, s, `${key} failed twice: see its log`, false); save(ws, s); return; }
    }
  }
  // someone else's job on this video: wait for it
  const other = runningJobs(ws)[0];
  if (other) { s.now = `waiting for ${other.label} to finish`; save(ws, s); return; }

  const n = nextStep(ws, s);
  if ("done" in n) { finish(ws, s, n.done, true); save(ws, s); return; }
  if ("stop" in n) { finish(ws, s, n.stop, false); save(ws, s); return; }
  if ("wait" in n) {
    s.waiting = n.wait; s.review = n.review ? n.step : null; s.now = `waiting for you: ${n.why}`;
    const extra = n.wait === "script" ? approvalState(ws) : n.review ? String(STAGE[n.step].print?.(ws) ?? "") : "";
    const title = n.wait === "idea" ? "autopilot needs the idea" : n.review ? `${STAGE[n.step].label} ready to look at` : `${STAGE[n.step]?.label ?? n.step}: your turn`;
    tell(ws, s, `wait:${n.wait}:${extra}`, title, `${n.why}. Autopilot goes on by itself after that.`);
    save(ws, s);
    return;
  }
  s.waiting = null; s.review = null;
  s.told = s.told.filter((k) => !k.startsWith("wait:"));   // a later wait is announced again
  // a step that ran fine but left its status unchanged would loop: run each action at most 3 times
  const key = runKey({ action: n.run, target: n.target });
  const runs = s.history.filter((h) => h.action === key).length;
  if (runs >= 3) { finish(ws, s, `${key} ran ${runs} times and the step is still not done: look at it`, false); save(ws, s); return; }
  const opts = { ...(s.opts[n.run] ?? {}), ...(FORCED[n.run] ?? {}), ...(n.opts ?? {}) };
  const c = commandFor(ws, n.run, opts, n.target);
  if (typeof c === "string") { finish(ws, s, `cannot start ${key}: ${c}`, false); save(ws, s); return; }
  if (clashWith(ws, c.locks)) { s.now = "waiting for a job to finish"; save(ws, s); return; }
  if (n.run === "script.approve" || n.run === "shorts.approve") notify(`${ws}: autopilot approved for you`, n.why, true, "robot");
  const job = startJob(ws, c.key, c.label, c.cmds, { ...opts, autopilot: true }, c.locks);
  s.current = { action: n.run, ...(n.target ? { target: n.target } : {}), jobId: job.id, startedAt: Date.now() };
  s.now = `running: ${c.label} (${n.why})`;
  save(ws, s);
}

/** Look at every video with autopilot on, every 15 s. */
export function startAutopilotLoop(): void {
  const all = () => { try { return fs.readdirSync(WS_ROOT).filter((d) => exists(path.join(WS_ROOT, d, "autopilot.json"))); } catch { return []; } };
  setInterval(() => { for (const ws of all()) { try { tick(ws); } catch (e) { console.error(`[autopilot] ${ws}: ${(e as Error).message}`); } } }, 15_000);
}
