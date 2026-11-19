/**
 * Autopilot: moves a video along by itself, from the idea to drawn acts, and stops only where you decide.
 *
 *   idea → Write script → [you approve the script] → split → voice → align → plan → [plan approval, if asked] →
 *   Author acts (--wait: sleeps through usage resets, see author_act.ts) → previews + free review (if asked) → done
 *
 * Each step is an ordinary dashboard job (same commands, same log, same locks), run with the options you last saved on
 * its card (sent when you switch autopilot on). You get a notification when it needs you, when it waits for a usage
 * reset, when something fails twice, and when it is done. It never runs while another job of the video runs, and
 * stopping one of its jobs yourself switches it off.
 *
 * State: workspace/<ID>/autopilot.json (survives restarts; a job cut off by a restart is simply run again).
 */
import fs from "node:fs";
import path from "node:path";
import { exists, readJson, wsDir, WS_ROOT } from "./core";
import { jobs, runningJobs, startJob, clashWith, type Job } from "./jobs";
import { notify } from "./notify";
import { approvalState, planApproval, sceneFiles, stepStatuses } from "./status";
import { commandFor } from "./actions";

/** How far autopilot goes: "acts" = stop once every act is drawn; "review" = also render previews and run the free review. */
export type Until = "acts" | "review";
export interface AutopilotCfg {
  on: boolean;
  until: Until;
  /** stop for your approval of the plan before drawing acts */
  planGate: boolean;
  /** options per action, as saved on its card in the dashboard */
  opts: Record<string, Record<string, unknown>>;
  startedAt: number;
}
export interface AutopilotState extends AutopilotCfg {
  /** what it is doing or waiting for, in words */
  now: string;
  /** set while it waits for you: "script" | "plan" | "idea" */
  waiting: string | null;
  /** the job it started and has not seen end yet */
  current: { action: string; jobId: string; startedAt: number } | null;
  /** failed runs per action since autopilot was switched on (two failures stop it) */
  failures: Record<string, number>;
  /** finished steps, newest last */
  history: { at: number; action: string; result: string }[];
  /** notifications already sent (so a wait is announced once) */
  told: string[];
  /** the free review ran after the acts were last drawn (scene files' newest mtime) */
  reviewedAt: number;
  endedAt: number | null;
  endReason: string | null;
}

export const autopilotFile = (ws: string) => path.join(wsDir(ws), "autopilot.json");
export function readAutopilot(ws: string): AutopilotState | null { return readJson<AutopilotState>(autopilotFile(ws)); }
function save(ws: string, s: AutopilotState) {
  try { fs.writeFileSync(autopilotFile(ws), JSON.stringify(s, null, 1)); } catch {}
}

/** The actions autopilot may run, and the options it forces on top of yours. */
export const AUTOPILOT_ACTIONS = ["script.write", "script.format", "script.apply", "voice.run", "align.all", "plan.run", "acts.all", "acts.reviewAll"] as const;
type Act = (typeof AUTOPILOT_ACTIONS)[number];
const FORCED: Partial<Record<Act, Record<string, unknown>>> = {
  // every act that needs drawing, waiting through usage resets; one at a time measures what an act costs cleanly
  "acts.all": { acts: [], wait: true, force: false },
  "acts.reviewAll": { acts: [] },
};

export function startAutopilot(ws: string, cfg: { until?: string; planGate?: boolean; opts?: Record<string, unknown> }): AutopilotState {
  const opts: Record<string, Record<string, unknown>> = {};
  for (const k of AUTOPILOT_ACTIONS) {
    const o = (cfg.opts as any)?.[k];
    if (o && typeof o === "object" && !Array.isArray(o)) opts[k] = o;
  }
  const s: AutopilotState = {
    on: true, until: cfg.until === "review" ? "review" : "acts", planGate: !!cfg.planGate, opts, startedAt: Date.now(),
    now: "starting", waiting: null, current: null, failures: {}, history: [], told: [], reviewedAt: readAutopilot(ws)?.reviewedAt ?? 0, endedAt: null, endReason: null,
  };
  save(ws, s);
  tick(ws);
  return readAutopilot(ws)!;
}

export function stopAutopilot(ws: string, reason = "you switched it off"): AutopilotState | null {
  const s = readAutopilot(ws);
  if (!s) return null;
  if (s.on) { s.on = false; s.endedAt = Date.now(); s.endReason = reason; s.now = `off: ${reason}`; s.waiting = null; save(ws, s); }
  return s;
}

const tell = (ws: string, s: AutopilotState, key: string, title: string, body: string, ok = true, icon = "robot") => {
  if (s.told.includes(key)) return;
  s.told.push(key);
  notify(`${ws}: ${title}`, body, ok, icon);
};
const finish = (ws: string, s: AutopilotState, reason: string, ok: boolean) => {
  s.on = false; s.endedAt = Date.now(); s.endReason = reason; s.now = reason; s.waiting = null; s.current = null;
  notify(`${ws}: autopilot ${ok ? "done" : "stopped"}`, reason, ok, ok ? "checkered_flag" : "warning");
};
const newestScene = (ws: string) => Math.max(0, ...Object.values(sceneFiles(ws)).map((r) => { try { return fs.statSync(path.join(wsDir(ws), r)).mtimeMs; } catch { return 0; } }));

/**
 * What to do next, from the files on disk: an action to run, or a reason to wait for you, or done. Pure apart from
 * reading the workspace, so it is tested on its own (test/autopilot.test.ts).
 */
export function nextStep(ws: string, s: Pick<AutopilotState, "until" | "planGate" | "reviewedAt">):
  { run: Act; why: string } | { wait: "idea" | "script" | "plan"; why: string } | { done: string } | { stop: string } {
  const d = wsDir(ws);
  const st = stepStatuses(ws);
  if (!exists(path.join(d, "02-scripting/script_raw.md"))) {
    return exists(path.join(d, "02-scripting/idea.md")) ? { run: "script.write", why: "write the script from your idea" } : { wait: "idea", why: "write the idea (Script → idea.md) first" };
  }
  const ap = approvalState(ws);
  if (ap === "not approved" || ap === "changed since approval") return { wait: "script", why: ap === "not approved" ? "the script is ready for you to review and approve" : "the script changed after you approved it: approve it again" };
  const voiced = exists(path.join(d, "03-voiceover/audio/voice.json"));
  if (st.script !== "done") return voiced ? { run: "script.apply", why: "voice the changed lines of the approved script" } : { run: "script.format", why: "split the approved script into voice sections" };
  if (st.voice !== "done") return { run: "voice.run", why: "generate the voice" };
  if (st.align !== "done") return { run: "align.all", why: "align the voice (transcribe, master, captions)" };
  if (st.plan === "none") return { run: "plan.run", why: "plan the acts" };
  if (st.plan === "stale") {
    // align moves an existing plan to the new voice (replan); a plan still out of date then needs a decision
    return Object.keys(sceneFiles(ws)).length ? { stop: "the plan is older than the voice and acts are already drawn: re-plan or run Align yourself" } : { run: "plan.run", why: "plan the acts again (the voice changed)" };
  }
  if (s.planGate && !planApproval(ws)?.valid) return { wait: "plan", why: "the plan is ready for you to approve (Plan step)" };
  if (st.acts !== "done") return { run: "acts.all", why: "draw the acts (waits through usage resets)" };
  if (s.until === "review" && s.reviewedAt < newestScene(ws)) return { run: "acts.reviewAll", why: "render previews and run the free review" };
  return { done: s.until === "review" ? "every act is drawn, previewed and reviewed: your turn" : "every act is drawn: your turn to review them" };
}

/** One look at a video: note how its job ended, then start the next step or say what it waits for. */
export function tick(ws: string): void {
  const s = readAutopilot(ws);
  if (!s?.on) return;
  // the job autopilot started: still running → nothing to do; ended → record it
  if (s.current) {
    const j: Job | undefined = jobs.get(s.current.jobId);
    if (j?.status === "running") { s.now = `running: ${j.label}`; save(ws, s); return; }
    const result = j ? j.status : "interrupted";   // gone = the server restarted mid-run
    s.history.push({ at: Date.now(), action: s.current.action, result });
    const action = s.current.action;
    s.current = null;
    if (result === "stopped") { finish(ws, s, `you stopped ${action}: autopilot is off`, false); save(ws, s); return; }
    if (action === "acts.reviewAll" && result === "done") s.reviewedAt = newestScene(ws);
    if (result === "failed") {
      s.failures[action] = (s.failures[action] ?? 0) + 1;
      if (s.failures[action] >= 2) { finish(ws, s, `${action} failed twice: see its log`, false); save(ws, s); return; }
    }
  }
  // someone else's job on this video: wait for it
  const other = runningJobs(ws)[0];
  if (other) { s.now = `waiting for ${other.label} to finish`; save(ws, s); return; }

  const n = nextStep(ws, s);
  if ("done" in n) { finish(ws, s, n.done, true); save(ws, s); return; }
  if ("stop" in n) { finish(ws, s, n.stop, false); save(ws, s); return; }
  if ("wait" in n) {
    s.waiting = n.wait; s.now = `waiting for you: ${n.why}`;
    tell(ws, s, `wait:${n.wait}:${n.wait === "script" ? approvalState(ws) : ""}`, n.wait === "script" ? "script ready for you" : n.wait === "plan" ? "plan ready for you" : "autopilot needs the idea", `${n.why}. Autopilot goes on by itself after that.`);
    save(ws, s);
    return;
  }
  s.waiting = null;
  s.told = s.told.filter((k) => !k.startsWith("wait:"));   // a later wait is announced again
  // a step that ran fine but left its status unchanged would loop: run each action at most 3 times
  const runs = s.history.filter((h) => h.action === n.run).length;
  if (runs >= 3) { finish(ws, s, `${n.run} ran ${runs} times and the step is still not done: look at it`, false); save(ws, s); return; }
  const opts = { ...(s.opts[n.run] ?? {}), ...(FORCED[n.run] ?? {}) };
  const c = commandFor(ws, n.run, opts);
  if (typeof c === "string") { finish(ws, s, `cannot start ${n.run}: ${c}`, false); save(ws, s); return; }
  if (clashWith(ws, c.locks)) { s.now = "waiting for a job to finish"; save(ws, s); return; }
  const job = startJob(ws, c.key, c.label, c.cmds, { ...opts, autopilot: true }, c.locks);
  s.current = { action: n.run, jobId: job.id, startedAt: Date.now() };
  s.now = `running: ${c.label} (${n.why})`;
  save(ws, s);
}

/** Look at every video with autopilot on, every 15 s. */
export function startAutopilotLoop(): void {
  const all = () => { try { return fs.readdirSync(WS_ROOT).filter((d) => exists(path.join(WS_ROOT, d, "autopilot.json"))); } catch { return []; } };
  setInterval(() => { for (const ws of all()) { try { tick(ws); } catch (e) { console.error(`[autopilot] ${ws}: ${(e as Error).message}`); } } }, 15_000);
}
