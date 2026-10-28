/**
 * Local control room for the video pipeline: one page to pick a workspace, edit the script,
 * run each step, watch its log, and see/hear what it produced.
 *
 * Usage: bun run dashboard [--port 4600] [--host 0.0.0.0]
 *   binds 127.0.0.1 unless --host is given; --host 0.0.0.0 opens it to the local network (no login: home network only)
 *   NTFY_TOPIC=<topic> sends a phone notification (ntfy.sh app) when a job ends
 *   on macOS a desktop notification is shown too (MAC_NOTIFY=0 turns it off)
 *
 * Commands are allowlisted: the client sends a step key, the server builds the argv and runs it
 * with Bun.spawn (no shell) from the repo root. One job per workspace. Logs live in memory and
 * are appended to workspace/<ID>/dashboard.log. Status is derived from files on disk + that log.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { sample, history, treeUsage, topProcs, want, wanted, machine } from "./system";
import { refreshUsage, usageReport } from "./usage";
import { atomicWrite, helpFor, parseEnv, removeEnv, serializeEnv, setEnv, KEY_RE } from "./envfile";

const REPO = path.resolve(import.meta.dir, "../..");
const WS_ROOT = path.join(REPO, "workspace");
const DIST = path.join(import.meta.dir, "web/dist");
/** WG_ENV_FILE lets tests point the Settings page at a temp file; normally the repo's .env. */
const ENV_FILE = process.env.WG_ENV_FILE ?? path.join(REPO, ".env");
const LIMITS_FILE = path.join(os.homedir(), ".claude/wealthgap/statusline.json");
const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const argPort = parseInt(arg("--port") ?? "", 10);
const PORT = Number.isFinite(argPort) ? argPort : 4600;
const HOST = arg("--host") ?? "127.0.0.1";
const NTFY_TOPIC = process.env.NTFY_TOPIC ?? "";
const MAC_NOTIFY = process.platform === "darwin" && process.env.MAC_NOTIFY !== "0";
/** This machine's own IPv4 addresses on the network (the Host a phone at home uses with --host). */
const lanIps = () => Object.values(os.networkInterfaces()).flat().filter((n) => n && n.family === "IPv4" && !n.internal).map((n) => n!.address);

const WS_ID = /^VID\d+_[A-Za-z0-9_]+$/;
const ACT_ID = /^A\d{2,3}$/;
const LOG_CAP = 4 * 1024 * 1024;
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07]*\x07/g;

// ───────────────────────────── helpers ─────────────────────────────

const wsDir = (id: string) => path.join(WS_ROOT, id);
const exists = (p: string) => fs.existsSync(p);
function mtime(p: string): number {
  try { return fs.statSync(p).mtimeMs; } catch { return 0; }
}
function readJson<T = any>(p: string): T | null {
  try { return JSON.parse(fs.readFileSync(p, "utf-8")); } catch { return null; }
}
function ls(dir: string, re?: RegExp): string[] {
  try { return fs.readdirSync(dir).filter((f) => !f.startsWith(".") && (!re || re.test(f))).sort(); } catch { return []; }
}
function fileInfo(id: string, rel: string) {
  const abs = path.join(wsDir(id), rel);
  try {
    const s = fs.statSync(abs);
    return { path: rel, size: s.size, mtime: s.mtimeMs };
  } catch { return null; }
}
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
const bad = (msg: string, status = 400) => json({ error: msg }, status);

function validWs(id: string): boolean {
  return WS_ID.test(id) && exists(wsDir(id)) && fs.statSync(wsDir(id)).isDirectory();
}

// ───────────────────────────── jobs ─────────────────────────────

type JobStatus = "running" | "done" | "failed" | "stopped";
interface Job {
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
  stats: { n: number; cpuSum: number; cpuPeak: number; rssPeak: number; gpuSum: number; gpuN: number; gpuPeak: number; cur: { cpu: number; rssMB: number; top: string[] } | null };
}

const jobs = new Map<string, Job>(); // jobId → job
const jobsByWs = new Map<string, string[]>(); // ws → jobIds (newest last)
let jobSeq = 0;
const enc = new TextEncoder();

function runningJob(ws: string): Job | undefined {
  for (const jid of jobsByWs.get(ws) ?? []) {
    const j = jobs.get(jid);
    if (j?.status === "running") return j;
  }
}

function appendWsLog(ws: string, s: string) {
  if (!exists(wsDir(ws))) return;
  try { fs.appendFileSync(path.join(wsDir(ws), "dashboard.log"), s); } catch {}
}

function sse(ctrl: ReadableStreamDefaultController, event: string, data: unknown) {
  try { ctrl.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); } catch {}
}

function emit(job: Job, s: string, persist = true) {
  s = s.replace(ANSI, "");
  if (!s) return;
  job.text += s;
  if (job.text.length > LOG_CAP) job.text = "…(older output trimmed)…\n" + job.text.slice(-LOG_CAP);
  if (persist) appendWsLog(job.ws, s);
  for (const c of job.subs) sse(c, "chunk", s);
}

function jobStats(j: Job) {
  const s = j.stats;
  return { cpuAvg: s.n ? Math.round(s.cpuSum / s.n) : null, cpuPeak: s.n ? Math.round(s.cpuPeak) : null, rssPeakMB: s.n ? Math.round(s.rssPeak) : null,
    gpuAvg: s.gpuN ? Math.round(s.gpuSum / s.gpuN) : null, gpuPeak: s.gpuN ? s.gpuPeak : null, cur: j.status === "running" ? s.cur : null };
}
function jobSummary(j: Job) {
  return { id: j.id, ws: j.ws, step: j.step, label: j.label, status: j.status, exitCode: j.exitCode, startedAt: j.startedAt, endedAt: j.endedAt,
    ms: (j.endedAt ?? Date.now()) - j.startedAt, cmd: j.cmds[j.cmdIndex]?.join(" "), cmds: j.cmds.map((c) => c.join(" ")), cmdIndex: j.cmdIndex, cmdCount: j.cmds.length, opts: j.opts, stats: jobStats(j) };
}

/** Every finished job, with duration and resources, in workspace/<ID>/dashboard_runs.json (newest last, capped). */
function recordRun(j: Job) {
  const f = path.join(wsDir(j.ws), "dashboard_runs.json");
  if (!exists(wsDir(j.ws))) return;
  const all = readJson<any[]>(f) ?? [];
  const { cur, ...stats } = jobStats(j);
  all.push({ id: j.id, step: j.step, label: j.label, cmds: j.cmds.map((c) => c.join(" ")), opts: j.opts, status: j.status, exit: j.exitCode, start: j.startedAt, end: j.endedAt, ms: (j.endedAt ?? 0) - j.startedAt, ...stats });
  try { fs.writeFileSync(f, JSON.stringify(all.slice(-500), null, 1)); } catch {}
}

/** When a job ends: a macOS notification (unless MAC_NOTIFY=0) and a phone one through ntfy.sh (if NTFY_TOPIC is set). Best effort, never throws. */
function notifyEnd(j: Job) {
  const min = Math.round(((j.endedAt ?? Date.now()) - j.startedAt) / 60000);
  const title = `${j.ws}: ${j.label} ${j.status}`;
  const body = `${j.step} ${j.status} after ${min} min${j.status === "failed" ? ` (exit ${j.exitCode})` : ""}`;
  if (MAC_NOTIFY) {
    // title/body go in as argv, so no AppleScript quoting is needed
    const sound = j.status === "done" ? "Glass" : "Basso";
    try {
      Bun.spawn(["osascript", "-e", "on run argv", "-e", `display notification (item 2 of argv) with title (item 1 of argv) sound name "${sound}"`, "-e", "end run", title, body],
        { stdin: "ignore", stdout: "ignore", stderr: "ignore" });
    } catch {}
  }
  if (NTFY_TOPIC) {
    const icon = j.status === "done" ? "white_check_mark" : j.status === "stopped" ? "stop_sign" : "x";
    fetch(`https://ntfy.sh/${encodeURIComponent(NTFY_TOPIC)}`, { method: "POST", headers: { Title: title, Tags: icon }, body }).catch(() => {});
  }
}

/** Sample the machine every 2 s while the page is open or a job runs; attribute CPU/memory to each job's process tree. */
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

async function pump(stream: ReadableStream<Uint8Array> | null, onText: (s: string) => void) {
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

function childEnv() {
  return { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1", CI: process.env.CI ?? "" };
}

/** Kill a process and every descendant (bun run → bun → bunx → node...). */
function killTree(pid: number, signal: NodeJS.Signals = "SIGTERM") {
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

function startJob(ws: string, step: string, label: string, cmds: string[][], opts: Record<string, any> = {}): Job {
  const job: Job = {
    id: `j${Date.now().toString(36)}${(jobSeq++).toString(36)}`,
    ws, step, label, cmds, cmdIndex: 0, status: "running", exitCode: null,
    startedAt: Date.now(), endedAt: null, text: "", subs: new Set(), pid: null, stopRequested: false, opts,
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

// ───────────────────────────── studio ─────────────────────────────

interface Studio { ws: string; pid: number | null; port: number | null; text: string; startedAt: number; exited: number | null }
let studio: Studio | null = null;

function startStudio(ws: string): Studio {
  const s: Studio = { ws, pid: null, port: null, text: "", startedAt: Date.now(), exited: null };
  const proc = Bun.spawn(["bun", "run", "studio", "--video", ws], { cwd: REPO, env: childEnv(), stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  s.pid = proc.pid;
  const onText = (t: string) => {
    t = t.replace(ANSI, "");
    s.text = (s.text + t).slice(-20000);
    const m = t.match(/https?:\/\/(?:localhost|127\.0\.0\.1):(\d+)/);
    if (m && !s.port) s.port = parseInt(m[1], 10);
  };
  pump(proc.stdout, onText);
  pump(proc.stderr, onText);
  proc.exited.then((c) => { s.exited = c; s.pid = null; });
  studio = s;
  return s;
}

function studioState() {
  if (!studio) return null;
  return { ws: studio.ws, running: studio.exited === null, port: studio.port, url: studio.port ? `http://localhost:${studio.port}` : null, exited: studio.exited, startedAt: studio.startedAt, tail: studio.text.split("\n").slice(-25).join("\n") };
}

// ───────────────────────────── commands (allowlist + typed options) ─────────────────────────────

const B = (script: string, ...rest: string[]) => ["bun", "run", script, ...rest];

function actIds(ws: string): string[] {
  const plan = readJson(path.join(wsDir(ws), "05-video/acts.json"));
  return (plan?.acts ?? []).map((a: any) => String(a.id));
}

const notesRel = (act: string) => `05-video/review/${act}/director_notes.md`;

/** One option of an action. The client renders a control per option; the server validates and maps it to argv. */
interface Opt {
  key: string; label: string; help?: string;
  type: "select" | "number" | "bool" | "text" | "multi";
  choices?: string[]; def?: string | number | boolean | string[];
  min?: number; max?: number; step?: number;
  /** argv for a value (bool: only when true) */
  flag?: string; map?: (v: any) => string[];
}
interface Action {
  step: string; label: string; help: string;
  paid?: string;           // e.g. "~$3"
  perAct?: boolean;        // needs an act id
  long?: string;           // typical duration
  opts?: Opt[];
  /** Master buttons: the commands this action runs, in order (same order as build()). `action` = another button that runs that command alone. */
  chain?: { label: string; action?: string }[];
  build: (ws: string, o: Record<string, any>, act?: string) => string[][] | string;
}
const styles = () => ls(path.join(REPO, "workflow/styles")).filter((d) => exists(path.join(REPO, "workflow/styles", d, "STYLE.md")));

/** Final render: resolution (upscaled above 1080p) and which audio goes in the file. */
const FINAL_OPTS: Opt[] = [
  { key: "res", label: "Resolution", help: "1440p and 4K are upscaled from the 1080p render", type: "select", choices: ["1080", "1440", "2160"], def: "1080", flag: "--res" },
  { key: "audio", label: "Audio", help: "mix = voice + foley (+ music if mixed in); none skips QC's loudness check", type: "select", choices: ["mix", "voice", "none"], def: "mix", flag: "--audio" },
];

const ACTIONS: Record<string, Action> = {
  "script.write": {
    step: "script", label: "Write script", help: "Turns your draft (idea.md) into a chunked, hook-scored script with on-screen hints. With feedback.md newer than the script, it revises instead.",
    paid: "~$1–2", long: "3–6 min",
    opts: [
      { key: "model", label: "Writer model", type: "select", choices: ["opus", "sonnet"], def: "opus", flag: "--model" },
      { key: "minutes", label: "Target length (min)", type: "number", min: 3, max: 15, step: 0.5, def: 9, flag: "--minutes" },
    ],
    build: (ws, o) => [B("write", "--video", ws, ...args(o, "script.write"))],
  },
  "script.approve": { step: "script", label: "Approve script", help: "Locks this exact script for voice generation (any edit afterwards needs a new approval).", build: (ws) => [B("write", "--video", ws, "--approve")] },
  "script.format": {
    step: "script", label: "Split into voice sections", help: "Parses the approved script into voice sections (03-voiceover/sections).", long: "seconds",
    opts: [{ key: "unapproved", label: "Skip approval check", type: "bool", def: false, flag: "--unapproved" }],
    build: (ws, o) => [B("tts:format", "--video", ws, ...args(o, "script.format"))],
  },
  "voice.run": {
    step: "voice", label: "Generate voice", help: "Local Chatterbox voice clone, best-of-N takes scored by speech recognition.", long: "~5 min per min of audio",
    opts: [
      { key: "force", label: "Regenerate existing sections", type: "bool", def: true, flag: "--force" },
      { key: "combine", label: "Combine into full voiceover", type: "bool", def: true, flag: "--combine" },
      { key: "engine", label: "Engine", type: "select", choices: ["chatterbox", "f5"], def: "chatterbox", map: (v) => (v === "f5" ? ["--f5"] : []) },
      { key: "pace", label: "Pace", help: "1 = natural, 0.9 = slower", type: "number", min: 0.6, max: 1.3, step: 0.05, flag: "--pace" },
      { key: "exaggeration", label: "Exaggeration", help: "emotional intensity", type: "number", min: 0, max: 2, step: 0.05, flag: "--exaggeration" },
      { key: "cfg", label: "CFG weight", help: "lower = slower, more deliberate", type: "number", min: 0, max: 1, step: 0.05, flag: "--cfg" },
      { key: "temperature", label: "Temperature", type: "number", min: 0.1, max: 1.5, step: 0.05, flag: "--temperature" },
      { key: "takes", label: "Takes per chunk", type: "number", min: 1, max: 6, step: 1, flag: "--takes" },
      { key: "acceptWer", label: "Accept WER", help: "stop early when a take is this accurate", type: "number", min: 0, max: 0.5, step: 0.01, flag: "--accept-wer" },
      { key: "sentenceGap", label: "Sentence gap (s)", type: "number", min: 0, max: 2, step: 0.05, flag: "--sentence-gap" },
      { key: "sectionGap", label: "Section gap (s)", type: "number", min: 0, max: 3, step: 0.05, flag: "--section-gap" },
      { key: "chapterGap", label: "Chapter gap (s)", type: "number", min: 0, max: 6, step: 0.1, flag: "--chapter-gap" },
      { key: "part", label: "Only part", type: "number", min: 1, max: 30, step: 1, flag: "--part" },
      { key: "section", label: "Only section id", help: "e.g. part2_03_beat", type: "text", flag: "--section" },
    ],
    build: (ws, o) => [B("tts", "--video", ws, ...args(o, "voice.run"))],
  },
  "align.all": { step: "align", label: "Align all", help: "Transcribe → master → captions → .srt.", long: "~3 min",
    chain: [{ label: "Transcribe", action: "align.transcribe" }, { label: "Master voice", action: "align.master" }, { label: "Build captions", action: "align.captions" }, { label: "Export .srt", action: "align.srt" }], build: (ws) => [B("transcribe", "--video", ws), B("audio:master", "--video", ws), B("captions", "--video", ws), B("srt", "--video", ws)] },
  "align.transcribe": { step: "align", label: "Transcribe", help: "Word timings from the voiceover (faster-whisper, aligned to the script).", build: (ws) => [B("transcribe", "--video", ws)] },
  "align.master": { step: "align", label: "Master voice", help: "EQ, de-ess, compression, loudness.", build: (ws) => [B("audio:master", "--video", ws)] },
  "align.captions": { step: "align", label: "Build captions", help: "captions.json + chapters.json for the planner.", build: (ws) => [B("captions", "--video", ws)] },
  "align.srt": { step: "align", label: "Export .srt", help: "YouTube closed captions.", build: (ws) => [B("srt", "--video", ws)] },
  "plan.run": {
    step: "plan", label: "Plan acts", help: "The director splits the narration into ~10 acts with beats, hits and sourced data.", paid: "~$1.5", long: "~6 min",
    opts: [
      { key: "model", label: "Director model", type: "select", choices: ["opus", "sonnet"], def: "opus", flag: "--model" },
      { key: "style", label: "House style", type: "select", choices: styles(), def: "briefing", flag: "--style" },
    ],
    build: (ws, o) => [B("direct", "--video", ws, ...args(o, "plan.run"))],
  },
  "plan.check": { step: "plan", label: "Validate plan", help: "Re-checks acts.json without calling a model.", build: (ws) => [B("direct", "--video", ws, "--check")] },
  "acts.all": {
    step: "acts", label: "Author acts", help: "Writes every act (or the selected ones) that has no file yet.", paid: "~$3 per act", long: "~17 min per act",
    chain: [{ label: "Author each act", action: "acts.act" }],
    opts: [
      { key: "acts", label: "Acts", help: "empty = all missing", type: "multi", choices: [], flag: "--act", map: (v: string[]) => (v.length ? ["--act", v.join(",")] : []) },
      { key: "parallel", label: "In parallel", type: "number", min: 1, max: 4, step: 1, def: 2, flag: "--parallel" },
      { key: "model", label: "Author model", type: "select", choices: ["opus", "sonnet"], def: "opus", flag: "--model" },
      { key: "critic", label: "Critic", type: "select", choices: ["agy", "haiku", "sonnet", "off"], def: "agy", map: (v) => (v === "off" ? ["--no-critic"] : ["--critic", v]) },
      { key: "force", label: "Redo acts that exist", type: "bool", def: false, flag: "--force" },
      { key: "strict", label: "Paid fix round on a failed critic", type: "bool", def: false, flag: "--strict" },
    ],
    build: (ws, o) => [B("act", "--video", ws, ...args(o, "acts.all"))],
  },
  "acts.act": {
    step: "acts", perAct: true, label: "Author", help: "Writes this act.", paid: "~$3", long: "~17 min",
    opts: [
      { key: "model", label: "Author model", type: "select", choices: ["opus", "sonnet"], def: "opus", flag: "--model" },
      { key: "critic", label: "Critic", type: "select", choices: ["agy", "haiku", "sonnet", "off"], def: "agy", map: (v) => (v === "off" ? ["--no-critic"] : ["--critic", v]) },
      { key: "force", label: "Redo if it exists", type: "bool", def: true, flag: "--force" },
    ],
    build: (ws, o, act) => [B("act", "--video", ws, "--act", act!, ...args(o, "acts.act"))],
  },
  "acts.fix": {
    step: "acts", perAct: true, label: "Fix with notes", help: "Sends the review notes to the act's author for one revision.", paid: "~$5–11", long: "~3–15 min",
    opts: [{ key: "model", label: "Author model", type: "select", choices: ["opus", "sonnet"], def: "opus", flag: "--model" }],
    build: (ws, o, act) => {
      const rel = path.join("workspace", ws, notesRel(act!));
      if (!exists(path.join(REPO, rel))) return "save review notes first";
      return [B("act", "--video", ws, "--act", act!, "--fix", rel, ...args(o, "acts.fix"))];
    },
  },
  "acts.frames": {
    step: "acts", perAct: true, label: "Render frames", help: "Stills every N s + at each hit word, a contact sheet and a layout report.", long: "~1 min",
    opts: [
      { key: "every", label: "Every (s)", type: "number", min: 0.5, max: 10, step: 0.5, def: 4, flag: "--every" },
      { key: "words", label: "Also at hit words", type: "bool", def: true, flag: "--words" },
      { key: "scale", label: "Scale", type: "number", min: 0.25, max: 1, step: 0.25, def: 0.5, flag: "--scale" },
      { key: "at", label: "Extra times (s)", help: "comma-separated, e.g. 12.3,20", type: "text", flag: "--at" },
    ],
    build: (ws, o, act) => [B("frames", "--video", ws, "--scene", act!, ...args(o, "acts.frames"))],
  },
  "acts.preview": {
    step: "acts", perAct: true, label: "Render preview", help: "The act as a video with voice + effects, to watch and annotate.", long: "~30 s–2 min",
    opts: [{ key: "scale", label: "Scale", type: "select", choices: ["1", "0.5"], def: "1", flag: "--scale" }],
    build: (ws, o, act) => [B("preview", "--video", ws, "--act", act!, ...args(o, "acts.preview"))],
  },
  "acts.review": {
    step: "acts", perAct: true, label: "Review", help: "An agent checks that the visuals match the voice at each moment and lists fixes.", long: "2–6 min",
    opts: [
      { key: "agent", label: "Reviewer", type: "select", choices: ["agy", "haiku", "sonnet", "opus"], def: "agy", flag: "--agent", help: "agy = Gemini Flash (free); others are Claude (paid)" },
      { key: "give", label: "Give it", type: "multi", choices: ["transcript", "plan", "script", "code"], def: ["transcript", "plan"], map: (v: string[]) => (v.length ? ["--give", v.join(",")] : ["--give", "none"]) },
      { key: "every", label: "Frame every (s)", type: "number", min: 0.5, max: 6, step: 0.5, def: 2, flag: "--every" },
      { key: "focus", label: "Look hardest at", type: "text", flag: "--focus" },
      { key: "toNotes", label: "Append findings to review notes", type: "bool", def: true, flag: "--to-notes" },
      { key: "noFrames", label: "Reuse existing frames", type: "bool", def: false, flag: "--no-frames" },
    ],
    build: (ws, o, act) => [B("review", "--video", ws, "--act", act!, ...args(o, "acts.review"))],
  },
  "sound.all": { step: "sound", label: "Build sound", help: "Cues → music stem → mix.", long: "~2 min",
    chain: [{ label: "Cues", action: "sound.cues" }, { label: "Music stem", action: "sound.music" }, { label: "Mix", action: "sound.mix" }], build: (ws, o) => [B("cues", "--video", ws), B("audio:music", "--video", ws), B("audio:mix", "--video", ws, ...args(o, "sound.mix"))] },
  "sound.cues": { step: "sound", label: "Cues", help: "Foley events from the acts + the music cue plan.", build: (ws) => [B("cues", "--video", ws)] },
  "sound.music": {
    step: "sound", label: "Music stem", help: "Procedural spy-jazz bed as a separate file for post.",
    opts: [
      { key: "reset", label: "Reset music.json", type: "bool", def: false, flag: "--reset" },
      { key: "audition", label: "Render 20 s auditions", type: "bool", def: false, flag: "--audition" },
    ],
    build: (ws, o) => [B("audio:music", "--video", ws, ...args(o, "sound.music"))],
  },
  "sound.mix": {
    step: "sound", label: "Mix", help: "Voice + foley at −14 LUFS (music is added in post).",
    opts: [
      { key: "withMusic", label: "Include music", type: "bool", def: false, flag: "--with-music" },
      { key: "duckDb", label: "Music duck (dB)", type: "number", min: -30, max: 0, step: 1, flag: "--duck-db" },
      { key: "musicDb", label: "Music level (dB)", type: "number", min: -30, max: 6, step: 1, flag: "--music-db" },
      { key: "foleyDb", label: "Foley level (dB)", type: "number", min: -20, max: 10, step: 1, flag: "--foley-db" },
      { key: "noLib", label: "Procedural foley only", type: "bool", def: false, flag: "--no-lib" },
    ],
    build: (ws, o) => [B("audio:mix", "--video", ws, ...args(o, "sound.mix"))],
  },
  "render.assemble": { step: "render", label: "Assemble", help: "Registers every act in the video project.", build: (ws) => [B("assemble", "--video", ws)] },
  "render.draft": { step: "render", label: "Draft render", help: "Full video + QC.", long: "~3–5 min",
    chain: [{ label: "Assemble", action: "render.assemble" }, { label: "Render draft" }, { label: "QC", action: "render.qc" }], build: (ws) => [B("assemble", "--video", ws), B("draft", "--video", ws), B("qc", "--video", ws)] },
  "render.final": { step: "render", label: "Final render", help: "H.264 with grain + QC. Acts are drawn at 1080p: 1440p and 4K are a sharp upscale (YouTube streams 4K uploads at a higher bitrate).", long: "~5–10 min (4K: longer)",
    opts: FINAL_OPTS,
    chain: [{ label: "Assemble", action: "render.assemble" }, { label: "Render final" }, { label: "QC", action: "render.qc" }], build: (ws, o) => [B("assemble", "--video", ws), B("render", "--video", ws, ...args(o, "render.final")), ...(o.audio === "none" ? [] : [B("qc", "--video", ws)])] },
  "render.all": { step: "render", label: "Render all", help: "Assemble, draft render, final render, QC.", long: "~8–15 min",
    chain: [{ label: "Assemble", action: "render.assemble" }, { label: "Render draft" }, { label: "Render final" }, { label: "QC", action: "render.qc" }],
    opts: FINAL_OPTS,
    build: (ws, o) => [B("assemble", "--video", ws), B("draft", "--video", ws), B("render", "--video", ws, ...args(o, "render.all")), ...(o.audio === "none" ? [] : [B("qc", "--video", ws)])] },
  "render.qc": { step: "render", label: "QC", help: "Hard checks: placeholders, loudness, duration.", build: (ws) => [B("qc", "--video", ws)] },
  "timings.run": { step: "timings", label: "Time & cost report", help: "Prints timings.json.", build: (ws) => [B("timings", "--video", ws)] },
};

/** Validate client options against an action's schema and turn them into argv. Unknown keys are ignored. */
let currentOpts: Record<string, any> = {};
function args(o: Record<string, any>, key: string): string[] {
  const out: string[] = [];
  for (const opt of ACTIONS[key].opts ?? []) {
    let v = o[opt.key] ?? opt.def;
    if (v === undefined || v === null || v === "") continue;
    switch (opt.type) {
      case "bool": if (v === true || v === "true") out.push(...(opt.map ? opt.map(true) : [opt.flag!])); continue;
      case "number": {
        const n = Number(v);
        if (!Number.isFinite(n)) throw new Error(`${opt.label}: not a number`);
        if ((opt.min !== undefined && n < opt.min) || (opt.max !== undefined && n > opt.max)) throw new Error(`${opt.label}: ${opt.min}–${opt.max}`);
        out.push(...(opt.map ? opt.map(n) : [opt.flag!, String(n)]));
        continue;
      }
      case "select":
        if (!(opt.choices ?? []).includes(String(v))) throw new Error(`${opt.label}: not one of ${opt.choices?.join(", ")}`);
        out.push(...(opt.map ? opt.map(String(v)) : [opt.flag!, String(v)]));
        continue;
      case "multi": {
        const arr = (Array.isArray(v) ? v : []).map(String);
        const allowed = key === "acts.all" && opt.key === "acts" ? currentOpts.__acts ?? [] : opt.choices ?? [];
        if (arr.some((x) => !allowed.includes(x))) throw new Error(`${opt.label}: unknown value`);
        out.push(...(opt.map ? opt.map(arr) : arr.length ? [opt.flag!, arr.join(",")] : []));
        continue;
      }
      case "text": {
        const s = String(v).trim();
        if (!s) continue;
        if (s.length > 300 || s.startsWith("-") || /[\0\n\r]/.test(s)) throw new Error(`${opt.label}: invalid text`);
        if (opt.key === "at" && !/^[\d.,\s]+$/.test(s)) throw new Error("Extra times: numbers separated by commas");
        if (opt.key === "section" && !/^[\w-]+$/.test(s)) throw new Error("Section id: letters, digits, _ and -");
        out.push(opt.flag!, s);
      }
    }
  }
  return out;
}

/** Every runnable thing: action key → argv chain (allowlisted; options validated). */
function commandFor(ws: string, key: string, opts: Record<string, any>, act?: string): { label: string; key: string; cmds: string[][] } | string {
  const a = ACTIONS[key];
  if (!a) return "unknown action";
  if (a.perAct && (!act || !ACT_ID.test(act) || !actIds(ws).includes(act))) return "unknown act";
  currentOpts = { __acts: actIds(ws) };
  let cmds: string[][] | string;
  try { cmds = a.build(ws, opts ?? {}, act); } catch (e: any) { return e.message; }
  if (typeof cmds === "string") return cmds;
  const jobKey = a.perAct ? `${key.split(".")[1]}:${act}` : a.step;
  return { key: jobKey, label: a.perAct ? `${a.label} ${act}` : a.label, cmds };
}

function schema() {
  return Object.fromEntries(Object.entries(ACTIONS).map(([k, a]) => [k, { step: a.step, label: a.label, help: a.help, paid: a.paid ?? null, long: a.long ?? null, perAct: !!a.perAct, chain: a.chain ?? null, opts: (a.opts ?? []).map(({ map, flag, ...o }) => o) }]));
}

// ───────────────────────────── status from disk ─────────────────────────────

type St = "none" | "done" | "stale" | "partial" | "running" | "failed";

/** none: no outputs. partial: some outputs. stale: an input is newer than an output. */
function derive(ws: string, inputs: string[], outputs: string[], extraInputMs = 0): St {
  const d = wsDir(ws);
  const outs = outputs.map((o) => mtime(path.join(d, o)));
  const have = outs.filter(Boolean);
  if (!have.length) return "none";
  if (have.length < outs.length) return "partial";
  const newestIn = Math.max(extraInputMs, ...inputs.map((i) => mtime(path.join(d, i))));
  return Math.min(...outs) + 1000 < newestIn ? "stale" : "done";
}

/** Last recorded run per step key from dashboard.log (survives restarts). Cached by size+mtime. */
const logCache = new Map<string, { size: number; mtime: number; last: Record<string, { exit: string; end: number; job: string }> }>();
function lastRuns(ws: string) {
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

function sceneFiles(ws: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of ls(path.join(wsDir(ws), "05-video/src/scenes"), /^A\d+_.*\.tsx$/)) out[f.split("_")[0]] = `05-video/src/scenes/${f}`;
  return out;
}

function overlay(ws: string, key: string, st: St, outputs: string[]): St {
  const run = runningJob(ws);
  if (run && (run.step === key || run.step.startsWith(key + ":"))) return "running";
  const last = lastRuns(ws)[key];
  if (last && last.exit !== "0") {
    const newestOut = Math.max(0, ...outputs.map((o) => mtime(path.join(wsDir(ws), o))));
    if (last.exit === "interrupted" || last.end > newestOut) return "failed";
  }
  return st;
}

function stepStatuses(ws: string): Record<string, St> {
  const S = (key: string, inputs: string[], outputs: string[], extra = 0) => overlay(ws, key, derive(ws, inputs, outputs, extra), outputs);
  const scenes = sceneFiles(ws);
  const ids = actIds(ws);
  const sceneMax = Math.max(0, ...Object.values(scenes).map((r) => mtime(path.join(wsDir(ws), r))));
  let acts: St = "none";
  if (ids.length) {
    const have = ids.filter((i) => scenes[i]);
    const actsMs = mtime(path.join(wsDir(ws), "05-video/acts.json"));
    acts = have.length === 0 ? "none" : have.length < ids.length ? "partial" : have.some((i) => mtime(path.join(wsDir(ws), scenes[i])) + 1000 < actsMs) ? "stale" : "done";
  }
  const run = runningJob(ws);
  if (run && /^(acts|act:|fix:|frames:)/.test(run.step)) acts = "running";
  const render = (() => {
    const draft = derive(ws, ["06-audio/mix.wav", "05-video/timeline.json"], ["05-video/draft.mp4"], sceneMax);
    const fin = derive(ws, ["06-audio/mix.wav", "05-video/timeline.json"], ["05-video/final.mp4"], sceneMax);
    const st: St = fin !== "none" ? fin : draft;
    return overlay(ws, "render", st, ["05-video/draft.mp4", "05-video/final.mp4", "05-video/review/qc-report.md"]);
  })();
  return {
    script: exists(path.join(wsDir(ws), "02-scripting/script_raw.md"))
      ? (["not approved", "changed since approval"].includes(approvalState(ws)) ? overlay(ws, "script", "partial", []) : S("script", ["02-scripting/script_raw.md"], ["03-voiceover/sections/index.ts"]))
      : exists(path.join(wsDir(ws), "02-scripting/idea.md")) ? overlay(ws, "script", "partial", []) : "none",
    voice: S("voice", ["03-voiceover/sections/index.ts"], ["03-voiceover/audio/combined/full_voiceover.wav"]),
    align: S("align", ["03-voiceover/audio/combined/full_voiceover.wav"], ["04-transcription/full_transcript.json", "06-audio/voiceover_master.wav", "05-video/captions.json"]),
    plan: S("plan", ["05-video/captions.json"], ["05-video/acts.json"]),
    acts,
    sound: S("sound", ["06-audio/voiceover_master.wav"], ["05-video/events.json", "06-audio/music_plan.json", "06-audio/music.wav", "06-audio/mix.wav"], sceneMax),
    render,
    timings: S("timings", [], ["timings.json"]),
  };
}

// ───────────────────────────── artifacts per step ─────────────────────────────

function timingsFor(ws: string) {
  return (readJson<any[]>(path.join(wsDir(ws), "timings.json")) ?? []).filter((r) => r && typeof r.step === "string");
}

const TIMING_MATCH: Record<string, RegExp> = {
  voice: /^voice\b/i,
  align: /^(transcribe|master|captions)\b/i,
  plan: /^direct\b/i,
  script: /^write script/i,
  acts: /^(act|critic|frames|review|preview) A\d+/i,
  sound: /^(cues|music|mix|sound)\b/i,
  render: /^(render|qc)\b/i,
};

function stepMeta(rows: any[], re: RegExp) {
  const hit = rows.filter((r) => re.test(r.step));
  if (!hit.length) return null;
  const last = hit[hit.length - 1];
  return { runs: hit.length, totalMs: hit.reduce((s, r) => s + (r.ms ?? 0), 0), totalCost: hit.reduce((s, r) => s + (r.costUsd ?? 0), 0), last: { step: last.step, ms: last.ms, costUsd: last.costUsd, model: last.model, at: last.at } };
}

const readText = (p: string) => { try { return fs.readFileSync(p, "utf-8"); } catch { return ""; } };
function spokenWords(script: string): number {
  return script.split("\n").filter((l) => /^\*\*VO:\*\*/i.test(l)).join(" ").replace(/`\[[^\]]*\]`/g, "").replace(/\*\*VO:\*\*/gi, "").split(/\s+/).filter(Boolean).length;
}
/** Same rule as write_script.ts / format_sections.ts: approved = approved.json holds the sha256 of the current script. */
function approvalState(ws: string): string {
  const d = wsDir(ws), f = path.join(d, "02-scripting/script_raw.md"), a = readJson<any>(path.join(d, "02-scripting/approved.json"));
  if (!exists(f)) return "no script";
  if (!a) return exists(path.join(d, "02-scripting/idea.md")) ? "not approved" : "legacy";
  return a.sha256 === new Bun.CryptoHasher("sha256").update(fs.readFileSync(f)).digest("hex") ? "approved" : "changed since approval";
}

function details(ws: string) {
  const d = wsDir(ws);
  const rows = timingsFor(ws);
  const meta: Record<string, any> = {};
  for (const [k, re] of Object.entries(TIMING_MATCH)) meta[k] = stepMeta(rows, re);

  // script
  const scriptInfo = fileInfo(ws, "02-scripting/script_raw.md");
  const sections = ls(path.join(d, "03-voiceover/sections"), /^part\d+\.ts$/);
  let sectionCount = 0;
  for (const f of sections) sectionCount += (fs.readFileSync(path.join(d, "03-voiceover/sections", f), "utf-8").match(/^\s*id:\s*"/gm) ?? []).length;

  // voice
  const audioDir = path.join(d, "03-voiceover/audio");
  const parts = ls(audioDir, /^part-\d+$/).sort((a, b) => parseInt(a.slice(5)) - parseInt(b.slice(5)));
  const voiceParts = parts.map((p) => ({ part: p, files: ls(path.join(audioDir, p), /\.wav$/).map((f) => fileInfo(ws, `03-voiceover/audio/${p}/${f}`)).filter(Boolean) }));
  const combined = ls(path.join(audioDir, "combined"), /\.wav$/).map((f) => fileInfo(ws, `03-voiceover/audio/combined/${f}`)).filter(Boolean);
  const run = runningJob(ws);
  const voiceSince = run?.step === "voice" ? run.startedAt : 0;
  const freshWavs = voiceParts.reduce((s, p) => s + p.files.filter((f: any) => f.mtime >= voiceSince).length, 0);

  // align
  const captions = readJson<any[]>(path.join(d, "05-video/captions.json"));
  const chapters = readJson<any[]>(path.join(d, "05-video/chapters.json"));

  // plan
  const plan = readJson<any>(path.join(d, "05-video/acts.json"));
  const unverified: string[] = [];
  const acts = (plan?.acts ?? []).map((a: any) => {
    for (const b of a.beats ?? []) for (const x of b.data ?? []) if (/unverified|narration/i.test(String(x.source ?? ""))) unverified.push(`${a.id}: ${x.label} = ${x.value}${x.unit ? " " + x.unit : ""}`);
    return { id: a.id, slug: a.slug, title: a.title, startMs: a.startMs, endMs: a.endMs, bpm: a.bpm, chapter: a.chapter ?? null, idea: a.idea ?? "", beats: (a.beats ?? []).length };
  });

  // acts
  const scenes = sceneFiles(ws);
  const actsMs = mtime(path.join(d, "05-video/acts.json"));
  const last = lastRuns(ws);
  const actRows = acts.map((a: any) => {
    const rdir = `05-video/review/${a.id}`;
    const abs = path.join(d, rdir);
    const critics = ls(abs, /^critic_\d+\.json$/).sort((x, y) => fs.statSync(path.join(abs, x)).mtimeMs - fs.statSync(path.join(abs, y)).mtimeMs);   // newest last (numbers restart per author run)
    const critic = critics.length ? readJson(path.join(abs, critics[critics.length - 1])) : null;
    const notesPath = path.join(d, notesRel(a.id));
    const scene = scenes[a.id] ? fileInfo(ws, scenes[a.id]) : null;
    let status: St = !scene ? "none" : scene.mtime + 1000 < actsMs ? "stale" : "done";
    if (run && [`act:${a.id}`, `fix:${a.id}`, `frames:${a.id}`].includes(run.step)) status = "running";
    else for (const k of [`act:${a.id}`, `fix:${a.id}`]) if (last[k] && last[k].exit !== "0" && last[k].end >= (scene?.mtime ?? 0)) status = "failed";
    return {
      id: a.id, title: a.title, status, scene,
      thumbs: ls(abs, /^t_.*\.jpg$/).map((f) => fileInfo(ws, `${rdir}/${f}`)),
      sheet: fileInfo(ws, `${rdir}/sheet.jpg`),
      critic: critic ? { file: critics[critics.length - 1], score: critic.score, pass: critic.pass, issues: critic.issues ?? [] } : null,
      notes: exists(notesPath) ? fs.readFileSync(notesPath, "utf-8") : "",
      preview: fileInfo(ws, `${rdir}/preview.mp4`),
      reviews: ls(path.join(abs, "reviews"), /\.json$/).reverse().slice(0, 12).map((f) => {
        const r = readJson<any>(path.join(abs, "reviews", f));
        return r ? { file: `${rdir}/reviews/${f}`, agent: r.agent, at: r.at, sync: r.sync_score, overall: r.overall, summary: r.summary, issues: r.issues ?? [], costUsd: r.costUsd ?? 0, ms: r.ms ?? 0, give: r.give ?? [] } : null;
      }).filter(Boolean),
      start: a.startMs, end: a.endMs, idea: a.idea,
      notesMtime: mtime(notesPath),
      meta: stepMeta(rows, new RegExp(`\\b${a.id}\\b`)),
    };
  });

  // sound
  const soundFiles = ["06-audio/music.wav", "06-audio/mix.wav"].map((r) => fileInfo(ws, r)).filter(Boolean);
  const stems = [...ls(path.join(d, "06-audio/stems"), /\.wav$/).map((f) => fileInfo(ws, `06-audio/stems/${f}`)), ...ls(path.join(d, "06-audio/audition"), /\.wav$/).map((f) => fileInfo(ws, `06-audio/audition/${f}`))].filter(Boolean);
  const events = readJson<any[]>(path.join(d, "05-video/events.json"));
  const credits = exists(path.join(d, "06-audio/credits.txt")) ? fs.readFileSync(path.join(d, "06-audio/credits.txt"), "utf-8").slice(0, 4000) : "";

  // render
  const videos = ["05-video/final.mp4", "05-video/draft.mp4"].map((r) => fileInfo(ws, r)).filter(Boolean);
  const qcPath = path.join(d, "05-video/review/qc-report.md");
  const qc = exists(qcPath) ? { ...fileInfo(ws, "05-video/review/qc-report.md"), text: fs.readFileSync(qcPath, "utf-8").slice(0, 20000) } : null;
  const manifest = readJson(path.join(d, "05-video/draft.manifest.json"));

  return {
    id: ws,
    style: plan?.style ?? null,
    title: plan?.video?.title ?? null,
    statuses: stepStatuses(ws),
    meta,
    script: {
      file: scriptInfo, sections: sectionCount, sectionsInfo: fileInfo(ws, "03-voiceover/sections/index.ts"),
      idea: readText(path.join(d, "02-scripting/idea.md")), ideaInfo: fileInfo(ws, "02-scripting/idea.md"),
      feedback: readText(path.join(d, "02-scripting/feedback.md")), notes: readText(path.join(d, "02-scripting/script_notes.md")),
      approval: approvalState(ws), approvedAt: readJson<any>(path.join(d, "02-scripting/approved.json"))?.at ?? null,
      words: spokenWords(readText(path.join(d, "02-scripting/script_raw.md"))),
    },
    runs: (readJson<any[]>(path.join(d, "dashboard_runs.json")) ?? []).slice(-80),
    totals: { ms: rows.reduce((a, r) => a + (r.ms ?? 0), 0), costUsd: rows.reduce((a, r) => a + (r.costUsd ?? 0), 0) },
    voice: { parts: voiceParts, combined, sectionCount, freshWavs, running: !!voiceSince },
    align: { master: fileInfo(ws, "06-audio/voiceover_master.wav"), words: captions?.length ?? null, durationMs: captions?.length ? captions[captions.length - 1].endMs : null, chapters: chapters ?? [] },
    plan: { file: fileInfo(ws, "05-video/acts.json"), logline: plan?.treatment?.logline ?? null, acts, unverified },
    acts: actRows,
    sound: { files: soundFiles, stems, events: events?.length ?? null, musicPlan: fileInfo(ws, "06-audio/music_plan.json"), credits },
    render: { videos, qc, manifest },
    timings: rows,
    jobs: (jobsByWs.get(ws) ?? []).map((j) => jobs.get(j)).filter(Boolean).map((j) => jobSummary(j!)),
    lastRuns: last,
    studio: studioState(),
  };
}

// ───────────────────────────── files ─────────────────────────────

/** Resolve a workspace-relative path, refusing anything that escapes the workspace (incl. symlinks). */
function safePath(ws: string, rel: string | null): string | null {
  if (!rel || rel.includes("\0") || path.isAbsolute(rel)) return null;
  const parts = rel.split(/[\\/]+/);
  if (parts.some((p) => p === ".." || p.startsWith(".") || p === "node_modules")) return null;
  const root = fs.realpathSync(wsDir(ws));
  const abs = path.resolve(root, rel);
  if (!abs.startsWith(root + path.sep)) return null;
  let real: string;
  try { real = fs.realpathSync(abs); } catch { return null; }
  if (!real.startsWith(root + path.sep)) return null;
  return real;
}

function serveFile(req: Request, abs: string): Response {
  const file = Bun.file(abs);
  const size = file.size;
  const ext = path.extname(abs).toLowerCase();
  const safeType = [".html", ".htm", ".svg", ".xml", ".js", ".mjs"].includes(ext) ? "text/plain; charset=utf-8" : file.type;
  const headers: Record<string, string> = {
    "accept-ranges": "bytes",
    "content-type": safeType,
    "x-content-type-options": "nosniff",
    "content-security-policy": "sandbox",
    "cache-control": "no-cache",
  };
  const range = req.headers.get("range");
  if (range) {
    const m = range.match(/^bytes=(\d*)-(\d*)$/);
    if (!m || (!m[1] && !m[2])) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    let start: number, end: number;
    if (!m[1]) { start = Math.max(0, size - parseInt(m[2], 10)); end = size - 1; }
    else { start = parseInt(m[1], 10); end = m[2] ? Math.min(parseInt(m[2], 10), size - 1) : size - 1; }
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    return new Response(file.slice(start, end + 1), { status: 206, headers: { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1) } });
  }
  return new Response(file, { headers: { ...headers, "content-length": String(size) } });
}


// ───────────────────────────── settings + limits ─────────────────────────────

/** Files the Settings page may edit: exactly these globs, nothing else. */
const SETTINGS_FILE = /^(workflow\/prompts\/[\w.-]+\.md|workflow\/styles\/[\w-]+\/(STYLE|ACT)\.md|workflow\/02-scripting\/voice\.md)$/;
function settingsFiles(): string[] {
  const out: string[] = [];
  for (const f of ls(path.join(REPO, "workflow/prompts"), /\.md$/)) out.push(`workflow/prompts/${f}`);
  for (const d of ls(path.join(REPO, "workflow/styles"))) for (const f of ["STYLE.md", "ACT.md"]) if (exists(path.join(REPO, "workflow/styles", d, f))) out.push(`workflow/styles/${d}/${f}`);
  if (exists(path.join(REPO, "workflow/02-scripting/voice.md"))) out.push("workflow/02-scripting/voice.md");
  return out.filter((f) => SETTINGS_FILE.test(f));
}
function settingsPath(rel: string | null): string | null {
  if (!rel || !SETTINGS_FILE.test(rel)) return null;
  const abs = path.join(REPO, rel);
  try { if (!fs.realpathSync(abs).startsWith(fs.realpathSync(REPO) + path.sep)) return null; } catch { return null; }
  return abs;
}

const SECRET = /KEY|TOKEN|SECRET|PASSWORD|PASSWD|API/i;
function readEnvLines() { return parseEnv(exists(ENV_FILE) ? fs.readFileSync(ENV_FILE, "utf-8") : ""); }
function envView() {
  const lines = readEnvLines();
  const have = new Set<string>();
  const entries = lines.flatMap((l, i) => {
    if (!l.key) return [];
    have.add(l.key);
    const secret = SECRET.test(l.key);
    return [{ key: l.key, secret, set: (l.value ?? "") !== "", value: secret ? null : l.value ?? "", help: helpFor(lines, i) }];
  });
  // keys the example file documents (active or commented out) that this file does not set yet
  const exFile = path.join(REPO, ".env.example");
  const suggested = exists(exFile)
    ? [...new Set([...fs.readFileSync(exFile, "utf-8").matchAll(/^\s*#?\s*([A-Z][A-Z0-9_]{2,})=/gm)].map((m) => m[1]))].filter((k) => !have.has(k))
    : [];
  return { entries, suggested };
}

/** Claude Code's status-line JSON (written by ~/.claude/wealthgap/statusline.sh): plan limits as % used + reset time. */
function limits() {
  let st: fs.Stats;
  try { st = fs.statSync(LIMITS_FILE); } catch { return { five_hour: null, seven_day: null, updatedAt: null }; }
  const rl = readJson<any>(LIMITS_FILE)?.rate_limits ?? {};
  const pick = (x: any) => (x && typeof x.used_percentage === "number" ? { used_percentage: x.used_percentage, resets_at: typeof x.resets_at === "number" ? x.resets_at : null } : null);
  return { five_hour: pick(rl.five_hour), seven_day: pick(rl.seven_day), updatedAt: st.mtimeMs };
}

// ───────────────────────────── web app (workflow/dashboard/web/dist) ─────────────────────────────

/** Static files of the built React app; any other GET falls back to index.html (client-side routing). */
function serveWeb(req: Request, p: string): Response {
  if (req.method !== "GET" && req.method !== "HEAD") return bad("not found", 404);
  const index = path.join(DIST, "index.html");
  if (!exists(index)) return new Response("Dashboard UI is not built. Run: bun run dashboard (builds it) or bun run --cwd workflow/dashboard/web build", { status: 503 });
  let rel: string;
  try { rel = decodeURIComponent(p); } catch { return bad("bad path"); }
  const abs = path.resolve(DIST, "." + rel);
  if (abs.startsWith(DIST + path.sep) && exists(abs) && fs.statSync(abs).isFile()) {
    const hashed = rel.startsWith("/assets/");
    return new Response(Bun.file(abs), { headers: { "cache-control": hashed ? "public, max-age=31536000, immutable" : "no-cache" } });
  }
  return new Response(Bun.file(index), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

// ───────────────────────────── routes ─────────────────────────────

function listWorkspaces() {
  return ls(WS_ROOT)
    .filter((f) => WS_ID.test(f) && fs.statSync(path.join(WS_ROOT, f)).isDirectory())
    .map((id) => {
      const rows = timingsFor(id);
      return { id, statuses: stepStatuses(id), running: runningJob(id) ? jobSummary(runningJob(id)!) : null, title: readJson(path.join(wsDir(id), "05-video/acts.json"))?.video?.title ?? null,
        totals: { ms: rows.reduce((a, r) => a + (r.ms ?? 0), 0), costUsd: rows.reduce((a, r) => a + (r.costUsd ?? 0), 0) } };
    });
}

/** Blocks cross-site requests and DNS rebinding: Host must be ours; writes need a custom header (forces CORS preflight). */
function guard(req: Request): Response | null {
  const host = req.headers.get("host") ?? "";
  const names = ["127.0.0.1", "localhost", ...(HOST === "127.0.0.1" ? [] : [...lanIps(), `${os.hostname().replace(/\.local$/, "")}.local`])];
  if (!names.some((n) => host.toLowerCase() === `${n.toLowerCase()}:${PORT}`)) return bad("bad host", 403);
  if (req.method !== "GET" && req.method !== "HEAD" && req.headers.get("x-wg") !== "1") return bad("missing x-wg header", 403);
  return null;
}

async function body(req: Request): Promise<any> {
  try { return await req.json(); } catch { return {}; }
}

function logStream(job: Job): Response {
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
function lastLogBlock(ws: string, step: string): string {
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

const server = Bun.serve({
  hostname: HOST,
  port: PORT,
  idleTimeout: 0,
  async fetch(req) {
    const url = new URL(req.url);
    const p = url.pathname;
    const g = guard(req);
    if (g) return g;

    if (p === "/api/workspaces" && req.method === "GET") return json({ workspaces: listWorkspaces(), studio: studioState() });
    if (p === "/api/schema" && req.method === "GET") return json(schema());
    if (p === "/api/system" && req.method === "GET") {
      want();
      if (!history.length || Date.now() - history[history.length - 1].t > 2500) sample();
      return json({ machine: machine(), now: history[history.length - 1], history: history.slice(-150), top: topProcs(8) });
    }
    if (p === "/api/activity" && req.method === "GET") {
      const all = [...jobs.values()].sort((a, b) => b.startedAt - a.startedAt).slice(0, 40).map(jobSummary);
      return json({ jobs: all, studio: studioState() });
    }
    if (p === "/api/usage" && req.method === "GET") {
      const rows = listWorkspaces().flatMap((w) => timingsFor(w.id).map((r) => ({ ws: w.id, ...r })));
      await refreshUsage(url.searchParams.has("refresh"));
      return json(usageReport(rows));
    }
    if (p === "/api/limits" && req.method === "GET") return json(limits());

    if (p === "/api/settings/env") {
      if (req.method === "GET") {
        const reveal = url.searchParams.get("reveal");
        if (reveal) {
          if (!KEY_RE.test(reveal)) return bad("bad key");
          return json({ value: readEnvLines().find((l) => l.key === reveal)?.value ?? "" });
        }
        return json({ file: path.basename(ENV_FILE), exists: exists(ENV_FILE), ...envView() });
      }
      if (req.method === "PUT") {
        const b = await body(req);
        let lines = readEnvLines();
        try {
          for (const [k, v] of Object.entries(b.set && typeof b.set === "object" ? b.set : {})) { if (typeof v !== "string") return bad(`${k}: value must be text`); lines = setEnv(lines, k, v); }
          for (const k of Array.isArray(b.remove) ? b.remove : []) { if (!KEY_RE.test(String(k))) return bad("bad key"); lines = removeEnv(lines, String(k)); }
        } catch (e: any) { return bad(e.message); }
        atomicWrite(ENV_FILE, serializeEnv(lines));
        return json({ ok: true, ...envView() });
      }
    }

    if (p === "/api/settings/files" && req.method === "GET") return json({ files: settingsFiles().map((f) => ({ path: f, mtime: mtime(path.join(REPO, f)) })) });
    if (p === "/api/settings/file") {
      const abs = settingsPath(url.searchParams.get("path"));
      if (!abs) return bad("path not allowed", 403);
      if (req.method === "GET") return new Response(exists(abs) ? Bun.file(abs) : "", { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
      if (req.method === "PUT") {
        const text = await req.text();
        if (text.length > 500_000) return bad("file too large");
        if (exists(abs)) fs.copyFileSync(abs, `${abs}.prev`);   // one-step undo; the name does not match the allowlist
        atomicWrite(abs, text);
        return json({ ok: true, mtime: mtime(abs) });
      }
    }

    const bm = p.match(/^\/brand\/(Logo|Banner|WaterMark)\.png$/);
    if (bm && req.method === "GET") return new Response(Bun.file(path.join(REPO, "brand-assets", `${bm[1]}.png`)), { headers: { "content-type": "image/png", "cache-control": "max-age=3600" } });

    if (p === "/api/workspaces" && req.method === "POST") {
      const { id } = await body(req);
      if (typeof id !== "string" || !WS_ID.test(id)) return bad("ID must match VID<n>_<Name> (letters, digits, underscores)");
      if (exists(wsDir(id))) return bad("workspace already exists", 409);
      if (runningJob(id)) return bad("already being created", 409);
      const job = startJob(id, "new-video", `New video ${id}`, [B("new-video", id)]);
      return json({ job: jobSummary(job) });
    }

    if (p === "/api/studio/stop" && req.method === "POST") {
      if (studio?.pid) killTree(studio.pid);
      return json({ ok: true });
    }

    const m = p.match(/^\/api\/ws\/([^/]+)(\/.*)?$/);
    if (!m) return p.startsWith("/api/") || p.startsWith("/brand/") ? bad("not found", 404) : serveWeb(req, p);
    const ws = decodeURIComponent(m[1]);
    const rest = m[2] ?? "";
    if (!WS_ID.test(ws)) return bad("bad workspace id");

    // logs can be read for a job that is still creating its workspace
    const lm = rest.match(/^\/log\/(\w+)$/);
    if (lm && req.method === "GET") {
      const job = jobs.get(lm[1]);
      if (!job || job.ws !== ws) return bad("no such job (server restarted?)", 404);
      if (url.searchParams.get("plain")) return new Response(job.text, { headers: { "content-type": "text/plain; charset=utf-8" } });
      return logStream(job);
    }

    if (!validWs(ws)) return bad("no such workspace", 404);

    if (rest === "/status" && req.method === "GET") return json(details(ws));

    if (rest === "/log" && req.method === "GET") {
      const step = url.searchParams.get("step") ?? "";
      return new Response(lastLogBlock(ws, step), { headers: { "content-type": "text/plain; charset=utf-8" } });
    }

    if (rest === "/run" && req.method === "POST") {
      const { action, act, opts } = await body(req);
      if (typeof action !== "string") return bad("action required");
      const busy = runningJob(ws);
      if (busy) return bad(`busy: ${busy.label} is running`, 409);
      const o = opts && typeof opts === "object" && !Array.isArray(opts) ? opts : {};
      const c = commandFor(ws, action, o, typeof act === "string" ? act.toUpperCase() : undefined);
      if (typeof c === "string") return bad(c);
      return json({ job: jobSummary(startJob(ws, c.key, c.label, c.cmds, o)) });
    }

    if (rest === "/stop" && req.method === "POST") {
      const j = runningJob(ws);
      if (!j) return bad("nothing running", 404);
      j.stopRequested = true;
      if (j.pid) killTree(j.pid);
      setTimeout(() => { if (j.status === "running" && j.pid) killTree(j.pid, "SIGKILL"); }, 5000);
      return json({ ok: true });
    }

    // the creator's text files: draft, feedback on the last script, the script itself
    const tm = rest.match(/^\/text\/(idea|feedback)$/);
    if (tm && req.method === "PUT") {
      const text = await req.text();
      if (text.length > 1_000_000) return bad("too large");
      const f = path.join(wsDir(ws), `02-scripting/${tm[1]}.md`);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, text, "utf-8");
      return json({ ok: true });
    }

    if (rest === "/script") {
      const f = path.join(wsDir(ws), "02-scripting/script_raw.md");
      if (req.method === "GET") return new Response(exists(f) ? Bun.file(f) : "", { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
      if (req.method === "PUT") {
        const text = await req.text();
        if (text.length > 1_000_000) return bad("script too large");
        if (runningJob(ws)?.step === "script") return bad("format is running", 409);
        fs.mkdirSync(path.dirname(f), { recursive: true });
        if (exists(f)) fs.copyFileSync(f, f.replace(/\.md$/, ".prev.md"));
        fs.writeFileSync(f, text, "utf-8");
        return json({ ok: true, file: fileInfo(ws, "02-scripting/script_raw.md") });
      }
    }

    const nm = rest.match(/^\/notes\/(A\d{2,3})$/);
    if (nm && req.method === "PUT") {
      if (!actIds(ws).includes(nm[1])) return bad("unknown act");
      const text = await req.text();
      if (text.length > 200_000) return bad("notes too large");
      const f = path.join(wsDir(ws), notesRel(nm[1]));
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, text, "utf-8");
      return json({ ok: true });
    }

    if (rest === "/studio" && req.method === "POST") {
      if (studio && studio.exited === null) return bad(studio.ws === ws ? "studio already running" : `studio is running for ${studio.ws}; stop it first`, 409);
      if (!exists(path.join(wsDir(ws), "05-video/src/index.ts"))) return bad("no 05-video/src/index.ts yet (run an act or assemble first)");
      return json({ studio: (startStudio(ws), studioState()) });
    }

    if (rest === "/file" && (req.method === "GET" || req.method === "HEAD")) {
      const abs = safePath(ws, url.searchParams.get("path"));
      if (!abs) return bad("path rejected", 403);
      if (!fs.statSync(abs).isFile()) return bad("not a file", 404);
      return serveFile(req, abs);
    }

    return bad("not found", 404);
  },
});

console.log(`🎛  WealthGap dashboard on http://${HOST}:${server.port}`);
if (HOST !== "127.0.0.1") {
  for (const ip of lanIps()) console.log(`   on your network: http://${ip}:${server.port}  (no login: home network only)`);
}
if (NTFY_TOPIC) console.log(`   notifications: ntfy.sh/${NTFY_TOPIC}`);
if (MAC_NOTIFY) console.log(`   notifications: this Mac (MAC_NOTIFY=0 to turn off)`);

function shutdown() {
  if (studio?.pid) killTree(studio.pid);
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
