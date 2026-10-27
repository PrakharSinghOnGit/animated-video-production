/**
 * Machine monitor for the dashboard (macOS, no sudo): CPU per core (os.cpus deltas), memory (vm_stat), GPU
 * utilisation + memory (ioreg IOAccelerator PerformanceStatistics), disk free (df), and the process table (ps) so a
 * job's whole process tree can be measured (CPU %, resident memory). Sampled every 2 s while someone is watching or a
 * job runs; a 10-minute history feeds the sparklines.
 */
import os from "node:os";

export interface Proc { pid: number; ppid: number; cpu: number; rssMB: number; comm: string }
export interface Sample {
  t: number;
  cpu: number;                 // whole machine, 0–100
  cores: number[];             // per core, 0–100
  memUsedGB: number; memTotalGB: number; swapUsedGB: number;
  gpu: number | null;          // device utilisation %, null if unavailable
  gpuMemGB: number | null;
  load: number[];
  diskFreeGB: number | null;
}

const HISTORY = 300;
export const history: Sample[] = [];
export let procs: Proc[] = [];
let prevCpu = os.cpus().map((c) => c.times);
let lastWanted = 0, diskAt = 0, diskFree: number | null = null;

const txt = (cmd: string[]) => { try { return Bun.spawnSync(cmd).stdout.toString(); } catch { return ""; } };

function cpuSample(): { total: number; cores: number[] } {
  const now = os.cpus().map((c) => c.times);
  const cores = now.map((t, i) => {
    const p = prevCpu[i] ?? t;
    const busy = (t.user - p.user) + (t.nice - p.nice) + (t.sys - p.sys) + (t.irq - p.irq);
    const all = busy + (t.idle - p.idle);
    return all > 0 ? Math.round((busy / all) * 1000) / 10 : 0;
  });
  prevCpu = now;
  return { total: Math.round((cores.reduce((a, b) => a + b, 0) / Math.max(1, cores.length)) * 10) / 10, cores };
}

function memSample(): { used: number; swap: number } {
  const vm = txt(["vm_stat"]);
  const page = Number(vm.match(/page size of (\d+)/)?.[1] ?? 16384);
  const get = (k: string) => Number(vm.match(new RegExp(`${k}:\\s+(\\d+)`))?.[1] ?? 0);
  const used = (get("Pages active") + get("Pages wired down") + get("Pages occupied by compressor")) * page;
  const sw = txt(["sysctl", "-n", "vm.swapusage"]).match(/used = ([\d.]+)M/);
  return { used: used / 1e9, swap: sw ? Number(sw[1]) / 1024 : 0 };
}

function gpuSample(): { util: number | null; memGB: number | null } {
  const io = txt(["ioreg", "-r", "-d", "1", "-w", "0", "-c", "IOAccelerator"]);
  const u = io.match(/"Device Utilization %"=(\d+)/), m = io.match(/"In use system memory"=(\d+)/);
  return { util: u ? Number(u[1]) : null, memGB: m ? Number(m[1]) / 1e9 : null };
}

function psSample(): Proc[] {
  return txt(["ps", "-A", "-o", "pid=,ppid=,%cpu=,rss=,comm="]).split("\n").map((l) => {
    const m = l.trim().match(/^(\d+)\s+(\d+)\s+([\d.]+)\s+(\d+)\s+(.*)$/);
    return m ? { pid: +m[1], ppid: +m[2], cpu: +m[3], rssMB: +m[4] / 1024, comm: m[5].split("/").pop()! } : null;
  }).filter(Boolean) as Proc[];
}

/** CPU % and memory of a process and all its descendants (from the last sample). */
export function treeUsage(pid: number): { cpu: number; rssMB: number; n: number; top: string[] } {
  const kids = new Map<number, Proc[]>();
  for (const p of procs) (kids.get(p.ppid) ?? kids.set(p.ppid, []).get(p.ppid)!).push(p);
  const self = procs.find((p) => p.pid === pid);
  const all: Proc[] = self ? [self] : [];
  const walk = (p: number) => { for (const c of kids.get(p) ?? []) { all.push(c); walk(c.pid); } };
  walk(pid);
  const top = [...all].sort((a, b) => b.cpu - a.cpu).slice(0, 3).map((p) => `${p.comm} ${Math.round(p.cpu)}%`);
  return { cpu: Math.round(all.reduce((s, p) => s + p.cpu, 0)), rssMB: Math.round(all.reduce((s, p) => s + p.rssMB, 0)), n: all.length, top };
}

export function sample(): Sample {
  const c = cpuSample(), m = memSample(), g = gpuSample();
  procs = psSample();
  if (Date.now() - diskAt > 60000) {
    const df = txt(["df", "-k", process.cwd()]).trim().split("\n").pop()?.split(/\s+/);
    diskFree = df ? Number(df[3]) / 1e6 : null; diskAt = Date.now();
  }
  const s: Sample = {
    t: Date.now(), cpu: c.total, cores: c.cores, memUsedGB: Math.round(m.used * 10) / 10, memTotalGB: Math.round(os.totalmem() / 1e8) / 10,
    swapUsedGB: Math.round(m.swap * 10) / 10, gpu: g.util, gpuMemGB: g.memGB === null ? null : Math.round(g.memGB * 10) / 10,
    load: os.loadavg().map((x) => Math.round(x * 100) / 100), diskFreeGB: diskFree === null ? null : Math.round(diskFree),
  };
  history.push(s);
  if (history.length > HISTORY) history.shift();
  return s;
}

export const want = () => { lastWanted = Date.now(); };
export const wanted = () => Date.now() - lastWanted < 20000;
export function topProcs(n = 8) {
  return [...procs].sort((a, b) => b.cpu - a.cpu).slice(0, n).map((p) => ({ pid: p.pid, comm: p.comm, cpu: Math.round(p.cpu), rssMB: Math.round(p.rssMB) }));
}
export const machine = () => ({ cpu: os.cpus()[0]?.model ?? "", cores: os.cpus().length, memGB: Math.round(os.totalmem() / 1e9), host: os.hostname() });
