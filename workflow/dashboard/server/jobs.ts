/**
 * Jobs: one allowlisted command chain run with Bun.spawn (no shell) from the repo root. Logs live in memory, are
 * streamed to the page (SSE) and appended to workspace/<ID>/dashboard.log; every finished job is recorded in
 * dashboard_runs.json with its duration and resources.
 */
import fs from "node:fs";
import path from "node:path";
import { sample, treeUsage, wanted } from "../system";
import { ANSI, LOG_CAP, REPO, exists, readJson, wsDir } from "./core";
import { notifyEnd } from "./notify";

// ───────────────────────────── jobs ─────────────────────────────

export type JobStatus = "running" | "done" | "failed" | "stopped";
export interface Job {
  id: string;
  ws: string;
  step: string; // e.g. "voice", "align", "act:A03", "frames:A03"
  label: string;
  cmds: string[][];
  cmdIndex: number;
  status: JobStatus;
  exitCode: number | null;
  startedAt: number;
  endedAt: number | null;
  text: string;
  subs: Set<ReadableStreamDefaultController>;
  pid: number | null;
  stopRequested: boolean;
  opts: Record<string, any>;
  /** what the job writes: "act:A03" for one act's jobs, "*" for the whole video. Jobs whose locks overlap never run together. */
  locks: string[];
  stats: { n: number; cpuSum: number; cpuPeak: number; rssPeak: number; gpuSum: number; gpuN: number; gpuPeak: number; cur: { cpu: number; rssMB: number; top: string[] } | null };
}

export const jobs = new Map<string, Job>(); // jobId → job
export const jobsByWs = new Map<string, string[]>(); // ws → jobIds (newest last)
export let jobSeq = 0;
export const enc = new TextEncoder();

/** The first running job of a video (any), see runningJobs for all of them. */
export function runningJob(ws: string): Job | undefined {
  return runningJobs(ws)[0];
}
export function runningJobs(ws: string): Job[] {
  return (jobsByWs.get(ws) ?? []).map((jid) => jobs.get(jid)).filter((j): j is Job => j?.status === "running");
}
/** Locks overlap when either takes the whole video ("*") or both write the same act. */
export const lockClash = (a: string[], b: string[]) => a.includes("*") || b.includes("*") || a.some((x) => b.includes(x));
/** The running job a new job with these locks would clash with, if any. */
export function clashWith(ws: string, locks: string[]): Job | undefined {
  return runningJobs(ws).find((j) => lockClash(j.locks, locks));
}

export function appendWsLog(ws: string, s: string) {
  if (!exists(wsDir(ws))) return;
  try { fs.appendFileSync(path.join(wsDir(ws), "dashboard.log"), s); } catch {}
}

export function sse(ctrl: ReadableStreamDefaultController, event: string, data: unknown) {
  try { ctrl.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); } catch {}
}

export function emit(job: Job, s: string, persist = true) {
  s = s.replace(ANSI, "");
  if (!s) return;
  job.text += s;
  if (job.text.length > LOG_CAP) job.text = "…(older output trimmed)…\n" + job.text.slice(-LOG_CAP);
  if (persist) appendWsLog(job.ws, s);
  for (const c of job.subs) sse(c, "chunk", s);
}

export function jobStats(j: Job) {
  const s = j.stats;
  return { cpuAvg: s.n ? Math.round(s.cpuSum / s.n) : null, cpuPeak: s.n ? Math.round(s.cpuPeak) : null, rssPeakMB: s.n ? Math.round(s.rssPeak) : null,
    gpuAvg: s.gpuN ? Math.round(s.gpuSum / s.gpuN) : null, gpuPeak: s.gpuN ? s.gpuPeak : null, cur: j.status === "running" ? s.cur : null };
}
export function jobSummary(j: Job) {
  return { id: j.id, ws: j.ws, step: j.step, label: j.label, status: j.status, exitCode: j.exitCode, startedAt: j.startedAt, endedAt: j.endedAt,
    ms: (j.endedAt ?? Date.now()) - j.startedAt, cmd: j.cmds[j.cmdIndex]?.join(" "), cmds: j.cmds.map((c) => c.join(" ")), cmdIndex: j.cmdIndex, cmdCount: j.cmds.length, opts: j.opts, locks: j.locks, stats: jobStats(j) };
}

/** Every finished job, with duration and resources, in workspace/<ID>/dashboard_runs.json (newest last, capped). */
export function recordRun(j: Job) {
  const f = path.join(wsDir(j.ws), "dashboard_runs.json");
  if (!exists(wsDir(j.ws))) return;
  const all = readJson<any[]>(f) ?? [];
  const { cur, ...stats } = jobStats(j);
  all.push({ id: j.id, step: j.step, label: j.label, cmds: j.cmds.map((c) => c.join(" ")), opts: j.opts, status: j.status, exit: j.exitCode, start: j.startedAt, end: j.endedAt, ms: (j.endedAt ?? 0) - j.startedAt, ...stats });
  try { fs.writeFileSync(f, JSON.stringify(all.slice(-500), null, 1)); } catch {}
}

/** Set by naming.ts: called for each project a finished job may have given a name source (idea, script, plan). */
export const hooks: { nameAfter?: (ws: string) => void } = {};

/** Sample the machine every 2 s while the page is open or a job runs; attribute CPU/memory to each job's process tree. */
export function startSampler() {
  setInterval(() => {
    const running = [...jobs.values()].filter((j) => j.status === "running");
    if (!running.length && !wanted()) return;
    const s = sample();
    for (const j of running) {
      if (!j.pid) continue;
      const u = treeUsage(j.pid);
      const st = j.stats;
      st.n++; st.cpuSum += u.cpu; st.cpuPeak = Math.max(st.cpuPeak, u.cpu); st.rssPeak = Math.max(st.rssPeak, u.rssMB);
      if (s.gpu !== null) { st.gpuN++; st.gpuSum += s.gpu; st.gpuPeak = Math.max(st.gpuPeak, s.gpu); }
      st.cur = { cpu: u.cpu, rssMB: u.rssMB, top: u.top };
    }
  }, 2000);
}

export async function pump(stream: ReadableStream<Uint8Array> | null, onText: (s: string) => void) {
  if (!stream) return;
  const dec = new TextDecoder();
  const reader = stream.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    onText(dec.decode(value, { stream: true }));
  }
  const tail = dec.decode();
  if (tail) onText(tail);
}

export function childEnv() {
  return { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1", CI: process.env.CI ?? "" };
}

/** Kill a process and every descendant (bun run → bun → bunx → node...). */
export function killTree(pid: number, signal: NodeJS.Signals = "SIGTERM") {
  const ps = Bun.spawnSync(["ps", "-A", "-o", "pid=,ppid="]);
  const kids = new Map<number, number[]>();
  for (const line of ps.stdout.toString().split("\n")) {
    const [a, b] = line.trim().split(/\s+/).map(Number);
    if (!a || !b) continue;
    if (!kids.has(b)) kids.set(b, []);
    kids.get(b)!.push(a);
  }
  const all: number[] = [];
  const walk = (p: number) => { all.push(p); for (const c of kids.get(p) ?? []) walk(c); };
  walk(pid);
  for (const p of all.reverse()) { try { process.kill(p, signal); } catch {} }
}

export function startJob(ws: string, step: string, label: string, cmds: string[][], opts: Record<string, any> = {}, locks: string[] = ["*"]): Job {
  const job: Job = {
    id: `j${Date.now().toString(36)}${(jobSeq++).toString(36)}`,
    ws, step, label, cmds, cmdIndex: 0, status: "running", exitCode: null,
    startedAt: Date.now(), endedAt: null, text: "", subs: new Set(), pid: null, stopRequested: false, opts, locks,
    stats: { n: 0, cpuSum: 0, cpuPeak: 0, rssPeak: 0, gpuSum: 0, gpuN: 0, gpuPeak: 0, cur: null },
  };
  jobs.set(job.id, job);
  if (!jobsByWs.has(ws)) jobsByWs.set(ws, []);
  const list = jobsByWs.get(ws)!;
  list.push(job.id);
  while (list.length > 60) jobs.delete(list.shift()!);
  appendWsLog(ws, `\n▶▶ [${job.id}] step=${step} start ${new Date(job.startedAt).toISOString()} ${label}\n`);
  (async () => {
    let code = 0;
    for (let i = 0; i < cmds.length; i++) {
      job.cmdIndex = i;
      emit(job, `$ ${cmds[i].join(" ")}\n`);
      const proc = Bun.spawn(cmds[i], { cwd: REPO, env: childEnv(), stdin: "ignore", stdout: "pipe", stderr: "pipe" });
      job.pid = proc.pid;
      await Promise.all([pump(proc.stdout, (s) => emit(job, s)), pump(proc.stderr, (s) => emit(job, s))]);
      code = await proc.exited;
      job.pid = null;
      emit(job, `\n[exit ${code}${proc.signalCode ? ` ${proc.signalCode}` : ""}]\n`);
      if (code !== 0 || job.stopRequested) break;
    }
    job.exitCode = code;
    job.status = job.stopRequested ? "stopped" : code === 0 ? "done" : "failed";
    job.endedAt = Date.now();
    appendWsLog(ws, `◀◀ [${job.id}] step=${step} exit=${job.status === "stopped" ? "stopped" : code} end ${new Date(job.endedAt).toISOString()}\n`);
    recordRun(job);
    notifyEnd(job);
    for (const c of job.subs) { sse(c, "end", jobSummary(job)); try { c.close(); } catch {} }
    job.subs.clear();
    // an untitled project is named as soon as a finished job leaves something to name it from (idea, script, plan)
    if (job.status === "done") for (const w of (job.opts.nameAfter as string[] | undefined) ?? [ws]) hooks.nameAfter?.(w);
    // new-video: the workspace only exists now; keep its scaffold log
    if (step === "new-video" && exists(wsDir(ws))) appendWsLog(ws, `▶▶ [${job.id}] step=new-video start ${new Date(job.startedAt).toISOString()}\n${job.text}◀◀ [${job.id}] step=new-video exit=${code} end ${new Date(job.endedAt).toISOString()}\n`);
  })().catch((e) => {
    emit(job, `\n[dashboard] ${e?.message ?? e}\n`);
    job.status = "failed";
    job.endedAt = Date.now();
    notifyEnd(job);
    for (const c of job.subs) { sse(c, "end", jobSummary(job)); try { c.close(); } catch {} }
  });
  return job;
}

export function logStream(job: Job): Response {
  let ctrlRef: ReadableStreamDefaultController;
  let beat: ReturnType<typeof setInterval>;
  const stream = new ReadableStream({
    start(ctrl) {
      ctrlRef = ctrl;
      sse(ctrl, "reset", jobSummary(job));
      if (job.text) sse(ctrl, "chunk", job.text);
      if (job.status !== "running") { sse(ctrl, "end", jobSummary(job)); ctrl.close(); return; }
      job.subs.add(ctrl);
      beat = setInterval(() => { try { ctrl.enqueue(enc.encode(": ping\n\n")); } catch { clearInterval(beat); } }, 15000);
    },
    cancel() { job.subs.delete(ctrlRef); clearInterval(beat); },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" } });
}

/** The last block of dashboard.log for a step key (log from before a server restart). */
export function lastLogBlock(ws: string, step: string): string {
  const p = path.join(wsDir(ws), "dashboard.log");
  if (!exists(p)) return "";
  const text = fs.readFileSync(p, "utf-8");
  const re = new RegExp(`^▶▶ \\[(\\w+)\\] step=${step.replace(/[^\w:-]/g, "")} start`, "gm");
  let m: RegExpExecArray | null, lastIdx = -1, job = "";
  while ((m = re.exec(text))) { lastIdx = m.index; job = m[1]; }
  if (lastIdx < 0) return "";
  const endRe = new RegExp(`^◀◀ \\[${job}\\].*$`, "m");
  const rest = text.slice(lastIdx);
  const e = rest.match(endRe);
  return (e ? rest.slice(0, e.index! + e[0].length) : rest).slice(-200000);
}
