/**
 * Local control room for the video pipeline: one page to pick a workspace, edit the script,
 * run each step, watch its log, and see/hear what it produced.
 *
 * Usage: bun run dashboard [--port 4600] [--host 0.0.0.0] [--public]
 *   binds 127.0.0.1 unless --host is given; --host 0.0.0.0 opens it to the local network (no login: home network only)
 *   --public (bun run dashboard:public): also serves the app with a password (PWA_PASS in .env) on 127.0.0.1:<port+1>
 *   and publishes that port on the internet with Tailscale Funnel; prints the link and a QR code (public.ts)
 *   NTFY_TOPIC=<topic> sends a phone notification (ntfy.sh app) when a job ends (PHONE_NOTIFY=0 turns it off)
 *   on macOS a desktop notification is shown too (MAC_NOTIFY=0 turns it off)
 *   Both switches live in Settings → Notifications and are re-read from .env at every job end (no restart needed).
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
import { dawInfo, dawRoute, stopDaw, type DawCtx } from "./daw";
import { analyticsRoute, type AnalyticsCtx } from "./analytics";
import { allSpecs, catalog, parseSpec, readDefaults, roleModel, writeDefault, PROVIDERS, ROLES, type RoleKey } from "../lib/models";
import * as pub from "../07-publish/lib";
import * as sh from "../08-shorts/lib";
import { publicHandler, readPass, startFunnel, stopFunnel, qr } from "./public";
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
const PUBLIC = process.argv.includes("--public");
const PUBLIC_PORT = PORT + 1;
/** Requests that came in through the password-protected public port (public.ts); guard() skips its Host check for them. */
const viaPublic = new WeakSet<Request>();
let publicUrl: string | null = null;
/** This machine's own IPv4 addresses on the network (the Host a phone at home uses with --host). */
const lanIps = () => Object.values(os.networkInterfaces()).flat().filter((n) => n && n.family === "IPv4" && !n.internal).map((n) => n!.address);

/** VID<n>_<Name> = a long video (+ its shorts); SH<n>_<Name> = a shorts project (shorts only, written from a brief). */
const WS_ID = sh.PROJECT_ID;
/** "shorts" for a shorts project: the dashboard shows only its Overview and Shorts. */
const kindOf = (ws: string): "video" | "shorts" => (sh.isShortsProject(ws) ? "shorts" : "video");
/** A shorts project's name: the brief's first heading. */
const briefTitle = (ws: string) => readText(sh.briefPath(ws)).match(/^#\s+(.+)$/m)?.[1]?.trim() || null;
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
  /** what the job writes: "act:A03" for one act's jobs, "*" for the whole video. Jobs whose locks overlap never run together. */
  locks: string[];
  stats: { n: number; cpuSum: number; cpuPeak: number; rssPeak: number; gpuSum: number; gpuN: number; gpuPeak: number; cur: { cpu: number; rssMB: number; top: string[] } | null };
}

const jobs = new Map<string, Job>(); // jobId → job
const jobsByWs = new Map<string, string[]>(); // ws → jobIds (newest last)
let jobSeq = 0;
const enc = new TextEncoder();

/** The first running job of a video (any), see runningJobs for all of them. */
function runningJob(ws: string): Job | undefined {
  return runningJobs(ws)[0];
}
function runningJobs(ws: string): Job[] {
  return (jobsByWs.get(ws) ?? []).map((jid) => jobs.get(jid)).filter((j): j is Job => j?.status === "running");
}
/** Locks overlap when either takes the whole video ("*") or both write the same act. */
const lockClash = (a: string[], b: string[]) => a.includes("*") || b.includes("*") || a.some((x) => b.includes(x));
/** The running job a new job with these locks would clash with, if any. */
function clashWith(ws: string, locks: string[]): Job | undefined {
  return runningJobs(ws).find((j) => lockClash(j.locks, locks));
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
    ms: (j.endedAt ?? Date.now()) - j.startedAt, cmd: j.cmds[j.cmdIndex]?.join(" "), cmds: j.cmds.map((c) => c.join(" ")), cmdIndex: j.cmdIndex, cmdCount: j.cmds.length, opts: j.opts, locks: j.locks, stats: jobStats(j) };
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

/** Notification switches, read from .env each time (Settings → Notifications edits it), falling back to the process env. */
function notifyCfg() {
  const env = new Map(readEnvLines().map((l) => [l.key, l.value ?? ""]));
  const get = (k: string) => env.get(k) ?? process.env[k] ?? "";
  const topic = get("NTFY_TOPIC");
  return { macAvailable: process.platform === "darwin", mac: process.platform === "darwin" && get("MAC_NOTIFY") !== "0", phone: !!topic && get("PHONE_NOTIFY") !== "0", topic };
}

/** Send to the enabled channels (or only `only`). Best effort, never throws. */
function notify(title: string, body: string, ok: boolean, icon: string, only?: "mac" | "phone") {
  const c = notifyCfg();
  if (c.mac && only !== "phone") {
    // title/body go in as argv, so no AppleScript quoting is needed
    try {
      Bun.spawn(["osascript", "-e", "on run argv", "-e", `display notification (item 2 of argv) with title (item 1 of argv) sound name "${ok ? "Glass" : "Basso"}"`, "-e", "end run", title, body],
        { stdin: "ignore", stdout: "ignore", stderr: "ignore" });
    } catch {}
  }
  if (c.phone && only !== "mac") fetch(`https://ntfy.sh/${encodeURIComponent(c.topic)}`, { method: "POST", headers: { Title: title, Tags: icon }, body }).catch(() => {});
}

/** When a job ends: a macOS notification and a phone one through ntfy.sh, each if switched on. */
function notifyEnd(j: Job) {
  const min = Math.round(((j.endedAt ?? Date.now()) - j.startedAt) / 60000);
  const icon = j.status === "done" ? "white_check_mark" : j.status === "stopped" ? "stop_sign" : "x";
  notify(`${j.ws}: ${j.label} ${j.status}`, `${j.step} ${j.status} after ${min} min${j.status === "failed" ? ` (exit ${j.exitCode})` : ""}`, j.status === "done", icon);
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

function startJob(ws: string, step: string, label: string, cmds: string[][], opts: Record<string, any> = {}, locks: string[] = ["*"]): Job {
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
const voiceReviewPath = (ws: string) => path.join(wsDir(ws), "03-voiceover/review.json");
/** Master voice: options not given fall back to the last run's (06-audio/master.json), like Speed & gaps does. */
function masterOpts(ws: string, o: Record<string, any>): Record<string, any> {
  const last = readJson<any>(path.join(wsDir(ws), "06-audio/master.json"))?.options ?? {};
  const pick = (k: string) => (o[k] !== undefined && o[k] !== "" ? o[k] : last[k]);
  return { targetLufs: pick("targetLufs"), highpass: pick("highpass"), deess: pick("deess"), ratio: pick("ratio"), threshold: pick("threshold"), noRoomTone: o.noRoomTone ?? (last.roomTone === false) };
}

/** One option of an action. The client renders a control per option; the server validates and maps it to argv. */
interface Opt {
  key: string; label: string; help?: string;
  type: "select" | "number" | "bool" | "text" | "multi";
  choices?: string[]; def?: string | number | boolean | string[];
  min?: number; max?: number; step?: number;
  /** never remembered between sessions: always starts at its default (destructive switches) */
  volatile?: boolean;
  /** argv for a value (bool: only when true) */
  flag?: string; map?: (v: any) => string[];
  /** model picker for this agent step: choices = "default" + every model the step can use (dynamic) */
  role?: RoleKey;
  /** only shown (and only passed) while another option has one of these values, e.g. Gemini's voice while engine = gemini */
  when?: { key: string; in: string[] };
}
interface Action {
  step: string; label: string; help: string;
  paid?: string;           // e.g. "~$3"
  perAct?: boolean;        // needs an act id
  perShort?: boolean;      // needs a short id (S1..), passed as the act; must be in the video's shorts
  variant?: boolean;       // needs a thumbnail variant (A/B/C), passed as the act
  long?: string;           // typical duration
  opts?: Opt[];
  /** Master buttons: the commands this action runs, in order (same order as build()). `action` = another button that runs that command alone. */
  chain?: { label: string; action?: string }[];
  build: (ws: string, o: Record<string, any>, act?: string) => string[][] | string;
}
const styles = () => ls(path.join(REPO, "workflow/styles")).filter((d) => exists(path.join(REPO, "workflow/styles", d, "STYLE.md")));

/** Final render: resolution (upscaled above 1080p) and which audio goes in the file. */
const TABS_OPT: Opt = { key: "concurrency", label: "Parallel render tabs", help: "auto = half the CPU cores; fewer uses less memory (if a render crashes) but takes longer", type: "select", choices: ["auto", "2", "3", "4", "6"], def: "auto", flag: "--concurrency",
  map: (v) => (v === "auto" ? [] : ["--concurrency", String(v)]) };
/** The draft inside a chain gets the same tab count (validated against the choices). */
const tabs = (o: Record<string, any>): string[] => { const v = String(o.concurrency ?? "auto"); if (!TABS_OPT.choices!.includes(v)) throw new Error(`Parallel render tabs: "${v}" is not offered`); return TABS_OPT.map!(v as any); };
const FINAL_OPTS: Opt[] = [
  { key: "res", label: "Resolution", help: "1440p and 4K are upscaled from the 1080p render", type: "select", choices: ["1080", "1440", "2160"], def: "1080", flag: "--res" },
  { key: "audio", label: "Audio", help: "mix = voice + foley (+ music if mixed in); none skips QC's loudness check", type: "select", choices: ["mix", "voice", "none"], def: "mix", flag: "--audio" },
  TABS_OPT,
];

/** Voice (03-voiceover): Qwen3-TTS clones the channel voice (voices/ACTIVE) locally; Gemini is optional cloud TTS. */
const GEMINI_VOICES = ["Algenib", "Charon", "Orus", "Iapetus", "Fenrir", "Enceladus", "Alnilam", "Schedar", "Rasalgethi", "Sadaltager", "Gacrux", "Kore", "Puck", "Zephyr", "Leda", "Aoede", "Autonoe", "Callirrhoe", "Despina", "Erinome", "Laomedeia", "Achernar", "Pulcherrima", "Achird", "Zubenelgenubi", "Vindemiatrix", "Sadachbia", "Sulafat", "Umbriel", "Algieba"];
const GEMINI_ONLY = { key: "engine", in: ["gemini"] };
const VOICES = path.join(REPO, "workflow/03-voiceover/voices");
const activeVoice = () => { try { return fs.readFileSync(path.join(VOICES, "ACTIVE"), "utf-8").trim(); } catch { return ""; } };
/** Cloneable voices (picked reference), read on every schema/run so new ones show up without a restart. */
const voiceProfiles = () => ["channel voice", ...ls(VOICES).filter((d) => exists(path.join(VOICES, d, "reference.wav"))), ...(exists(path.join(REPO, "workflow/03-voiceover/voice_profile/reference.wav")) ? ["legacy"] : [])];
const geminiDesigned = () => ls(VOICES).filter((d) => exists(path.join(VOICES, d, "gemini.json")));
/** Models a step can use: write steps skip providers that cannot edit files. */
const roleChoices = (role: RoleKey) => ["default", ...allSpecs().filter((s) => !ROLES[role].edits || PROVIDERS[parseSpec(s).provider].edits), ...(role === "critic" ? ["off"] : [])];
/** Music & beat: keep the chosen track, no track, or any library track (assets/music/index.json). */
const beatTracks = () => { try { return ["keep", "none", ...JSON.parse(fs.readFileSync(path.join(REPO, "assets/music/index.json"), "utf-8")).tracks.map((t: any) => String(t.file))]; } catch { return ["keep", "none"]; } };
const dynChoices = (o: Opt) => (o.role ? roleChoices(o.role) : o.key === "beatTrack" ? beatTracks() : o.key === "voiceProfile" ? voiceProfiles() : o.key === "voice" ? [...geminiDesigned(), ...GEMINI_VOICES] : o.choices);
const dynHelp = (o: Opt) => (o.role ? `default = ${roleModel(o.role)} (Settings → Models)` : o.help);
const ENGINE_OPTS: Opt[] = [
  { key: "engine", label: "Engine", help: "gemini: Google voices, each block read whole with its tone note as direction (free tier with an AI Studio key) · qwen: local, free, the cloned channel voice. Default: TTS_ENGINE in .env", type: "select", choices: ["gemini", "qwen"], def: process.env.TTS_ENGINE?.trim() === "qwen" ? "qwen" : "gemini", map: (v) => ["--engine", v] },
  { key: "voiceProfile", label: "Voice", help: "channel voice = voices/ACTIVE (bun run voice:use); others for a test", type: "select", choices: ["channel voice"], def: "channel voice", map: (v) => (v === "channel voice" ? [] : ["--voice-profile", v]), when: { key: "engine", in: ["qwen"] } },
  { key: "voice", label: "Gemini voice", type: "select", choices: GEMINI_VOICES, def: "Algenib", flag: "--voice", when: GEMINI_ONLY },
  { key: "parallel", label: "Requests at once", help: "Gemini passages generated in parallel (lower it if you hit rate limits)", type: "number", min: 1, max: 12, step: 1, flag: "--parallel", when: GEMINI_ONLY },
  { key: "geminiModel", label: "Gemini model", type: "select", choices: ["gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts", "gemini-2.5-pro-tts", "gemini-3.1-flash-tts-preview"], def: "gemini-3.8-flash-tts", flag: "--gemini-model", when: GEMINI_ONLY },
];

/** A model picker tied to an agent step (workflow/lib/models.ts): "default" = Settings → Models; every discovered model otherwise. */
/** Align all (merge → transcribe → master with the last used settings → captions → move the plan → pause points). */
function alignAll(ws: string, o: Record<string, any> = {}) {
  return [B("tts:post", "--video", ws), B("transcribe", "--video", ws), B("audio:master", "--video", ws, ...args(masterOpts(ws, {}), "align.master")), B("captions", "--video", ws), B("voice:holds", "--video", ws, "--shift-plan"), B("replan", "--video", ws, "--auto"), B("voice:holds", "--video", ws, "--scan")];
}
function modelOpt(role: RoleKey, label: string, flag: string, key = "model"): Opt {
  return { key, label, type: "select", choices: ["default"], def: "default", role, map: (v) => (v === "default" ? [] : [flag, v]) };
}
const CRITIC_OPT: Opt = { ...modelOpt("critic", "Critic", "--critic", "critic"), map: (v) => (v === "off" ? ["--no-critic"] : v === "default" ? [] : ["--critic", v]) };

/** Mix options shared by Mix and Apply SFX edits (long video). */
const SOUND_MIX_OPTS: Opt[] = [
  { key: "withMusic", label: "Include music", type: "bool", def: false, flag: "--with-music" },
  { key: "duckDb", label: "Music duck (dB)", type: "number", min: -30, max: 0, step: 1, flag: "--duck-db" },
  { key: "musicDb", label: "Music level (dB)", type: "number", min: -30, max: 6, step: 1, flag: "--music-db" },
  { key: "foleyDb", label: "Foley level (dB)", type: "number", min: -20, max: 10, step: 1, flag: "--foley-db" },
  { key: "noLib", label: "Procedural foley only", type: "bool", def: false, flag: "--no-lib" },
];

const SHORT_STAGES = ["voice", "align", "beat", "plan", "act", "sound", "draft", "render"] as const;

const ACTIONS: Record<string, Action> = {
  "script.research": {
    step: "script", label: "Research", help: "Optional, before Write script (or Write shorts in a shorts project): the researcher picks the claims and figures in your idea that need a source, searches the web for each (no shell commands, web only), and returns facts with their link and a sentence quoted from the page, plus a check of your idea's claims. Then the program opens every page and marks a fact ✓ only if that sentence is really there. Saved to 02-scripting/research.md (edit it freely); the script writer, the director and the shorts writer use the ✓ facts as sources.",
    paid: "free with agy (Claude: ~$0.5–2)", long: "~5–20 min",
    opts: [
      { key: "focus", label: "Focus", help: "optional: what to dig into, e.g. the latest Nvidia earnings and hyperscaler capex", type: "text", flag: "--focus" },
      { key: "max", label: "Questions", help: "how many claims and figures to research (one web search each, ~1–2 min each on agy)", type: "number", min: 1, max: 15, step: 1, def: 8, flag: "--max" },
      modelOpt("researcher", "Model", "--model"),
    ],
    build: (ws, o) => (sh.briefWritten(ws) ? [B("research", "--video", ws, ...args(o, "script.research"))] : sh.isShortsProject(ws) ? "write the brief first" : "write your draft (idea.md) first"),
  },
  "script.research.verify": { step: "script", label: "Re-check sources", help: "Opens every source page again and re-marks each fact (✓ quote found, ~ numbers only, ✗ not there, ? page unreadable). Free, no model.", long: "seconds",
    build: (ws) => (exists(path.join(wsDir(ws), "02-scripting/research.json")) ? [B("research", "--video", ws, "--verify")] : "run Research first") },
  "script.write": {
    step: "script", label: "Write script", help: "Turns your draft (idea.md) into a chunked, hook-scored script with on-screen hints. With feedback.md newer than the script, it revises instead.",
    paid: "~$1–2", long: "3–6 min",
    opts: [
      modelOpt("writer", "Writer model", "--model"),
      { key: "minutes", label: "Target length (min)", type: "number", min: 3, max: 15, step: 0.5, def: 9, flag: "--minutes" },
      { key: "parts", label: "Only revise parts", help: "e.g. 2,4 = rewrite just those parts with your feedback (numbers as in the clean script); every other part stays exactly as it is, so after approval only their lines are voiced again (Apply script changes). Empty = the whole script", type: "text", flag: "--parts" },
    ],
    build: (ws, o) => [B("write", "--video", ws, ...args(o, "script.write"))],
  },
  "script.apply": {
    step: "script", label: "Apply script changes", help: "After you changed an approved script (edited it or revised some parts) and approved it again: split it → voice only the lines that are new or changed (every other take is kept) → Align → move the plan to the new voice. Then Acts → Update changed acts redraws only the acts whose narration changed.", paid: "voice for the changed lines only", long: "~5 min + ~30 s per changed line",
    opts: [...ENGINE_OPTS.filter((x) => x.key !== "parallel"), { key: "takes", label: "Takes per passage", type: "number", min: 1, max: 6, step: 1, flag: "--takes" }],
    chain: [{ label: "Split into sections", action: "script.format" }, { label: "Voice changed lines", action: "voice.sync" }, { label: "Align all", action: "align.all" }, { label: "Update plan", action: "plan.replan" }],
    build: (ws, o) => [B("tts:format", "--video", ws), B("voice:sync", "--video", ws, "--generate", ...args(o, "script.apply")), ...alignAll(ws)],
  },
  "script.approve": { step: "script", label: "Approve script", help: "Locks this exact script for voice generation (any edit afterwards needs a new approval).", build: (ws) => [B("write", "--video", ws, "--approve")] },
  "script.format": {
    step: "script", label: "Split into voice sections", help: "Parses the approved script into voice sections (03-voiceover/sections).", long: "seconds",
    opts: [{ key: "unapproved", label: "Skip approval check", type: "bool", def: false, flag: "--unapproved" }],
    build: (ws, o) => [B("tts:format", "--video", ws, ...args(o, "script.format"))],
  },
  "voice.run": {
    step: "voice", label: "Generate voice", help: "Reads every script block in one call (Gemini with its tone note as direction, or the local Qwen clone); a take is kept once speech recognition finds every word. Speed, gaps and the combined file are set afterwards in Align → Speed & gaps.", long: "Gemini ~2–4 min · Qwen ~1–2 min per min of audio",
    opts: [
      { key: "force", label: "Regenerate existing sections", type: "bool", def: true, flag: "--force" },
      ...ENGINE_OPTS,
      { key: "style", label: "Gemini style", help: "short channel direction (empty = conversational explainer talking to one friend); each section's [VO: tone] note is added. Keep it short: long directions make the voice drift", type: "text", flag: "--style", when: GEMINI_ONLY },
      { key: "temperature", label: "Temperature", help: "lower = steadier, higher = livelier (model default when empty)", type: "number", min: 0.3, max: 1.3, step: 0.05, flag: "--temperature", when: { key: "engine", in: ["qwen"] } },
      { key: "takes", label: "Takes per passage", type: "number", min: 1, max: 6, step: 1, flag: "--takes" },
      { key: "acceptWer", label: "Accept WER", help: "stop early when a take is this accurate", type: "number", min: 0, max: 0.5, step: 0.01, flag: "--accept-wer" },
      { key: "sentenceGap", label: "Passage gap (s)", help: "only between passages of one long block; inside a passage the voice paces itself", type: "number", min: 0, max: 2, step: 0.05, flag: "--sentence-gap" },
      { key: "part", label: "Only part", type: "number", min: 1, max: 30, step: 1, flag: "--part" },
      { key: "section", label: "Only section id", help: "e.g. part2_03_beat", type: "text", flag: "--section" },
    ],
    build: (ws, o) => [B("tts", "--video", ws, ...args(o, "voice.run"))],
  },
  "voice.sync": {
    step: "voice", label: "Voice changed lines only", help: "After the script changed and was split again: keeps every take whose words are unchanged (renamed if lines were added or removed before it), moves takes of deleted lines to audio/stale/, and voices only the new or changed lines. Then run Align.", paid: "the changed lines only", long: "~30 s per line",
    opts: [...ENGINE_OPTS.filter((x) => x.key !== "parallel"), { key: "takes", label: "Takes per passage", type: "number", min: 1, max: 6, step: 1, flag: "--takes" }],
    build: (ws, o) => [B("voice:sync", "--video", ws, "--generate", ...args(o, "voice.sync"))],
  },
  "voice.redo": {
    step: "voice", label: "Regenerate reviewed", help: "Reads the sections in Review again: Gemini gets each section's direction plus your note (\"Fix from the previous take: …\"); the old take is kept to compare. Qwen takes no direction, so a note only buys a fresh take there. Then run Align → Merge so the full voiceover picks it up.", long: "~10–40 s per section",
    opts: [
      ...ENGINE_OPTS.filter((o) => o.key !== "parallel"),
      { key: "takes", label: "Takes per passage", help: "the take whose words best match the script is kept", type: "number", min: 1, max: 6, step: 1, flag: "--takes" },
      { key: "section", label: "Only section id", help: "empty = every section in Review that is waiting for a new take", type: "text", flag: "--section" },
    ],
    build: (ws, o) => {
      const rv = readJson<Record<string, any>>(voiceReviewPath(ws)) ?? {};
      const ids = o.section ? [String(o.section)] : Object.entries(rv).filter(([, r]) => r?.status === "open").map(([id]) => id);
      if (!ids.length) return "nothing to regenerate: add sections to Review (and write what to change)";
      if (ids.some((id) => !/^[\w-]+$/.test(id))) return "bad section id";
      return [B("tts", "--video", ws, "--review", "--force", ...args({ ...o, section: undefined }, "voice.redo"), "--section", ids.join(","))];
    },
  },
  "voice.scan": { step: "voice", label: "Scan for long pauses", help: "Lists every section with its exact TTS direction and finds pauses over 0.9 s inside each take (generation does this too; run it for voices made before).", long: "seconds",
    build: (ws) => [B("voice:scan", "--video", ws)] },
  "align.post": {
    step: "align", label: "Speed & gaps", help: "Speeds the whole voiceover up or down without changing its pitch (rubberband, best quality) and sets the silence between sections and before chapters, then builds the combined voiceover. Always starts from the untouched voice files, so you can re-run with other settings. Empty = the last used setting. Run the rest of Align after it.", long: "~10–30 s",
    opts: [
      { key: "speed", label: "Speed", help: "1 = as generated, 1.1 = 10% faster, 0.95 = 5% slower (pitch unchanged)", type: "number", min: 0.7, max: 1.5, step: 0.01, flag: "--speed" },
      { key: "gap", label: "Gap between sections (s)", help: "silence after each script block", type: "number", min: 0, max: 3, step: 0.05, flag: "--gap" },
      { key: "chapterGap", label: "Chapter pause (s)", help: "silence before a chapter, while its title card shows", type: "number", min: 0, max: 8, step: 0.1, flag: "--chapter-gap" },
      { key: "maxPause", label: "Longest pause inside a section (s)", help: "shortens any silence inside a take to this (a stalled TTS take); 0 = off; empty = last used", type: "number", min: 0, max: 3, step: 0.05, flag: "--max-pause" },
    ],
    build: (ws, o) => [B("tts:post", "--video", ws, ...args(o, "align.post"))],
  },
  "align.all": { step: "align", label: "Align all", help: "Merge (speed & gaps and pauses, last used settings) → transcribe → master → captions (which also writes the .srt) → move the plan's times to the new voice (pauses, speed, or re-voiced lines: acts whose words changed are listed for Update changed acts) → find pause points.", long: "~3 min",
    chain: [{ label: "Merge", action: "align.post" }, { label: "Transcribe", action: "align.transcribe" }, { label: "Master voice", action: "align.master" }, { label: "Build captions", action: "align.captions" }, { label: "Move plan times", action: "plan.replan" }, { label: "Find pause points", action: "align.holdsScan" }],
    build: (ws, o) => [B("tts:post", "--video", ws), B("transcribe", "--video", ws), B("audio:master", "--video", ws, ...args(masterOpts(ws, o), "align.master")), B("captions", "--video", ws), B("voice:holds", "--video", ws, "--shift-plan"), B("replan", "--video", ws, "--auto"), B("voice:holds", "--video", ws, "--scan")] },
  "align.holdsImport": { step: "align", label: "Collect pause requests", help: "Reads the pauses the director asked for (plan) and the ones act authors asked for, places each at the nearest clean pause point (or refuses it) and adds it to the list. Your on/off and lengths are kept.", long: "seconds",
    build: (ws) => [B("voice:holds", "--video", ws, "--scan"), B("voice:holds", "--video", ws, "--import")] },
  "align.holdsScan": { step: "align", label: "Find pause points", help: "Marks every place a pause can go: a sentence or phrase end, or around a joining word, where the take is truly silent (no breath, no word tail).", long: "seconds",
    build: (ws) => [B("voice:holds", "--video", ws, "--scan")] },
  "align.holds": { step: "align", label: "Apply pauses", help: "Merge with the pauses → transcribe → master → captions, then move the plan's act and beat times by the pauses added (your plan approval is kept). Acts time their hits from words, so their code still fits.", long: "~3–4 min",
    chain: [{ label: "Merge with pauses", action: "align.post" }, { label: "Transcribe", action: "align.transcribe" }, { label: "Master voice", action: "align.master" }, { label: "Build captions", action: "align.captions" }, { label: "Move plan times", action: "plan.replan" }, { label: "Find pause points", action: "align.holdsScan" }],
    build: (ws, o) => [B("tts:post", "--video", ws), B("transcribe", "--video", ws), B("audio:master", "--video", ws, ...args(masterOpts(ws, o), "align.master")), B("captions", "--video", ws), B("voice:holds", "--video", ws, "--shift-plan"), B("replan", "--video", ws, "--auto"), B("voice:holds", "--video", ws, "--scan")] },
  "align.transcribe": { step: "align", label: "Transcribe", help: "Word timings from the voiceover (faster-whisper, aligned to the script).", build: (ws) => [B("transcribe", "--video", ws)] },
  "align.master": { step: "align", label: "Master voice", help: "High-pass EQ → de-esser → compressor → room tone → loudness to the YouTube target. Empty = the last used setting. Writes 06-audio/master.json (what it did, loudness before/after).",
    opts: [
      { key: "targetLufs", label: "Loudness target (LUFS)", help: "YouTube normalises to −14", type: "number", min: -24, max: -9, step: 0.5, flag: "--target-lufs" },
      { key: "highpass", label: "High-pass (Hz)", help: "0 = off", type: "number", min: 0, max: 200, step: 5, flag: "--highpass" },
      { key: "deess", label: "De-esser intensity", help: "0 = off", type: "number", min: 0, max: 1, step: 0.05, flag: "--deess" },
      { key: "ratio", label: "Compression ratio", help: "1 = off", type: "number", min: 1, max: 8, step: 0.5, flag: "--ratio" },
      { key: "threshold", label: "Compression threshold (dB)", type: "number", min: -40, max: 0, step: 1, flag: "--threshold" },
      { key: "noRoomTone", label: "No room tone", type: "bool", def: false, flag: "--no-room-tone" },
    ],
    build: (ws, o) => [B("audio:master", "--video", ws, ...args(masterOpts(ws, o), "align.master"))] },
  "align.captions": { step: "align", label: "Build captions", help: "captions.json + chapters.json for the planner; also re-exports the .srt so it always matches the voice.", build: (ws) => [B("captions", "--video", ws)] },
  "plan.run": {
    step: "plan", label: "Plan acts", help: "The director splits the narration into ~10 acts with beats, hits and sourced data.", paid: "~$1.5", long: "~6 min",
    opts: [
      modelOpt("director", "Director model", "--model"),
      { key: "style", label: "House style", type: "select", choices: styles(), def: "briefing", flag: "--style" },
    ],
    build: (ws, o) => [B("direct", "--video", ws, ...args(o, "plan.run"))],
  },
  "plan.replan": { step: "plan", label: "Update plan to the new voice", help: "Free, no model. Moves every act and beat to the current voice by matching its words to the ones the plan was made from (Align runs this itself). Acts whose words didn't change keep their drawing; acts whose narration changed are listed under Acts → Update changed acts. Refuses when more than half the narration changed (plan again then).", long: "seconds",
    build: (ws) => [B("replan", "--video", ws)] },
  "plan.check": { step: "plan", label: "Validate plan", help: "Re-checks acts.json without calling a model.", build: (ws) => [B("direct", "--video", ws, "--check")] },
  "acts.all": {
    step: "acts", label: "Author acts", help: "Writes every act (or the selected ones) that has no file yet.", paid: "~$3 per act", long: "~17 min per act",
    chain: [{ label: "Author each act", action: "acts.act" }],
    opts: [
      { key: "acts", label: "Acts", help: "empty = all missing", type: "multi", choices: [], flag: "--act", map: (v: string[]) => (v.length ? ["--act", v.join(",")] : []) },
      { key: "parallel", label: "In parallel", type: "number", min: 1, max: 4, step: 1, def: 2, flag: "--parallel" },
      modelOpt("actAuthor", "Author model", "--model"),
      CRITIC_OPT,
      { key: "force", label: "Redo acts that exist", type: "bool", def: false, flag: "--force" },
      { key: "strict", label: "Paid fix round on a failed critic", type: "bool", def: false, flag: "--strict" },
      { key: "stopAt", label: "Start no new act at 5-h usage (%)", help: "Claude (default profile) only, read from the status line; empty = never. Running acts always finish", type: "number", min: 10, max: 100, step: 5, def: 90, flag: "--stop-at" },
      { ...modelOpt("actAuthor", "On a usage limit, switch to", "--on-limit", "onLimit"), help: "default = stop: start no new acts. A model here redoes the stopped act and the rest with it (e.g. the other Claude profile)" },
      { key: "models", label: "Per-act models", help: "set in the act list above (A01=claude:sonnet,…)", type: "text", flag: "--models" },
    ],
    build: (ws, o) => [B("act", "--video", ws, ...args(o, "acts.all"))],
  },
  "acts.reviewAll": {
    step: "acts", label: "Review acts", help: "For each picked act: renders its preview (to watch) and runs the reviewer, one act after another. Runs beside authoring: only the picked acts are locked.", long: "~3–8 min per act",
    opts: [
      { key: "acts", label: "Acts", help: "empty = every act that has a file", type: "multi", choices: [], flag: "--act" },
      { key: "preview", label: "Also render previews", type: "bool", def: true, flag: "--preview" },
      modelOpt("actReview", "Reviewer", "--agent", "agent"),
      { key: "give", label: "Give it", type: "multi", choices: ["transcript", "plan", "script", "code"], def: ["transcript", "plan"], map: (v: string[]) => (v.length ? ["--give", v.join(",")] : ["--give", "none"]) },
      { key: "toNotes", label: "Append findings to review notes", type: "bool", def: true, flag: "--to-notes" },
    ],
    build: (ws, o) => {
      const scenes = sceneFiles(ws);
      const picked: string[] = Array.isArray(o.acts) && o.acts.length ? o.acts.map(String) : actIds(ws).filter((id) => scenes[id]);
      const bad = picked.filter((id) => !actIds(ws).includes(id) || !scenes[id]);
      if (bad.length) return `${bad.join(", ")}: no act file to review`;
      if (!picked.length) return "no act has a file yet";
      const rv = args({ ...o, acts: [], preview: false }, "acts.reviewAll");   // reviewer options only
      return picked.flatMap((id) => [...(o.preview !== false ? [B("preview", "--video", ws, "--act", id)] : []), B("review", "--video", ws, "--act", id, ...rv)]);
    },
  },
  "acts.act": {
    step: "acts", perAct: true, label: "Author", help: "Writes this act.", paid: "~$3", long: "~17 min",
    opts: [
      modelOpt("actAuthor", "Author model", "--model"),
      CRITIC_OPT,
      { key: "force", label: "Redo if it exists", type: "bool", def: true, flag: "--force" },
    ],
    build: (ws, o, act) => [B("act", "--video", ws, "--act", act!, ...args(o, "acts.act"))],
  },
  "acts.changed": {
    step: "acts", label: "Update changed acts", help: "Only the acts whose narration a script change rewrote: a drawn act gets one update round (old lines → new lines, keep the rest); an act not drawn yet is authored. Each one leaves the list once done.", paid: "~$2–5 per act", long: "~5–15 min per act",
    opts: [modelOpt("actAuthor", "Author model", "--model"), { key: "parallel", label: "Acts at once", type: "number", min: 1, max: 4, step: 1, def: 2, flag: "--parallel" }],
    build: (ws, o) => [B("act", "--video", ws, "--changed", ...args(o, "acts.changed"))],
  },
  "acts.fix": {
    step: "acts", perAct: true, label: "Fix with notes", help: "Sends the review notes to a fresh author session for one revision: it reads the act file, makes targeted edits and checks the changed times. Put every note for the act in one round. Afterwards the general rules in your notes are learned (a rule that comes up on 2 acts is proposed as a lesson: Analytics → Lessons).", paid: "~$2–4", long: "~3–15 min",
    opts: [modelOpt("actAuthor", "Author model", "--model")],
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
      { key: "only", label: "Only these times (keep the other frames)", help: "renders just the extra times and adds them to the frames already there", type: "bool", def: false, flag: "--only" },
    ],
    build: (ws, o, act) => [B("frames", "--video", ws, "--scene", act!, ...args(o, "acts.frames"))],
  },
  "acts.preview": {
    step: "acts", perAct: true, label: "Render preview", help: "The act as a video with voice + effects, to watch and annotate.", long: "~30 s–2 min",
    opts: [{ key: "scale", label: "Scale", type: "select", choices: ["1", "0.5", "0.25"], def: "1", flag: "--scale", help: "0.5 = 960×540, 0.25 = 480×270: faster renders for checking timing" }],
    build: (ws, o, act) => [B("preview", "--video", ws, "--act", act!, ...args(o, "acts.preview"))],
  },
  "acts.review": {
    step: "acts", perAct: true, label: "Review", help: "An agent checks that the visuals match the voice at each moment and lists fixes.", long: "2–6 min",
    opts: [
      modelOpt("actReview", "Reviewer", "--agent", "agent"),
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
    step: "sound", label: "Music stem", help: "The per-chapter music bed as a separate file. A new music.json takes one track per chapter from your music library (assets/music), else the built-in synth.",
    opts: [
      { key: "reset", label: "Reset music.json", help: "rebuild it (picks tracks from the library again)", type: "bool", def: false, flag: "--reset" },
      { key: "synth", label: "Synth only (ignore the library)", type: "bool", def: false, flag: "--synth" },
      { key: "audition", label: "Render 20 s auditions", type: "bool", def: false, flag: "--audition" },
    ],
    build: (ws, o) => [B("audio:music", "--video", ws, ...args(o, "sound.music"))],
  },
  "sound.library": { step: "sound", label: "Scan music library", help: "Adds new tracks in assets/music/<mood>/ to the library (measures length, BPM and energy) and drops missing ones. Then Music stem with Reset picks from them.", long: "seconds",
    opts: [{ key: "remeasure", label: "Measure every track again", type: "bool", def: false, flag: "--remeasure" }],
    build: (_ws, o) => [B("music:lib", ...args(o, "sound.library"))] },
  "sound.mix": {
    step: "sound", label: "Mix", help: "Voice + foley at −14 LUFS (music is added in post).",
    opts: SOUND_MIX_OPTS,
    build: (ws, o) => [B("audio:mix", "--video", ws, ...args(o, "sound.mix"))],
  },
  "sound.apply": {
    step: "sound", label: "Apply SFX edits", help: "Re-reads the foley edits (sfx_edits.json): cues, then the mix, then a new draft render so you can watch it.", long: "~2–4 min",
    opts: SOUND_MIX_OPTS,
    build: (ws, o) => [B("cues", "--video", ws), B("audio:mix", "--video", ws, ...args(o, "sound.apply")), B("draft", "--video", ws)],
  },
  "sfx.clips": { step: "sound", label: "Build clip previews", help: "One short WAV per foley event (including removed ones) in 06-audio/sfx_clips, so each can be played in the review table.", long: "seconds", build: (ws) => [B("sfx:clips", "--video", ws)] },
  "sfx.clips.short": { step: "shorts", perShort: true, label: "Build clip previews", help: "One short WAV per foley event (including removed ones) of this short, to play in the review table.", long: "seconds", build: (ws, _o, s) => [B("sfx:clips", "--video", sh.shortVideoId(ws, s!))] },
  "daw.build": { step: "sound", label: "Build openDAW project", help: "Voice, every foley event on its own clip and the music stem as one openDAW project (06-audio/daw/project.odb). Rebuilding replaces the project: edits not exported to the video are lost.", long: "~10 s",
    opts: [
      { key: "noMusic", label: "Leave the music stem out", type: "bool", def: false, flag: "--no-music" },
      { key: "noLib", label: "Procedural foley only", type: "bool", def: false, flag: "--no-lib" },
    ],
    build: (ws, o) => [B("daw", "--video", ws, ...args(o, "daw.build"))] },
  "render.assemble": { step: "render", label: "Assemble", help: "Registers every act in the video project.", build: (ws) => [B("assemble", "--video", ws)] },
  "render.seams": { step: "render", label: "Seams", help: "Plans every act-to-act transition (one owner per seam, the neighbours' real frames), renders the frames and a clip around each cut, checks them for flicker, jumps and empty screens, and has the critic review each one. Seams whose two acts did not change are reused, and only seams without a review are reviewed, so a stopped run picks up where it was. Reviews on agy run one at a time (~30–120 s each); the log shows each one.", long: "~2–25 min (less when reused)",
    opts: [{ key: "force", label: "Redo every seam", help: "renders and reviews all seams again, even unchanged ones", type: "bool", def: false, flag: "--force" }],
    build: (ws, o) => [B("seams", "--video", ws, ...args(o, "render.seams"))] },
  "render.seamcheck": { step: "render", perAct: true, label: "Re-check transition", help: "Re-plans the seams, then renders the frames and clip around this act's cut into the next act again and reviews it afresh (free with the default critic).", long: "~1–3 min",
    build: (ws, _o, act) => { const s = seamAfter(ws, act!); return s ? [B("seams", "--video", ws, "--only", s)] : "this act has no next act"; } },
  "render.seamfix": { step: "render", perAct: true, label: "Fix transition", help: "One fix round on the end of this act and/or the start of the next (fresh author session with the review's issues, your note and the frames around the cut), then the transition is checked again.", paid: "~$2–4 per side", long: "~5–20 min",
    opts: [
      { key: "notes", label: "Your note", type: "text", flag: "--notes" },
      { key: "side", label: "Which side", type: "select", choices: ["auto", "a", "b", "both"], def: "auto", flag: "--side" },
    ],
    build: (ws, o, act) => { const s = seamAfter(ws, act!); return s ? [B("seams", "--video", ws, "--fix", s, ...args(o, "render.seamfix"))] : "this act has no next act"; } },
  "render.draft": { step: "render", label: "Draft render", help: "Full video + QC.", long: "~3–5 min",
    opts: [TABS_OPT],
    chain: [{ label: "Assemble", action: "render.assemble" }, { label: "Seams", action: "render.seams" }, { label: "Render draft" }, { label: "QC", action: "render.qc" }], build: (ws, o) => [B("assemble", "--video", ws), B("seams", "--video", ws), B("draft", "--video", ws, ...tabs(o)), B("qc", "--video", ws, "--draft")] },
  "render.final": { step: "render", label: "Final render", help: "H.264 with grain + QC. Acts are drawn at 1080p: 1440p and 4K are a sharp upscale (YouTube streams 4K uploads at a higher bitrate).", long: "~5–10 min (4K: longer)",
    opts: FINAL_OPTS,
    chain: [{ label: "Assemble", action: "render.assemble" }, { label: "Seams", action: "render.seams" }, { label: "Render final" }, { label: "QC", action: "render.qc" }], build: (ws, o) => [B("assemble", "--video", ws), B("seams", "--video", ws), B("render", "--video", ws, ...args(o, "render.final")), ...(o.audio === "none" ? [] : [B("qc", "--video", ws, "--final")])] },
  "render.all": { step: "render", label: "Render all", help: "Assemble, draft render, final render, QC.", long: "~8–15 min",
    chain: [{ label: "Assemble", action: "render.assemble" }, { label: "Seams", action: "render.seams" }, { label: "Render draft" }, { label: "Render final" }, { label: "QC", action: "render.qc" }],
    opts: FINAL_OPTS,
    build: (ws, o) => [B("assemble", "--video", ws), B("seams", "--video", ws), B("draft", "--video", ws, ...tabs(o)), B("render", "--video", ws, ...args(o, "render.all")), ...(o.audio === "none" ? [] : [B("qc", "--video", ws, "--final")])] },
  "render.qc": { step: "render", label: "QC", help: "Hard checks: placeholders, loudness, duration.", build: (ws) => [B("qc", "--video", ws)] },
  "publish.all": {
    step: "publish", label: "Publish all", help: "Titles + description, the three thumbnails, then the thumbnail review. Titles you edited are kept (the metadata step skips them); thumbnails that exist are kept.", paid: "~$1–3", long: "~8–15 min",
    chain: [{ label: "Titles & description", action: "publish.meta" }, { label: "Thumbnails", action: "publish.thumbs" }, { label: "Review", action: "publish.review" }],
    opts: [modelOpt("thumbs", "Model (titles + thumbnails)", "--model"), modelOpt("thumbsReview", "Reviewer", "--agent", "agent")],
    build: (ws, o) => {
      const m = args(o, "publish.all"), pick = (k: string) => (m.includes(k) ? [k, m[m.indexOf(k) + 1]] : []);
      return [B("meta", "--video", ws, ...pick("--model")), B("thumbs", "--video", ws, ...pick("--model")), B("thumbs:review", "--video", ws, ...pick("--agent"), "--to-notes")];
    },
  },
  "publish.meta": {
    step: "publish", label: "Titles & description", help: "Three titles (one per package A/B/C, each with the brief of its thumbnail), the description opening, tags and hashtags. Chapters, sources, credits and limits are computed in code.", paid: "~$0.2–0.5", long: "~30 s",
    opts: [
      modelOpt("meta", "Model", "--model"),
      { key: "notes", label: "Revise with my notes", help: "uses notes/meta.md and keeps what you did not mention", type: "bool", def: false, flag: "--notes" },
      { key: "force", label: "Overwrite my edits", help: "otherwise metadata you edited in the dashboard is kept", type: "bool", def: false, flag: "--force" },
    ],
    build: (ws, o) => [B("meta", "--video", ws, ...args(o, "publish.meta"))],
  },
  "publish.thumbs": {
    step: "publish", label: "Thumbnails", help: "The author designs the three thumbnails as Briefing-kit stills, looks at its own renders, and the images and preview sheets are rendered.", paid: "~$1–3", long: "~5–10 min",
    opts: [
      modelOpt("thumbs", "Model", "--model"),
      { key: "variant", label: "Variant", type: "select", choices: ["all", "A", "B", "C"], def: "all", map: (v) => (v === "all" ? [] : ["--variant", v]) },
      { key: "force", label: "Redo variants that exist", type: "bool", def: true, flag: "--force" },
    ],
    build: (ws, o) => [B("thumbs", "--video", ws, ...args(o, "publish.thumbs"))],
  },
  "publish.render": {
    step: "publish", label: "Render thumbnails", help: "Renders the images and the preview sheets from the thumbnail files (after you edited one by hand). No model.", long: "~1 min",
    opts: [{ key: "variant", label: "Variant", type: "select", choices: ["all", "A", "B", "C"], def: "all", map: (v) => (v === "all" ? [] : ["--variant", v]) }],
    build: (ws, o) => [B("thumbs:render", "--video", ws, ...args(o, "publish.render"))],
  },
  "publish.review": {
    step: "publish", label: "Review thumbnails", help: "A vision critic checks each thumbnail and the preview sheets against the guide's checklist (168 px legibility, words, focal point, contrast, badge zone, truth, distinctness).", paid: "~$0.1–0.3", long: "~1–3 min",
    opts: [
      modelOpt("thumbsReview", "Reviewer", "--agent", "agent"),
      { key: "toNotes", label: "Append findings to each variant's notes", type: "bool", def: true, flag: "--to-notes" },
    ],
    build: (ws, o) => [B("thumbs:review", "--video", ws, ...args(o, "publish.review"))],
  },
  "publish.fix": {
    step: "publish", variant: true, label: "Fix with notes", help: "Sends this variant's notes to the thumbnail author for one revision (resumes its session).", paid: "~$0.5–2", long: "~3–6 min",
    opts: [modelOpt("thumbs", "Model", "--model")],
    build: (ws, o, v) => {
      if (!pub.readText(pub.pubFile(ws, `notes/${v}.md`)).trim()) return "save notes for this variant first";
      return [B("thumbs", "--video", ws, "--variant", v!, "--notes", ...args(o, "publish.fix"))];
    },
  },
  "publish.export": { step: "publish", label: "Export", help: "Copies the thumbnails, titles.txt (A: ...), description, tags and the .srt into 07-publish/export/.", long: "seconds", build: (ws) => [B("publish:export", "--video", ws)] },
  // ── shorts: 2–3 standalone 9:16 shorts per video (workspace/<ID>/shorts/S1.., CLI in workflow/08-shorts) ──
  "shorts.write": {
    step: "shorts", label: "Write shorts", help: "Writes standalone short scripts (≤ 60 s each, one nested workspace per short) from the approved long script and its sourced figures, or in a shorts project from your brief. Existing shorts are kept unless you tick Overwrite. shorts/feedback.md is read on a full rewrite. Each script still needs your approval before any voice.",
    paid: "~$0.5–1.5", long: "~2–5 min",
    opts: [
      { key: "count", label: "How many", type: "number", min: 1, max: 5, step: 1, def: 3, flag: "--count" },
      modelOpt("shortsWriter", "Writer model", "--model"),
      { key: "series", label: "A series (parts in order)", help: "S1 = Part 1 …: each part works alone, ends on the question the next part answers, the last loops back to Part 1. Add short then writes the next part", type: "bool", def: false, flag: "--series" },
      { key: "force", label: "Overwrite existing shorts", help: "rewrites every short script, including ones you edited", type: "bool", def: false, flag: "--force" },
    ],
    build: (ws, o) => {
      if (sh.isShortsProject(ws) && !sh.briefWritten(ws)) return "write the brief first (what happened, the angle, every fact with its source)";
      return [B("shorts:write", "--video", ws, ...args(o, "shorts.write"))];
    },
  },
  "shorts.add": {
    step: "shorts", label: "Add short", help: "Adds one short. With the writer, it reads the shorts that exist and writes a new one that repeats none of them (another kind, hook, number and payoff), following your idea if you give one. Blank: an empty short you write yourself (free).",
    paid: "~$0.3–0.8 (blank: free)", long: "~1–2 min",
    opts: [
      { key: "idea", label: "Idea for this short", help: "optional: an angle, a number, an example from the video or the brief", type: "text", flag: "--idea" },
      { key: "blank", label: "Blank (I write it)", type: "bool", def: false, flag: "--blank" },
      modelOpt("shortsWriter", "Writer model", "--model"),
    ],
    build: (ws, o) => [B("shorts:write", "--video", ws, "--add", ...args(o, "shorts.add"))],
  },
  "shorts.remove": { step: "shorts", perShort: true, label: "Remove", help: "Deletes this short (its folder moves to shorts/.removed/, so it can be restored by hand).", long: "seconds", build: (ws, _o, s) => [B("shorts:write", "--video", ws, "--remove", s!)] },
  "shorts.check": { step: "shorts", label: "Check scripts", help: "Re-runs the checks (word count, numbers against the plan's data, banned phrases) after a hand edit. No model.", long: "seconds", build: (ws) => [B("shorts:write", "--video", ws, "--check")] },
  "shorts.revise": {
    step: "shorts", perShort: true, label: "Revise", help: "Rewrites this one short from its feedback (shorts/<S>/02-scripting/feedback.md). Save the feedback first; the new script needs approval again.", paid: "~$0.3–0.8", long: "~1–2 min",
    opts: [modelOpt("shortsWriter", "Writer model", "--model")],
    build: (ws, o, s) => {
      if (!readText(path.join(sh.shortWs(ws, s!), "02-scripting/feedback.md")).trim()) return "save feedback for this short first";
      return [B("shorts:write", "--video", ws, "--short", s!, ...args(o, "shorts.revise"))];
    },
  },
  "shorts.approve": { step: "shorts", perShort: true, label: "Approve", help: "Locks this exact script for voice generation (any edit afterwards needs a new approval).", build: (ws, _o, s) => [B("shorts:write", "--video", ws, "--approve", s!)] },
  "shorts.run": {
    step: "shorts", perShort: true, label: "Run", help: "Runs the short through the stages from → to (default: voice to draft, which stops for your review). Plan and act call Claude (~$0.2–0.5 and ~$2–4); the rest is free.",
    paid: "plan ~$0.2–0.5, act ~$2–4", long: "~10–30 min",
    opts: [
      { key: "from", label: "From stage", type: "select", choices: [...SHORT_STAGES], def: "voice", flag: "--from" },
      { key: "to", label: "To stage", help: "draft stops for review; render makes the final + QC", type: "select", choices: [...SHORT_STAGES], def: "draft", flag: "--to" },
      modelOpt("shortsDirector", "Director model", "--director-model", "directorModel"),
      modelOpt("shortsAct", "Act author model", "--act-model", "actModel"),
      { key: "force", label: "Redo stages that exist", type: "bool", def: false, flag: "--force" },
      { key: "noMusic", label: "No music bed", help: "sound stage: voice + foley only (to add a sound in the YouTube app instead)", type: "bool", def: false, flag: "--no-music" },
    ],
    build: (ws, o, s) => {
      const from = String(o.from ?? "voice"), to = String(o.to ?? "draft");
      if (SHORT_STAGES.includes(from as any) && SHORT_STAGES.includes(to as any) && SHORT_STAGES.indexOf(from as any) > SHORT_STAGES.indexOf(to as any)) return "From stage comes after To stage";
      if (from === "voice" && sh.approvalState(sh.shortWs(ws, s!)) !== "approved") return "approve this short's script first (the voice reads the approved script)";
      return [B("shorts", "--video", ws, "--short", s!, ...args(o, "shorts.run"))];
    },
  },
  "shorts.frames": {
    step: "shorts", perShort: true, label: "Render frames", help: "Stills every N s + at each hit word, a contact sheet and a layout report for the short's act A01.", long: "~1 min",
    opts: [
      { key: "every", label: "Every (s)", type: "number", min: 0.5, max: 10, step: 0.5, def: 2, flag: "--every" },
      { key: "words", label: "Also at hit words", type: "bool", def: true, flag: "--words" },
    ],
    build: (ws, o, s) => [B("frames", "--video", sh.shortVideoId(ws, s!), "--scene", "A01", ...args(o, "shorts.frames"))],
  },
  "shorts.review": {
    step: "shorts", perShort: true, label: "Review", help: "An agent checks that the visuals match the voice at each moment and appends fixes to the short's review notes.", long: "2–6 min",
    opts: [
      modelOpt("actReview", "Reviewer", "--agent", "agent"),
      { key: "toNotes", label: "Append findings to review notes", type: "bool", def: true, flag: "--to-notes" },
    ],
    build: (ws, o, s) => [B("review", "--video", sh.shortVideoId(ws, s!), "--act", "A01", ...args(o, "shorts.review"))],
  },
  "shorts.fix": {
    step: "shorts", perShort: true, label: "Fix act with notes", help: "Sends the review notes to the act's author for one revision (resumes its session). Save the notes first.", paid: "~$3–6", long: "~3–15 min",
    opts: [modelOpt("shortsAct", "Author model", "--model")],
    build: (ws, o, s) => {
      const rel = path.join("workspace", ws, "shorts", s!, notesRel("A01"));
      if (!readText(path.join(REPO, rel)).trim()) return "save review notes for this short first";
      return [B("act", "--video", sh.shortVideoId(ws, s!), "--act", "A01", "--fix", rel, ...args(o, "shorts.fix"))];
    },
  },
  "shorts.export": {
    step: "shorts", label: "Export shorts", help: "Copies each QC-passed short into shorts/export/: S1.mp4, S1.txt (title, description, hashtags), S1.srt and upload.md.", long: "seconds",
    opts: [{ key: "force", label: "Export even if QC has not passed", type: "bool", def: false, flag: "--force" }],
    build: (ws, o) => [B("shorts:export", "--video", ws, ...args(o, "shorts.export"))],
  },
  // ── downloads + Final Cut Pro (long video and per short) ──
  "deliver.build": {
    step: "deliver", label: "Build downloads", help: "Collects the video, the audio mixes, the stems, the SFX pack and the Final Cut Pro project in 08-deliver, ready to download.", long: "~1 min",
    opts: [{ key: "only", label: "Only these items", help: "comma-separated keys, e.g. video_full,stem_voice (empty = all)", type: "text", flag: "--only" }],
    build: (ws, o) => [B("deliver", "--video", ws, ...args(o, "deliver.build"))],
  },
  "deliver.short": {
    step: "deliver", perShort: true, label: "Build downloads", help: "Collects this short's video, audio mixes, stems, SFX pack and Final Cut Pro project in its 08-deliver folder.", long: "~1 min",
    opts: [{ key: "only", label: "Only these items", help: "comma-separated keys, e.g. video_full,stem_voice (empty = all)", type: "text", flag: "--only" }],
    build: (ws, o, s) => [B("deliver", "--video", sh.shortVideoId(ws, s!), ...args(o, "deliver.short"))],
  },
  "fcp.open": { step: "deliver", label: "Open in Final Cut Pro", help: "Writes the Final Cut Pro project (video, voice, every SFX on its own clip, music) and opens it.", long: "seconds", build: (ws) => [B("fcp", "--video", ws, "--open")] },
  "fcp.short": { step: "deliver", perShort: true, label: "Open in Final Cut Pro", help: "Writes this short's Final Cut Pro project and opens it.", long: "seconds", build: (ws, _o, s) => [B("fcp", "--video", sh.shortVideoId(ws, s!), "--open")] },
  "shorts.qc": { step: "shorts", perShort: true, label: "QC", help: "Hard checks on this short: placeholders, loudness, duration (≤ 60 s), 9:16.", long: "seconds", build: (ws, _o, s) => [B("qc", "--video", sh.shortVideoId(ws, s!))] },
  "shorts.sound.apply": {
    step: "shorts", perShort: true, label: "Apply SFX edits", help: "Re-reads this short's foley edits: sound stage (cues + mix), then a new draft render.", long: "~2–3 min",
    opts: [{ key: "noMusic", label: "No music bed", help: "voice + foley only (to add a sound in the YouTube app instead)", type: "bool", def: false, flag: "--no-music" }],
    build: (ws, o, s) => [B("shorts", "--video", ws, "--short", s!, "--step", "sound", ...args(o, "shorts.sound.apply")), B("shorts", "--video", ws, "--short", s!, "--step", "draft")],
  },
  "history.compact": {
    step: "history", label: "Compact workspace", help: "Frees disk space of a finished video (and its shorts): caches, review frames, previews, draft, TTS takes. Scripts, plans, act code, notes, metadata and final.mp4 are kept. DRY RUN unless you tick \"Delete for real\": it only lists what would go.", long: "seconds",
    opts: [
      { key: "deep", label: "Deep: also the regenerable audio", help: "combined voice, master, mix, music, sfx (re-run voice/align/sound to rebuild)", type: "bool", def: false, flag: "--deep" },
      { key: "daw", label: "Also the openDAW project", help: "only needed to re-edit the mix", type: "bool", def: false, flag: "--daw" },
      { key: "final", label: "Also final.mp4", help: "only once it is uploaded or backed up", type: "bool", def: false, flag: "--final" },
      { key: "noShorts", label: "Leave the shorts alone", type: "bool", def: false, flag: "--no-shorts" },
      { key: "yes", label: "DELETE FOR REAL (off = dry run)", help: "maps to --yes; deleted files cannot be restored", type: "bool", def: false, flag: "--yes", volatile: true },
    ],
    build: (ws, o) => [B("compact", "--video", ws, ...args(o, "history.compact"))],
  },
  "timings.run": { step: "timings", label: "Time & cost report", help: "Prints timings.json.", build: (ws) => [B("timings", "--video", ws)] },
};

/** One button per short stage (bun run shorts --step <stage>): the Shorts page runs them one at a time or "from here". */
const SHORT_STAGE_ACTIONS: Record<string, Partial<Action> & { label: string; help: string }> = {
  voice: {
    label: "Voice", help: "tts:format + the channel voice with the shorts settings (reads the approved script).", long: "~3–5 min",
    opts: ENGINE_OPTS.map((o) => {
      // shorts run.ts forwards one --tts "<flags>" string to the voice step
      const inner = o.map ?? ((v: any) => [o.flag!, String(v)]);
      return { ...o, flag: undefined, map: (v: any) => ["--tts", inner(v).join(" ")] };
    }),
  },
  align: { label: "Align", help: "Transcribe, master the voice, captions and the .srt.", long: "~1 min" },
  beat: {
    label: "Music & beat", help: "The track the short is cut to: finds its tempo, beats, bars and big accents, so the plan and the act move on the music (pulses on beats, moves on bars, thumps on drops); Sound mixes the same track. Optional: no track = cut to the words.", long: "seconds",
    opts: [
      { key: "beatTrack", label: "Track", help: "from the music library (Sound → Music stem → Music library: put files in assets/music/<mood>/ and Scan); keep = the one already chosen", type: "select", def: "keep",
        map: (v: string) => (v === "keep" ? [] : v === "none" ? ["--beat-clear"] : ["--beat-track", v]) },
      { key: "beatStart", label: "Start in the track (s)", help: "skip an intro or start on the drop; empty = from the top (or the last start)", type: "number", min: 0, max: 900, flag: "--beat-start" },
      { key: "beatAuto", label: "Start on the first downbeat", help: "skips a silent or soft intro so the short opens on the one", type: "bool", def: false, flag: "--beat-auto" },
    ],
  },
  plan: { label: "Plan", help: "The director splits the short into its one act (Claude).", paid: "~$0.2–0.5", long: "~1 min", opts: [modelOpt("shortsDirector", "Director model", "--director-model", "directorModel")] },
  act: {
    label: "Act", help: "The act author draws the short in code, then renders its frames (Claude).", paid: "~$2–4", long: "~5–15 min",
    opts: [modelOpt("shortsAct", "Act author model", "--act-model", "actModel"), { key: "force", label: "Redo the act if it exists", type: "bool", def: false, flag: "--force" }],
  },
  sound: {
    label: "Sound", help: "Cues, the music bed and the mix (voice + foley + bed). Foley edits from the review table are read here.", long: "~1 min",
    opts: [{ key: "noMusic", label: "No music bed", help: "voice + foley only (to add a sound in the YouTube app instead)", type: "bool", def: false, flag: "--no-music" }],
  },
  draft: { label: "Draft", help: "Renders the draft 1080x1920 to watch.", long: "~1–2 min" },
  render: { label: "Render final", help: "Final 1080x1920 render, then QC (≤ 60 s, 9:16, loudness).", long: "~2–4 min" },
};
for (const [stage, def] of Object.entries(SHORT_STAGE_ACTIONS)) {
  const key = `shorts.${stage}`;
  ACTIONS[key] = {
    step: "shorts", perShort: true, ...def,
    build: (ws, o, s) => {
      if (stage === "voice" && sh.approvalState(sh.shortWs(ws, s!)) !== "approved") return "approve this short's script first (the voice reads the approved script)";
      return [B("shorts", "--video", ws, "--short", s!, "--step", stage, ...args(o, key))];
    },
  };
}

/** "A03" -> "A03-A04" (the seam into the next act in timeline order), or "" for the last act. */
function seamAfter(ws: string, act: string): string {
  const ids = actIds(ws), i = ids.indexOf(act);
  return i >= 0 && i < ids.length - 1 ? `${act}-${ids[i + 1]}` : "";
}

/** Validate client options against an action's schema and turn them into argv. Unknown keys are ignored. */
let currentOpts: Record<string, any> = {};
function args(o: Record<string, any>, key: string): string[] {
  const out: string[] = [];
  const defs = ACTIONS[key].opts ?? [];
  const valueOf = (k: string) => o[k] ?? defs.find((d) => d.key === k)?.def;
  for (const opt of defs) {
    if (opt.when && !opt.when.in.includes(String(valueOf(opt.when.key)))) continue;
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
        if (!(dynChoices(opt) ?? []).includes(String(v))) throw new Error(`${opt.label}: "${v}" is not offered any more (pick again; offered: ${(dynChoices(opt) ?? []).slice(0, 8).join(", ")})`);
        out.push(...(opt.map ? opt.map(String(v)) : [opt.flag!, String(v)]));
        continue;
      case "multi": {
        const arr = (Array.isArray(v) ? v : []).map(String);
        const allowed = (key === "acts.all" || key === "acts.reviewAll") && opt.key === "acts" ? currentOpts.__acts ?? [] : opt.choices ?? [];
        const unknown = arr.filter((x) => !allowed.includes(x));
        if (unknown.length) throw new Error(`${opt.label}: ${unknown.join(", ")} ${unknown.length > 1 ? "are" : "is"} not offered any more (pick again)`);
        out.push(...(opt.map ? opt.map(arr) : arr.length ? [opt.flag!, arr.join(",")] : []));
        continue;
      }
      case "text": {
        const s = String(v).trim();
        if (!s) continue;
        if (s.length > (opt.key === "models" ? 2000 : opt.key === "notes" ? 1500 : 300) || s.startsWith("-") || /[\0\n\r]/.test(s)) throw new Error(`${opt.label}: invalid text`);
        if (opt.key === "models" && !/^([A-Z]\d+=[\w:./@-]+)(,[A-Z]\d+=[\w:./@-]+)*$/.test(s)) throw new Error("Per-act models: A01=claude:sonnet,A02=opus");
        if (opt.key === "at" && !/^[\d.,\s]+$/.test(s)) throw new Error("Extra times: numbers separated by commas");
        if (opt.key === "only" && !/^[\w,]+$/.test(s)) throw new Error("Items: keys separated by commas");
        if (opt.key === "section" && !/^[\w-]+$/.test(s)) throw new Error("Section id: letters, digits, _ and -");
        out.push(opt.flag!, s);
      }
    }
  }
  return out;
}

/** Every runnable thing: action key → argv chain (allowlisted; options validated). */
/**
 * What a job writes, so the dashboard can run jobs side by side: one act's jobs (author, frames, preview, review, fix)
 * lock that act; the batch actions lock the acts they will touch; everything else locks the whole video ("*").
 */
function locksFor(ws: string, key: string, opts: Record<string, any>, act?: string): string[] {
  const a = ACTIONS[key];
  if (a.step === "acts" && a.perAct && act) return [`act:${act}`];
  if (key === "acts.all" || key === "acts.reviewAll") {
    const picked: string[] = Array.isArray(opts.acts) ? opts.acts.map(String) : [];
    if (picked.length) return picked.map((x) => `act:${x}`);
    if (key === "acts.reviewAll") return actIds(ws).filter((id) => sceneFiles(ws)[id]).map((x) => `act:${x}`);
    // no pick: every act without a file, plus (as the author does) acts whose plan changed; with "redo", all acts
    const scenes = sceneFiles(ws);
    const ids = opts.force ? actIds(ws) : actIds(ws).filter((id) => !scenes[id] || actStale(ws, id, mtime(path.join(wsDir(ws), scenes[id]))));
    return ids.length ? ids.map((x) => `act:${x}`) : ["*"];
  }
  return ["*"];
}

function commandFor(ws: string, key: string, opts: Record<string, any>, act?: string): { label: string; key: string; cmds: string[][]; locks: string[] } | string {
  const a = ACTIONS[key];
  if (!a) return "unknown action";
  if (a.perAct && (!act || !ACT_ID.test(act) || !actIds(ws).includes(act))) return "unknown act";
  if (a.variant && !(act && /^[ABC]$/.test(act))) return "unknown variant";
  if (a.perShort && (!act || !sh.SHORT_ID.test(act) || !sh.listShorts(ws).includes(act))) return "unknown short";
  currentOpts = { __acts: actIds(ws) };
  let cmds: string[][] | string;
  try { cmds = a.build(ws, opts ?? {}, act); } catch (e: any) { return e.message; }
  if (typeof cmds === "string") return cmds;
  const jobKey = a.variant ? `${a.step}:${act}` : a.perAct ? `${key.split(".")[1]}:${act}` : a.step;   // shorts jobs all use the step key "shorts"
  return { key: jobKey, label: a.perAct || a.variant || a.perShort ? `${a.label} ${act}` : a.label, cmds, locks: locksFor(ws, key, opts ?? {}, act) };
}

function schema() {
  return Object.fromEntries(Object.entries(ACTIONS).map(([k, a]) => [k, { step: a.step, label: a.label, help: a.help, paid: a.paid ?? null, long: a.long ?? null, perAct: !!a.perAct || !!a.variant || !!a.perShort, chain: a.chain ?? null, opts: (a.opts ?? []).map(({ map, flag, ...o }) => ({ ...o, choices: dynChoices(o as Opt), help: dynHelp(o as Opt) })) }]));
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

/** Act ID → its scene file: the plan's `<id>_<slug>.tsx` when there, else any file with the ID. */
function sceneFiles(ws: string): Record<string, string> {
  const out: Record<string, string> = {};
  const slugs = new Map<string, string>(((readJson<any>(path.join(wsDir(ws), "05-video/acts.json"))?.acts ?? []) as any[]).map((a) => [a.id, a.slug]));
  for (const f of ls(path.join(wsDir(ws), "05-video/src/scenes"), /^A\d+_.*\.tsx$/)) {
    const id = f.split("_")[0];
    if (!out[id] || f === `${id}_${slugs.get(id)}.tsx`) out[id] = `05-video/src/scenes/${f}`;
  }
  return out;
}

/** Hash of one act's own entry in acts.json (so editing another act's plan does not make this one stale). */
const planHash = (ws: string, id: string): string => {
  const a = (readJson<any>(path.join(wsDir(ws), "05-video/acts.json"))?.acts ?? []).find((x: any) => x.id === id);
  return new Bun.CryptoHasher("sha256").update(JSON.stringify(a ?? null)).digest("hex");
};
const planHashPath = (ws: string, id: string) => path.join(wsDir(ws), `05-video/review/${id}/plan.hash`);
/**
 * Stale = this act's plan entry changed since its scene was written (same rule as planChanged in
 * 05-video/src/lib/scenes.ts, which the act author uses). A recorded hash counts when it was written with or after the
 * scene and not after a plan change the scene predates; otherwise stale = acts.json is newer than the scene. A missing
 * hash is recorded only for a scene newer than the plan, so an old act is never stamped with a new plan.
 */
function actStale(ws: string, id: string, sceneMs: number): boolean {
  const f = planHashPath(ws, id), cur = planHash(ws, id), plan = mtime(path.join(wsDir(ws), "05-video/acts.json")), h = exists(f) ? mtime(f) : 0;
  const [hash, mark] = h ? readText(f).trim().split("\n") : [""];
  // "kept": replan / a pause shift moved only this act's times and re-stamped it (05-video/src/lib/scenes.ts)
  if (h >= sceneMs && (mark === "kept" || !(sceneMs < plan && plan < h))) return hash.trim() !== cur;
  if (plan > sceneMs) return true;
  try { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, cur); } catch {}
  return false;
}
/** Your approval of the plan; valid while acts.json is the file you approved. */
function planApproval(ws: string): { at: string; valid: boolean } | null {
  const a = readJson<any>(path.join(wsDir(ws), "05-video/plan_approved.json")), f = path.join(wsDir(ws), "05-video/acts.json");
  if (!a || !exists(f)) return null;
  return { at: a.at, valid: a.sha256 === new Bun.CryptoHasher("sha256").update(fs.readFileSync(f)).digest("hex") };
}
const approvalPath = (ws: string, id: string) => path.join(wsDir(ws), `05-video/review/${id}/approved.json`);
/** Explicit human approval; valid only while the scene is the one that was approved. */
function actApproval(ws: string, id: string, sceneMs: number): { at: string; sceneMtime: number } | null {
  const a = readJson<any>(approvalPath(ws, id));
  return a && sceneMs && a.sceneMtime === sceneMs ? { at: a.at, sceneMtime: a.sceneMtime } : null;
}
/** Status of one act's scene file against the plan (approval overrides stale). */
function sceneStatus(ws: string, id: string, rel: string | undefined): St {
  if (!rel) return "none";
  const ms = mtime(path.join(wsDir(ws), rel));
  return actStale(ws, id, ms) && !actApproval(ws, id, ms) ? "stale" : "done";
}

function overlay(ws: string, key: string, st: St, outputs: string[]): St {
  if (runningJobs(ws).some((run) => run.step === key || run.step.startsWith(key + ":"))) return "running";
  const last = lastRuns(ws)[key];
  if (last && last.exit !== "0") {
    const newestOut = Math.max(0, ...outputs.map((o) => mtime(path.join(wsDir(ws), o))));
    if (last.exit === "interrupted" || last.end > newestOut) return "failed";
  }
  return st;
}

/** draft / final file against the mix, timeline and scenes (current = nothing newer than the file). */
function renderStates(ws: string): { draft: St; final: St } {
  const sceneMax = Math.max(0, ...Object.values(sceneFiles(ws)).map((r) => mtime(path.join(wsDir(ws), r))));
  const ins = ["06-audio/mix.wav", "05-video/timeline.json"];
  return { draft: derive(ws, ins, ["05-video/draft.mp4"], sceneMax), final: derive(ws, ins, ["05-video/final.mp4"], sceneMax) };
}

// ── publish: titles + thumbnails (workspace/<ID>/07-publish) ──

const PUB_FILES = (ws: string) => pub.VARIANTS.map((v) => pub.thumbPath(ws, v));
const approvalFile = (ws: string) => pub.pubFile(ws, "approval.json");
const hashCache = new Map<string, { stamp: string; hash: string }>();
/** sha256 over the three thumbnails and the metadata fields a viewer sees: what an approval stands for. Cached by file times. */
function publishHash(ws: string): string {
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
function publishApproval(ws: string): { at: string; valid: boolean } | null {
  const a = readJson<any>(approvalFile(ws));
  return a?.hash ? { at: a.at, valid: a.hash === publishHash(ws) } : null;
}
/** Why the step's outputs are out of date (empty = current): a thumbnail older than its source, metadata older than the script, an approval that no longer matches. */
function publishStaleReasons(ws: string): string[] {
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
function publishStatus(ws: string): St {
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
function shortsStatus(ws: string): St {
  const ids = sh.listShorts(ws);
  let st: St = "none";
  if (ids.length) {
    const ex = ids.filter((id) => sh.shortProgress(ws, id).exported).length;
    st = ex === ids.length ? "done" : "partial";
  }
  return overlay(ws, "shorts", st, ids.map((id) => `shorts/${id}/05-video/final.mp4`));
}

function stepStatuses(ws: string): Record<string, St> {
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

// ───────────────────────────── artifacts per step ─────────────────────────────

function timingsFor(ws: string) {
  return (readJson<any[]>(path.join(wsDir(ws), "timings.json")) ?? []).filter((r) => r && typeof r.step === "string");
}
/** The video's own rows plus each short's (each short's own timings.json), the short's rows labelled "S1 · step". For totals, the usage view and the history table. */
function timingsAll(ws: string) {
  const own = timingsFor(ws);
  const extra = sh.listShorts(ws).flatMap((sid) =>
    (readJson<any[]>(path.join(sh.shortWs(ws, sid), "timings.json")) ?? []).filter((r) => r && typeof r.step === "string").map((r) => ({ ...r, step: `${sid} · ${r.step}` })));
  return extra.length ? [...own, ...extra].sort((a, b) => String(a.at ?? "").localeCompare(String(b.at ?? ""))) : own;
}

const TIMING_MATCH: Record<string, RegExp> = {
  voice: /^voice\b/i,
  align: /^(post|transcribe|master|captions)\b/i,
  plan: /^direct\b/i,
  script: /^write script/i,
  acts: /^(act|critic|frames|review|preview) A\d+/i,
  sound: /^(cues|music|mix|sound)\b/i,
  render: /^(render|qc)\b/i,
  publish: /^(meta|thumbs)\b/i,
  shorts: /^(shorts\b|S\d+ · )/i,
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

function publishDetails(ws: string) {
  const d = wsDir(ws);
  const meta = readJson<any>(pub.pubFile(ws, "metadata.json"));
  const info = readJson<Record<string, any>>(pub.pubFile(ws, "thumbnails.json")) ?? {};
  const checks = readJson<Record<string, any>>(pub.pubFile(ws, "thumbnails.checks.json")) ?? {};
  const rev = ls(pub.pubFile(ws, "reviews"), /\.json$/).reverse().slice(0, 8).map((f) => {
    const r = readJson<any>(pub.pubFile(ws, `reviews/${f}`));
    return r ? { file: `07-publish/reviews/${f}`, agent: r.agent, at: r.at, overall: r.overall, summary: r.summary, all: r.all ?? [], variants: r.variants ?? {}, costUsd: r.costUsd ?? 0, ms: r.ms ?? 0 } : null;
  }).filter(Boolean);
  return {
    metadata: meta, metaFile: fileInfo(ws, "07-publish/metadata.json"),
    metaNotes: pub.readText(pub.pubFile(ws, "notes/meta.md")), metaNotesMtime: mtime(pub.pubFile(ws, "notes/meta.md")),
    thumbs: pub.VARIANTS.map((v) => {
      const p = pub.thumbPath(ws, v), notes = pub.pubFile(ws, `notes/${v}.md`);
      return { id: v, file: p ? fileInfo(ws, path.relative(d, p)) : null, source: fileInfo(ws, `07-publish/remotion/thumbs/${v}.tsx`), info: info[v] ?? null, checks: checks[v] ?? null, notes: pub.readText(notes), notesMtime: mtime(notes) };
    }),
    preview: fileInfo(ws, "07-publish/preview.png"), previewSmall: fileInfo(ws, "07-publish/preview_small.png"),
    reviews: rev, review: exists(pub.pubFile(ws, "review.md")) ? { ...fileInfo(ws, "07-publish/review.md"), text: pub.readText(pub.pubFile(ws, "review.md")).slice(0, 20000) } : null,
    approval: publishApproval(ws), stale: publishStaleReasons(ws),
    exported: ls(pub.pubFile(ws, "export")).map((f) => fileInfo(ws, `07-publish/export/${f}`)).filter(Boolean),
    badge: pub.badgeTime(meta?.durationS ?? 0),
  };
}

const SHORT_NOTES = "05-video/review/A01/director_notes.md";
/** One folder of shorts: the index merged with each short's short.json (+ checks), progress, approval, texts, files, the export folder and compact history. */
function shortsDetails(ws: string) {
  const d = wsDir(ws), index = readJson<any>(sh.indexPath(ws));
  const items = sh.listShorts(ws).map((id) => {
    const sw = sh.shortWs(ws, id), rel = (r: string) => `shorts/${id}/${r}`;
    const entry = { ...(index?.shorts ?? []).find((e: any) => e.id === id), ...(readJson<any>(path.join(sw, "02-scripting/short.json")) ?? {}) };
    const script = readText(path.join(sw, "02-scripting/script_raw.md"));
    const rdir = rel("05-video/review/A01"), abs = path.join(d, rdir);
    const qcP = path.join(sw, "05-video/review/qc-report.md");
    const feedbackP = path.join(sw, "02-scripting/feedback.md"), notesP = path.join(sw, SHORT_NOTES);
    const timings = (readJson<any[]>(path.join(sw, "timings.json")) ?? []).filter((r) => r && typeof r.step === "string");
    return {
      id, entry, checks: entry.checks ?? null, progress: sh.shortProgress(ws, id),
      rhythm: (() => {
        const r = readJson<any>(path.join(sw, "06-audio/rhythm.json"));
        return r ? { track: r.track, title: r.title, license: r.license ?? null, bpm: r.bpm, start: r.start, dur: r.dur, confidence: r.confidence, beats: r.beats, downbeats: r.downbeats, accents: r.accents, energy: r.energy, at: r.at } : null;
      })(),
      approval: sh.approvalState(sw), approvedAt: readJson<any>(path.join(sw, "02-scripting/approved.json"))?.at ?? null,
      script, scriptMtime: mtime(path.join(sw, "02-scripting/script_raw.md")), words: sh.spokenWords(script),
      feedback: readText(feedbackP), feedbackMtime: mtime(feedbackP),
      notes: readText(notesP), notesMtime: mtime(notesP),
      files: {
        draft: fileInfo(ws, rel("05-video/draft.mp4")), final: fileInfo(ws, rel("05-video/final.mp4")),
        sheet: fileInfo(ws, `${rdir}/sheet.jpg`), preview: fileInfo(ws, `${rdir}/preview.mp4`),
        mix: fileInfo(ws, rel("06-audio/mix.wav")), voice: fileInfo(ws, rel("03-voiceover/audio/combined/full_voiceover.wav")),
        srt: ls(path.join(sw, "07-assembly/export"), /\.srt$/).map((f) => fileInfo(ws, rel(`07-assembly/export/${f}`))).filter(Boolean)[0] ?? null,
      },
      thumbs: ls(abs, /^t_.*\.jpg$/).map((f) => fileInfo(ws, `${rdir}/${f}`)).filter(Boolean),
      qc: exists(qcP) ? { ...fileInfo(ws, rel("05-video/review/qc-report.md")), text: readText(qcP).slice(0, 20000) } : null,
      timings: { runs: timings.length, ms: timings.reduce((a, r) => a + (r.ms ?? 0), 0), costUsd: timings.reduce((a, r) => a + (r.costUsd ?? 0), 0) },
    };
  });
  return {
    items, notes: index?.notes ?? null, indexFile: fileInfo(ws, "shorts/shorts.json"),
    feedback: readText(path.join(sh.shortsDir(ws), "feedback.md")), feedbackMtime: mtime(path.join(sh.shortsDir(ws), "feedback.md")),
    exported: ls(path.join(sh.shortsDir(ws), "export")).map((f) => fileInfo(ws, `shorts/export/${f}`)).filter(Boolean),
    compact: readJson<any[]>(path.join(d, "compact.json")) ?? [],
  };
}

/** Align → Pauses: the holds, how the last merge applied them, requests not collected yet, and the plan shift state. */
function holdsSummary(ws: string) {
  const d = wsDir(ws);
  const file = readJson<{ holds: any[] }>(path.join(d, "03-voiceover/holds.json"))?.holds ?? [];
  const post = readJson<any>(path.join(d, "03-voiceover/audio/post.json"));
  const applied: any[] = post?.holds ?? [];
  const retime = readJson<any>(path.join(d, "03-voiceover/audio/retime.json"));
  const pts = readJson<any>(path.join(d, "03-voiceover/audio/hold_points.json"));
  const plan = readJson<any>(path.join(d, "05-video/acts.json"));
  const keys = new Set(file.map((h) => h.key).filter(Boolean));
  const norm = (x: string) => String(x).toLowerCase().replace(/[^a-z0-9]/g, "");
  let pending = 0;
  for (const a of plan?.acts ?? []) {
    const author = readJson<any>(path.join(d, "05-video/review", a.id, "holds.json"));
    const reqs: [string, any[]][] = [["director", a.holds ?? []], [`author ${a.id}`, author?.holds ?? (Array.isArray(author) ? author : [])]];
    for (const [by, list] of reqs) for (const r of list) if (r?.word && !keys.has(`${by}|${a.id}|${norm(r.word)}|${r.occurrence ?? 1}`)) pending++;
  }
  const holds = file.map((h) => {
    const ap = applied.find((x) => x.id === h.id);
    const live = !!ap && ap.ok && ap.ms === h.ms && h.on;
    return { ...h, status: !h.on ? "off" : live ? "applied" : ap && !ap.ok && ap.ms === h.ms ? "failed" : "waiting", failWhy: ap && !ap.ok ? ap.why : undefined, mergedAt: ap?.mergedAt ?? null };
  });
  const appliedGone = applied.filter((x) => x.ok && !file.some((h) => h.id === x.id && h.on)).length;
  return {
    holds, pending, scannedAt: pts?.at ?? null,
    cleanPoints: pts ? Object.values<any>(pts.sections).reduce((n, x) => n + (x.points ?? []).filter((p: any) => p.clean).length, 0) : 0,
    addedMs: applied.filter((x) => x.ok).reduce((n, x) => n + x.ms, 0),
    dirty: holds.some((h) => h.status === "waiting") || appliedGone > 0,
    planShift: retime ? { changed: !!retime.changed, shifted: !!retime.shifted, baseSame: !!retime.baseSame } : null,
  };
}

function details(ws: string) {
  const d = wsDir(ws);
  const rows = timingsFor(ws), allRows = timingsAll(ws);
  const meta: Record<string, any> = {};
  for (const [k, re] of Object.entries(TIMING_MATCH)) meta[k] = stepMeta(k === "shorts" ? allRows : rows, re);

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

  // voice sections for Listen / Review: text, the exact direction, long pauses, your review, the previous take
  const voiceManifest = readJson<any>(path.join(audioDir, "sections.json"));
  const pauses = readJson<any>(path.join(audioDir, "pauses.json"))?.files ?? {};
  const reviews = readJson<Record<string, any>>(voiceReviewPath(ws)) ?? {};
  const voiceSections = (voiceManifest?.sections ?? []).map((x: any) => {
    const base = path.basename(x.file, ".wav"), rep = readJson<any>(path.join(audioDir, "reports", `${base}.json`));
    const wer = rep?.chunks?.length ? rep.chunks.reduce((n: number, c: any) => n + (c.chosenWer ?? 0), 0) / rep.chunks.length : null;
    const f = fileInfo(ws, `03-voiceover/audio/${x.file}`);
    return { id: x.id, part: x.part, partTitle: x.partTitle ?? "", chapterTitle: x.chapterTitle ?? null, file: f, text: x.text, instruction: x.instruction, direction: x.direction,
      pauses: f && pauses[x.file]?.mtime === f.mtime ? pauses[x.file].pauses : [], pausesStale: !!f && !!pauses[x.file] && pauses[x.file].mtime !== f.mtime,
      wer, review: reviews[x.id] ?? null, prev: fileInfo(ws, `03-voiceover/audio/prev/${x.file}`) };
  });

  // align
  const captions = readJson<any[]>(path.join(d, "05-video/captions.json"));
  const chapters = readJson<any[]>(path.join(d, "05-video/chapters.json"));
  const transcript = readJson<any>(path.join(d, "04-transcription/full_transcript.json"));
  let tOff = 0;
  const trClips = (transcript?.clips ?? []).map((c: any) => { const r = { id: c.sectionId, startMs: Math.round(tOff * 1000), durationMs: Math.round(c.duration * 1000), matchedPct: c.matchedPct ?? null, text: c.text ?? "", words: (c.words ?? []).length }; tOff += c.duration; return r; });
  const masterReport = readJson<any>(path.join(d, "06-audio/master.json"));

  // plan
  const plan = readJson<any>(path.join(d, "05-video/acts.json"));
  const unverified: string[] = [];
  const acts = (plan?.acts ?? []).map((a: any) => {
    for (const b of a.beats ?? []) for (const x of b.data ?? []) if (/unverified|narration/i.test(String(x.source ?? ""))) unverified.push(`${a.id}: ${x.label} = ${x.value}${x.unit ? " " + x.unit : ""}`);
    const beats = (a.beats ?? []).map((b: any) => ({ startMs: b.startMs, endMs: b.endMs, vo: b.vo ?? "", visual: b.visual ?? "", camera: b.camera ?? "",
      hits: (b.hits ?? []).map((h: any) => ({ word: h.word, occurrence: h.occurrence ?? 1, what: h.what ?? "" })),
      data: (b.data ?? []).map((x: any) => ({ label: x.label, value: x.value, unit: x.unit ?? "", source: x.source ?? "" })) }));
    return { id: a.id, slug: a.slug, title: a.title, startMs: a.startMs, endMs: a.endMs, bpm: a.bpm, chapter: a.chapter ?? null, idea: a.idea ?? "", beats: beats.length,
      detail: { sheet: a.sheet ?? "", signature: a.signature ?? "", camera: a.camera ?? "", transitionIn: a.transitionIn ?? "", sound: a.sound ?? "", intensity: a.intensity ?? null, beats } };
  });

  // acts
  const scenes = sceneFiles(ws);
  const last = lastRuns(ws);
  const actRows = acts.map((a: any) => {
    const rdir = `05-video/review/${a.id}`;
    const abs = path.join(d, rdir);
    const critics = ls(abs, /^critic_\d+\.json$/).sort((x, y) => fs.statSync(path.join(abs, x)).mtimeMs - fs.statSync(path.join(abs, y)).mtimeMs);   // newest last (numbers restart per author run)
    const critic = critics.length ? readJson(path.join(abs, critics[critics.length - 1])) : null;
    const notesPath = path.join(d, notesRel(a.id));
    const scene = scenes[a.id] ? fileInfo(ws, scenes[a.id]) : null;
    let status: St = sceneStatus(ws, a.id, scenes[a.id]);
    if (runningJobs(ws).some((j) => j.locks.includes(`act:${a.id}`) && /^(acts|act:|fix:)/.test(j.step))) status = "running";
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
      approval: scene ? actApproval(ws, a.id, scene.mtime) : null,
      meta: stepMeta(rows, new RegExp(`\\b${a.id}\\b`)),
    };
  });

  // sound
  const soundFiles = ["06-audio/music.wav", "06-audio/mix.wav", "06-audio/mix_daw.wav"].map((r) => fileInfo(ws, r)).filter(Boolean);
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
    kind: kindOf(ws),
    style: plan?.style ?? null,
    title: sh.isShortsProject(ws) ? briefTitle(ws) : plan?.video?.title ?? null,
    statuses: stepStatuses(ws),
    meta,
    script: {
      file: scriptInfo, sections: sectionCount, sectionsInfo: fileInfo(ws, "03-voiceover/sections/index.ts"),
      idea: readText(path.join(d, "02-scripting/idea.md")), ideaInfo: fileInfo(ws, "02-scripting/idea.md"),
      research: readText(path.join(d, "02-scripting/research.md")), researchInfo: fileInfo(ws, "02-scripting/research.md"),
      feedback: readText(path.join(d, "02-scripting/feedback.md")), notes: readText(path.join(d, "02-scripting/script_notes.md")),
      approval: approvalState(ws), approvedAt: readJson<any>(path.join(d, "02-scripting/approved.json"))?.at ?? null,
      words: spokenWords(readText(path.join(d, "02-scripting/script_raw.md"))),
    },
    runs: (readJson<any[]>(path.join(d, "dashboard_runs.json")) ?? []).slice(-80),
    totals: { ms: allRows.reduce((a, r) => a + (r.ms ?? 0), 0), costUsd: allRows.reduce((a, r) => a + (r.costUsd ?? 0), 0) },
    voice: { parts: voiceParts, combined, sectionCount, freshWavs, running: !!voiceSince, sections: voiceSections, scanned: !!voiceManifest, baseStyle: voiceManifest?.baseStyle ?? null, engine: readJson<any>(path.join(audioDir, "voice.json"))?.engine ?? null },
    align: { holds: holdsSummary(ws), voice: fileInfo(ws, "03-voiceover/audio/combined/full_voiceover.wav"), post: readJson(path.join(audioDir, "post.json")) ? (({ speed, gap, chapterGap, maxPause }) => ({ speed, gap, chapterGap, maxPause: maxPause ?? 0 }))(readJson(path.join(audioDir, "post.json"))) : null, master: fileInfo(ws, "06-audio/voiceover_master.wav"), masterReport, rawVoice: fileInfo(ws, "03-voiceover/audio/combined/full_voiceover.wav"),
      transcript: transcript ? { model: transcript.model ?? null, at: transcript.generatedAt ?? null, clips: trClips } : null,
      srt: fileInfo(ws, `07-assembly/export/${ws}.srt`), words: captions?.length ?? null, durationMs: captions?.length ? captions[captions.length - 1].endMs : null, chapters: chapters ?? [] },
    plan: { file: fileInfo(ws, "05-video/acts.json"), logline: plan?.treatment?.logline ?? null, style: plan?.style ?? null,
      treatment: plan?.treatment ? Object.fromEntries(Object.entries(plan.treatment).filter(([k, v]) => k !== "logline" && (typeof v === "string" || Array.isArray(v))).map(([k, v]) => [k, Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" · ") : v])) : {},
      acts, unverified, approval: planApproval(ws),
      // acts whose narration a script change rewrote (replan), until Update changed acts redraws them
      changed: readJson<any>(path.join(d, "05-video/changed_acts.json"))?.acts ?? {} },
    acts: actRows,
    sound: { daw: dawInfo(ws, wsDir), files: soundFiles, stems, events: events?.length ?? null, musicPlan: fileInfo(ws, "06-audio/music_plan.json"), credits,
      // what Cues / Music stem made: events per sound and per act, and the music sections (with where each came from)
      eventTypes: Object.entries((events ?? []).reduce((m: Record<string, number>, e: any) => { m[e.type] = (m[e.type] ?? 0) + 1; return m; }, {})).sort((a: any, b: any) => b[1] - a[1]),
      eventActs: Object.entries((events ?? []).reduce((m: Record<string, number>, e: any) => { m[e.act] = (m[e.act] ?? 0) + 1; return m; }, {})),
      // the shared music library (assets/music/index.json, `music:lib`) and the prompts for generating beds by hand
      library: { tracks: readJson<any>(path.join(REPO, "assets/music/index.json"))?.tracks ?? [], prompts: readJson<any>(path.join(REPO, "workflow/06-audio/music_prompts.json")) },
      music: (() => {
        const m = readJson<any>(path.join(d, "06-audio/music.json")), plan = readJson<any>(path.join(d, "06-audio/music_plan.json"));
        if (!m) return null;
        return { duration: m.duration, crossfadeSec: m.crossfadeSec ?? null, planDuration: plan?.duration ?? null,
          sections: (m.sections ?? []).map((x: any) => ({ label: x.label, title: x.title ?? null, t0: x.t0, t1: x.t1, intro: x.intro ?? null,
            source: x.source?.type === "file" ? `file: ${path.basename(String(x.source.path ?? x.source.file ?? ""))}` : x.source?.type === "synth" ? `synth (${x.source.palette ?? "default"})` : String(x.source?.type ?? "?"),
            bpm: x.source?.bpm ?? null, key: x.source?.key ? `${x.source.key} ${x.source.mode ?? ""}`.trim() : null, intensity: x.source?.intensity ?? null })) };
      })() },
    render: { videos, qc, manifest, ...renderStates(ws), seams: (() => {
      const f = path.join(wsDir(ws), "05-video/review/seams/report.json"), r = readJson<{ at: string; seams: any[] }>(f);
      return r ? { at: r.at, mtime: mtime(f), seams: r.seams } : null;
    })() },
    timings: allRows,
    jobs: (jobsByWs.get(ws) ?? []).map((j) => jobs.get(j)).filter(Boolean).map((j) => jobSummary(j!)),
    lastRuns: last,
    publish: publishDetails(ws),
    shorts: shortsDetails(ws),
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

// ───────────────────────────── project overview: downloads, size, foley edits ─────────────────────────────

/** The folder of the long video (short = null) or of one of its shorts. */
const subWs = (ws: string, short: string | null) => (short ? sh.shortWs(ws, short) : wsDir(ws));
/** ?short=S1 → "S1" | null; a Response when it names a short that does not exist. */
function shortParam(ws: string, url: URL): string | null | Response {
  const sid = url.searchParams.get("short");
  if (!sid) return null;
  return sh.SHORT_ID.test(sid) && sh.listShorts(ws).includes(sid) ? sid : bad("unknown short");
}

const sizeCache = new Map<string, { at: number; bytes: number }>();
/** Disk size of a folder (du), cached for a minute: the overview polls it. */
async function dirBytes(dir: string): Promise<number> {
  const c = sizeCache.get(dir);
  if (c && Date.now() - c.at < 60_000) return c.bytes;
  let bytes = c?.bytes ?? 0;
  try {
    const proc = Bun.spawn(["du", "-sk", dir], { stdout: "pipe", stderr: "ignore" });
    const out = await new Response(proc.stdout).text();
    const kb = parseInt(out.split(/\s+/)[0], 10);
    if (Number.isFinite(kb)) bytes = kb * 1024;
  } catch {}
  sizeCache.set(dir, { at: Date.now(), bytes });
  return bytes;
}

/** 08-deliver/deliver.json with every item checked against the disk (a missing file is flagged, a path that leaves the folder is dropped). */
function deliverInfo(dir: string) {
  const j = readJson<any>(path.join(dir, "08-deliver/deliver.json"));
  if (!j || !Array.isArray(j.items)) return null;
  const items = j.items.flatMap((it: any) => {
    if (!it || typeof it.key !== "string" || typeof it.file !== "string" || path.isAbsolute(it.file) || it.file.split(/[\\/]+/).includes("..")) return [];
    let bytes = 0, present = false;
    try { const st = fs.statSync(path.join(dir, it.file)); present = st.isFile(); bytes = st.size; } catch {}
    return [{ key: it.key, group: String(it.group ?? "other"), label: String(it.label ?? it.key), file: it.file, bytes, present, note: typeof it.note === "string" ? it.note : undefined }];
  });
  return { builtAt: Number(j.builtAt) || 0, items };
}

const FOLEY_KEY = /^[^\0\r\n]{1,200}$/;
/** sfx_edits.json: { off: [key], gainDb: { key: -24..6 } }; anything else is refused. */
function validSfxEdits(b: any): { off: string[]; gainDb: Record<string, number> } | string {
  if (!b || typeof b !== "object" || Array.isArray(b)) return "body must be an object";
  const off = b.off ?? [], gain = b.gainDb ?? {};
  if (!Array.isArray(off) || off.length > 20000 || off.some((k: unknown) => typeof k !== "string" || !FOLEY_KEY.test(k))) return "off: a list of event keys";
  if (!gain || typeof gain !== "object" || Array.isArray(gain)) return "gainDb: an object of key → dB";
  const g: Record<string, number> = {};
  for (const [k, v] of Object.entries(gain)) {
    if (!FOLEY_KEY.test(k) || typeof v !== "number" || !Number.isFinite(v) || v < -24 || v > 6) return `gainDb ${k.slice(0, 40)}: a number from -24 to 6`;
    if (v !== 0) g[k] = Math.round(v * 10) / 10;
  }
  return { off: [...new Set<string>(off)], gainDb: g };
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

const SECRET = /KEY|TOKEN|SECRET|PASS|API/i;
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
      const rows = timingsAll(id);
      return { id, kind: kindOf(id), statuses: stepStatuses(id), running: runningJob(id) ? jobSummary(runningJob(id)!) : null,
        title: sh.isShortsProject(id) ? briefTitle(id) : readJson(path.join(wsDir(id), "05-video/acts.json"))?.video?.title ?? null,
        // a shorts project's progress: one entry per short (exported / started / not yet)
        shorts: sh.listShorts(id).map((s) => { const p = sh.shortProgress(id, s); return p.exported ? "done" : p.script ? "partial" : "none"; }),
        totals: { ms: rows.reduce((a, r) => a + (r.ms ?? 0), 0), costUsd: rows.reduce((a, r) => a + (r.costUsd ?? 0), 0) } };
    });
}

/** Blocks cross-site requests and DNS rebinding: Host must be ours; writes need a custom header (forces CORS preflight). */
function guard(req: Request): Response | null {
  if (viaPublic.has(req)) return req.method !== "GET" && req.method !== "HEAD" && req.headers.get("x-wg") !== "1" ? bad("missing x-wg header", 403) : null;
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

const dawCtx: DawCtx = { guard, json, bad, wsDir, validWs, childEnv, killTree, pump, ansi: ANSI };
const anCtx: AnalyticsCtx = { json, bad, body, startJob, runningJob, jobSummary, getJob: (id) => jobs.get(id), logStream };

async function appFetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const p = url.pathname;
    const daw = await dawRoute(req, url, dawCtx);
    if (daw) return daw;
    const g = guard(req);
    if (g) return g;
    const an = await analyticsRoute(req, url, anCtx);
    if (an) return an;

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
      const rows = listWorkspaces().flatMap((w) => timingsAll(w.id).map((r) => ({ ws: w.id, ...r })));
      await refreshUsage(url.searchParams.has("refresh"));
      return json(usageReport(rows));
    }
    if (p === "/api/limits" && req.method === "GET") return json(limits());
    if (p === "/api/session" && req.method === "GET") return json({ remote: viaPublic.has(req), publicUrl });
    // Settings → Models: which model runs each agent step (workflow/models.json) and every model found on this machine
    if (p === "/api/models" && (req.method === "GET" || req.method === "POST")) {
      const cat = catalog(req.method === "POST");
      const d = readDefaults();
      return json({
        roles: Object.entries(ROLES).map(([key, r]) => ({ key, label: r.label, group: r.group, edits: r.edits, builtin: r.def, current: parseSpec(d[key] ?? r.def).spec, custom: key in d })),
        providers: Object.fromEntries(Object.entries(PROVIDERS).map(([k, v]) => [k, { ...v, ...cat[k as keyof typeof cat] }])),
      });
    }
    if (p === "/api/models" && req.method === "PUT") {
      const b = await body(req);
      try { writeDefault(String(b.role ?? ""), b.spec ? String(b.spec) : null); } catch (e) { return bad((e as Error).message); }
      return json({ ok: true });
    }

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

    if (p === "/api/settings/notify" && req.method === "GET") { const { topic, ...c } = notifyCfg(); return json({ ...c, topicSet: !!topic }); }
    if (p === "/api/settings/notify/test" && req.method === "POST") {
      const b = await body(req);
      const only = b.only === "mac" || b.only === "phone" ? b.only : undefined;
      notify("WealthGap dashboard", "Test notification: this channel works.", true, "bell", only);
      const { topic, ...c } = notifyCfg();
      return json({ ok: true, sent: { mac: c.mac && only !== "phone", phone: c.phone && only !== "mac" } });
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
      if (typeof id !== "string" || !WS_ID.test(id)) return bad("ID must match VID<n>_<Name> (a video) or SH<n>_<Name> (shorts), letters, digits, underscores");
      if (exists(wsDir(id))) return bad("workspace already exists", 409);
      if (runningJob(id)) return bad("already being created", 409);
      const job = startJob(id, "new-video", `New ${sh.isShortsProject(id) ? "shorts project" : "video"} ${id}`, [B("new-video", id)]);
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
      const { action, act, opts, dry } = await body(req);
      if (typeof action !== "string") return bad("action required");
      if (dry === true) {   // validate and show the commands without running them
        const c = commandFor(ws, action, opts && typeof opts === "object" && !Array.isArray(opts) ? opts : {}, typeof act === "string" ? act.toUpperCase() : undefined);
        return typeof c === "string" ? bad(c) : json({ label: c.label, cmds: c.cmds });
      }
      const o = opts && typeof opts === "object" && !Array.isArray(opts) ? opts : {};
      const c = commandFor(ws, action, o, typeof act === "string" ? act.toUpperCase() : undefined);
      if (typeof c === "string") return bad(c);
      // jobs on different acts run side by side; anything that touches the same act, or the whole video, waits
      const busy = clashWith(ws, c.locks);
      if (busy) return bad(`busy: ${busy.label} is running${busy.locks.includes("*") ? "" : ` (it uses ${busy.locks.filter((l) => c.locks.includes(l) || c.locks.includes("*")).map((l) => l.replace("act:", "")).join(", ")})`}`, 409);
      return json({ job: jobSummary(startJob(ws, c.key, c.label, c.cmds, o, c.locks)) });
    }

    if (rest === "/stop" && req.method === "POST") {
      const { job: jid } = await body(req).catch(() => ({}));
      const j = typeof jid === "string" ? runningJobs(ws).find((x) => x.id === jid) : runningJob(ws);
      if (!j) return bad("nothing running", 404);
      j.stopRequested = true;
      if (j.pid) killTree(j.pid);
      setTimeout(() => { if (j.status === "running" && j.pid) killTree(j.pid, "SIGKILL"); }, 5000);
      return json({ ok: true });
    }

    // the creator's text files: draft, feedback on the last script, the script itself
    const tm = rest.match(/^\/text\/(idea|feedback|research)$/);
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

    const pnm = rest.match(/^\/publish\/notes\/([ABC]|meta)$/);
    if (pnm && req.method === "PUT") {
      const text = await req.text();
      if (text.length > 100_000) return bad("notes too large");
      const f = pub.pubFile(ws, `notes/${pnm[1]}.md`);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, text, "utf-8");
      return json({ ok: true });
    }

    // titles / description / tags edited in the dashboard: saved to metadata.json (and description.txt), checks re-run
    if (rest === "/publish/metadata" && req.method === "PUT") {
      const meta = readJson<any>(pub.pubFile(ws, "metadata.json"));
      if (!meta) return bad("no metadata yet: run Titles & description first");
      if (runningJob(ws)?.step === "publish") return bad("a publish job is running", 409);
      const before = JSON.stringify([meta.titles, meta.description, meta.tags, meta.hashtags]);
      const b = await body(req);
      if (b.titles && typeof b.titles === "object") for (const v of pub.VARIANTS) if (b.titles[v] !== undefined) {
        if (typeof b.titles[v] !== "string" || b.titles[v].length > 300) return bad(`title ${v}: text up to 300 characters`);
        meta.titles[v].title = b.titles[v].trim();
      }
      if (b.description !== undefined) { if (typeof b.description !== "string" || b.description.length > 20000) return bad("description: text up to 20000 characters"); meta.description = b.description.replace(/\r\n/g, "\n"); }
      if (b.tags !== undefined) { if (!Array.isArray(b.tags) || b.tags.some((t: unknown) => typeof t !== "string")) return bad("tags: a list of text"); meta.tags = b.tags.map((t: string) => t.trim()).filter(Boolean); }
      if (b.hashtags !== undefined) { if (!Array.isArray(b.hashtags) || b.hashtags.some((t: unknown) => typeof t !== "string")) return bad("hashtags: a list of text"); meta.hashtags = b.hashtags.map((t: string) => t.trim()).filter(Boolean); }
      if (JSON.stringify([meta.titles, meta.description, meta.tags, meta.hashtags]) !== before) meta.edited = true;
      meta.checks = pub.recheck(ws, meta);
      atomicWrite(pub.pubFile(ws, "metadata.json"), JSON.stringify(meta, null, 2));
      atomicWrite(pub.pubFile(ws, "description.txt"), meta.description);
      return json({ ok: true, checks: meta.checks });
    }

    if (rest === "/publish/approve" && (req.method === "POST" || req.method === "DELETE")) {
      if (req.method === "DELETE") { fs.rmSync(approvalFile(ws), { force: true }); return json({ ok: true }); }
      if (!exists(pub.pubFile(ws, "metadata.json")) || PUB_FILES(ws).some((p) => !p)) return bad("needs the metadata and all three thumbnails first");
      fs.writeFileSync(approvalFile(ws), JSON.stringify({ at: new Date().toISOString(), hash: publishHash(ws) }));
      return json({ ok: true });
    }

    // shorts: allowlisted text files only (a short's script, feedback, director notes; the folder's feedback)
    const ssm = rest.match(/^\/shorts\/(?:(S\d{1,2})\/(script|feedback|notes)|(feedback))$/);
    if (ssm && req.method === "PUT") {
      const sid = ssm[1];
      if (sid && !sh.listShorts(ws).includes(sid)) return bad("unknown short");
      const text = await req.text();
      if (text.length > 1_000_000) return bad("too large");
      const rel = sid ? { script: "02-scripting/script_raw.md", feedback: "02-scripting/feedback.md", notes: SHORT_NOTES }[ssm[2] as "script" | "feedback" | "notes"] : null;
      const f = sid ? path.join(sh.shortWs(ws, sid), rel!) : path.join(sh.shortsDir(ws), "feedback.md");
      if (sid && ssm[2] === "script" && runningJob(ws)?.step === "shorts") return bad("a shorts job is running", 409);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      if (sid && ssm[2] === "script" && exists(f)) fs.copyFileSync(f, f.replace(/\.md$/, ".prev.md"));
      fs.writeFileSync(f, text, "utf-8");
      return json({ ok: true });
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

    // Align → Pauses: every section's words with the places a pause may go (from the last scan), for the picker
    if (rest === "/align/holdpoints" && req.method === "GET") {
      const d = wsDir(ws), audio = path.join(d, "03-voiceover/audio");
      const pts = readJson<any>(path.join(audio, "hold_points.json"));
      if (!pts) return json({ sections: [], at: null });
      const parts = exists(audio) ? fs.readdirSync(audio).filter((x) => /^part-\d+$/.test(x)).sort((a, b) => parseInt(a.slice(5)) - parseInt(b.slice(5))) : [];
      const ids = parts.flatMap((p) => fs.readdirSync(path.join(audio, p)).filter((f) => f.endsWith(".wav")).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map((f) => ({ id: f.replace(/\.wav$/, ""), part: parseInt(p.slice(5)) })));
      let off = 0;
      const sections = ids.map(({ id, part }) => {
        const w = readJson<any>(path.join(d, "04-transcription/words", `${id}.json`));
        const out = { id, part, startS: off, words: (w?.words ?? []).map((x: any) => x.word as string), points: pts.sections[id]?.points ?? [] };
        off += w?.duration ?? 0;
        return out;
      });
      return json({ at: pts.at, sections });
    }
    if (rest === "/align/holds" && req.method === "PUT") {
      const b = await body(req).catch(() => null);
      if (!b || !Array.isArray(b.holds)) return bad("{holds: [...]}");
      const out = [];
      for (const h of b.holds) {
        if (!h || typeof h.section !== "string" || !/^[\w-]+$/.test(h.section)) return bad("bad section");
        if (!(h.after === "end" || (Number.isInteger(h.after) && h.after >= 0))) return bad("bad position");
        const ms = Math.round(Number(h.ms));
        if (!(ms >= 50 && ms <= 4000)) return bad("a pause is 50–4000 ms");
        out.push({ id: /^[\w-]{1,40}$/.test(String(h.id)) ? String(h.id) : crypto.randomUUID().slice(0, 8), section: h.section, after: h.after, word: String(h.word ?? "").slice(0, 80), ...(h.next ? { next: String(h.next).slice(0, 80) } : {}),
          ms, on: h.on !== false, by: String(h.by ?? "you").slice(0, 40), ...(h.why ? { why: String(h.why).slice(0, 300) } : {}), ...(h.act ? { act: String(h.act).slice(0, 8) } : {}), ...(h.note ? { note: String(h.note).slice(0, 300) } : {}), ...(h.key ? { key: String(h.key).slice(0, 200) } : {}) });
      }
      fs.writeFileSync(path.join(wsDir(ws), "03-voiceover/holds.json"), JSON.stringify({ holds: out }, null, 2) + "\n");
      return json({ ok: true });
    }

    // Voice → Review: per section { note, direction?, status: open | regenerated, at }; generate.ts --review reads it
    if (rest === "/voice/review" && req.method === "PUT") {
      const b = await body(req).catch(() => null);
      if (!b || typeof b !== "object" || Array.isArray(b)) return bad("a JSON object of sections");
      const out: Record<string, any> = {};
      for (const [id, r] of Object.entries<any>(b)) {
        if (!/^[\w-]+$/.test(id) || !r || typeof r !== "object") return bad(`bad entry ${id}`);
        const note = String(r.note ?? "").slice(0, 2000), direction = String(r.direction ?? "").slice(0, 2000);
        out[id] = { note, ...(direction.trim() ? { direction } : {}), status: r.status === "regenerated" ? "regenerated" : "open", at: typeof r.at === "string" ? r.at : new Date().toISOString(), ...(r.regeneratedAt ? { regeneratedAt: String(r.regeneratedAt) } : {}) };
      }
      fs.writeFileSync(voiceReviewPath(ws), JSON.stringify(out, null, 2));
      return json({ ok: true });
    }

    // your approval of the plan as it is (also when it is out of sync with the captions or failed validation):
    // the act author then starts without the freshness check (05-video/src/lib/freshness.ts)
    if (rest === "/plan/approve" && (req.method === "POST" || req.method === "DELETE")) {
      const f = path.join(wsDir(ws), "05-video/plan_approved.json");
      if (req.method === "DELETE") { fs.rmSync(f, { force: true }); return json({ ok: true }); }
      const plan = path.join(wsDir(ws), "05-video/acts.json");
      if (!exists(plan)) return bad("no plan yet");
      fs.writeFileSync(f, JSON.stringify({ at: new Date().toISOString(), sha256: new Bun.CryptoHasher("sha256").update(fs.readFileSync(plan)).digest("hex") }, null, 2));
      return json({ ok: true });
    }

    // let the running acts of a batch finish, start no new ones (author_act.ts checks this file)
    if (rest === "/acts/stop-batch" && req.method === "POST") {
      if (!runningJobs(ws).some((j) => j.step === "acts")) return bad("no batch is running", 404);
      fs.writeFileSync(path.join(wsDir(ws), "05-video/.batch_stop"), new Date().toISOString());
      return json({ ok: true });
    }

    const am = rest.match(/^\/approve\/(A\d{2,3})$/);
    if (am && (req.method === "POST" || req.method === "DELETE")) {
      if (!actIds(ws).includes(am[1])) return bad("unknown act");
      const f = approvalPath(ws, am[1]);
      if (req.method === "DELETE") { fs.rmSync(f, { force: true }); return json({ ok: true }); }
      const sc = sceneFiles(ws)[am[1]];
      if (!sc) return bad("act has no scene file yet");
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, JSON.stringify({ at: new Date().toISOString(), sceneMtime: mtime(path.join(wsDir(ws), sc)) }));
      return json({ ok: true });
    }

    if (rest === "/studio" && req.method === "POST") {
      if (studio && studio.exited === null) return bad(studio.ws === ws ? "studio already running" : `studio is running for ${studio.ws}; stop it first`, 409);
      if (!exists(path.join(wsDir(ws), "05-video/src/index.ts"))) return bad("no 05-video/src/index.ts yet (run an act or assemble first)");
      return json({ studio: (startStudio(ws), studioState()) });
    }

    if (rest === "/overview" && req.method === "GET") {
      const ids = sh.listShorts(ws);
      const [total, ...per] = await Promise.all([dirBytes(wsDir(ws)), ...ids.map((id) => dirBytes(sh.shortWs(ws, id)))]);
      return json({
        bytes: { total, shorts: Object.fromEntries(ids.map((id, i) => [id, per[i]])) },
        deliver: { video: deliverInfo(wsDir(ws)), shorts: Object.fromEntries(ids.map((id) => [id, deliverInfo(sh.shortWs(ws, id))])) },
      });
    }

    // a file as a download (attachment); same path rules as /file
    if (rest === "/download" && req.method === "GET") {
      const abs = safePath(ws, url.searchParams.get("path"));
      if (!abs) return bad("path rejected", 403);
      if (!fs.statSync(abs).isFile()) return bad("not a file", 404);
      const res = serveFile(req, abs), name = path.basename(abs);
      res.headers.set("content-disposition", `attachment; filename="${name.replace(/[^\w.-]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`);
      return res;
    }

    // foley review: every event the acts declare, the user's edits and the playable clips
    if (rest === "/sfx" && (req.method === "GET" || req.method === "PUT")) {
      const sid = shortParam(ws, url);
      if (sid instanceof Response) return sid;
      const dir = subWs(ws, sid), editsF = path.join(dir, "05-video/sfx_edits.json");
      if (req.method === "GET") {
        const edits = readJson<any>(editsF) ?? {};
        const events = readJson<any[]>(path.join(dir, "05-video/events_all.json"));
        const clips = readJson<any[]>(path.join(dir, "06-audio/sfx_clips/manifest.json"));
        const have = new Set((clips ?? []).map((c) => c?.key));
        return json({
          events: Array.isArray(events) ? events : null, eventsAt: mtime(path.join(dir, "05-video/events_all.json")),
          edits: { off: Array.isArray(edits.off) ? edits.off : [], gainDb: edits.gainDb && typeof edits.gainDb === "object" ? edits.gainDb : {} },
          clips: Array.isArray(clips) ? clips : null, clipsMissing: Array.isArray(events) && Array.isArray(clips) ? events.filter((e) => !have.has(e.key)).length : null,
          draft: fileInfo(ws, sid ? `shorts/${sid}/05-video/draft.mp4` : "05-video/draft.mp4"),
        });
      }
      const v = validSfxEdits(await body(req));
      if (typeof v === "string") return bad(v);
      fs.mkdirSync(path.dirname(editsF), { recursive: true });
      atomicWrite(editsF, JSON.stringify(v, null, 1));
      return json({ ok: true, edits: v });
    }

    if (rest === "/file" && (req.method === "GET" || req.method === "HEAD")) {
      const abs = safePath(ws, url.searchParams.get("path"));
      if (!abs) return bad("path rejected", 403);
      if (!fs.statSync(abs).isFile()) return bad("not a file", 404);
      return serveFile(req, abs);
    }

    return bad("not found", 404);
}

const LIMIT_BODY = 1024 * 1024 * 1024; // the mix exported from openDAW is ~150 MB
const server = Bun.serve({ hostname: HOST, port: PORT, idleTimeout: 0, maxRequestBodySize: LIMIT_BODY, fetch: appFetch });

console.log(`🎛  WealthGap dashboard on http://${HOST}:${server.port}`);
if (HOST !== "127.0.0.1") {
  for (const ip of lanIps()) console.log(`   on your network: http://${ip}:${server.port}  (no login: home network only)`);
}
if (PUBLIC) startPublic();
{ const c = notifyCfg(); console.log(`   notifications: Mac ${c.mac ? "on" : "off"}, phone ${c.phone ? "on" : c.topic ? "off" : "off (no NTFY_TOPIC)"} (Settings → Notifications)`); }

function startPublic() {
  if (!readPass(ENV_FILE)) { console.log("   ✗ internet access off: set PWA_PASS=<password> in .env first"); return; }
  const handler = publicHandler({ repo: REPO, envFile: ENV_FILE, dist: DIST, app: appFetch, markPublic: (r) => viaPublic.add(r) });
  Bun.serve({ hostname: "127.0.0.1", port: PUBLIC_PORT, idleTimeout: 0, maxRequestBodySize: LIMIT_BODY, fetch: handler });
  const f = startFunnel(PUBLIC_PORT);
  if (!f.ok) { console.log(`   ✗ internet access off: ${f.why}`); return; }
  publicUrl = f.url;
  // keep the Mac awake while the dashboard is published (idle sleep would take the link down; closing the lid still sleeps)
  try { Bun.spawn(["caffeinate", "-i", "-w", String(process.pid)], { stdout: "ignore", stderr: "ignore" }); } catch {}
  console.log(`\n   🌍 on the internet (password: PWA_PASS): ${f.url}\n`);
  console.log(qr(f.url).split("\n").map((l) => "   " + l).join("\n"));
  console.log("   Scan with your phone, sign in, then Share → Add to Home Screen (iPhone) or Install app (Android).\n");
}

function shutdown() {
  if (publicUrl) stopFunnel();
  if (studio?.pid) killTree(studio.pid);
  stopDaw(dawCtx);
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
