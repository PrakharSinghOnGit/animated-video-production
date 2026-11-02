/**
 * Voiceover mastering: cleans the combined TTS voiceover and masters it to
 * broadcast loudness. Sample-accurate duration is preserved (word timestamps
 * depend on it).
 *
 * Usage: bun run audio:master --video <ID> [--in <wav>] [--out <wav>] [--target-lufs -14] [--tp -1]
 *          [--highpass 80] [--deess 0.3] [--ratio 2.5] [--threshold -20] [--no-room-tone]
 * Writes 06-audio/master.json beside the output: the chain with its settings and the loudness before and after.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { resolveJobPaths } from "../05-video/src/lib/workspaceBridge";

const REPO_ROOT = path.resolve(import.meta.dir, "..", "..");
const SAMPLE_RATE = 48000;
const DURATION_TOLERANCE_SEC = 0.01;
const LRA_TARGET = 11;

interface Options {
  video: string;
  input?: string;
  output?: string;
  targetLufs: number;
  truePeak: number;
  highpass: number;      // Hz, 0 = off
  deess: number;         // de-esser intensity 0..1, 0 = off
  ratio: number;         // compressor ratio, 1 = off
  threshold: number;     // compressor threshold (dB)
  roomTone: boolean;
}

interface Metrics {
  integrated: number;
  truePeak: number;
  lra: number;
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const opts: Options = { video: "", targetLufs: -14, truePeak: -1, highpass: 80, deess: 0.3, ratio: 2.5, threshold: -20, roomTone: true };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--video" || a === "-v") opts.video = args[++i];
    else if (a === "--in") opts.input = args[++i];
    else if (a === "--out") opts.output = args[++i];
    else if (a === "--target-lufs") opts.targetLufs = parseFloat(args[++i]);
    else if (a === "--tp") opts.truePeak = parseFloat(args[++i]);
    else if (a === "--highpass") opts.highpass = parseFloat(args[++i]);
    else if (a === "--deess") opts.deess = parseFloat(args[++i]);
    else if (a === "--ratio") opts.ratio = parseFloat(args[++i]);
    else if (a === "--threshold") opts.threshold = parseFloat(args[++i]);
    else if (a === "--no-room-tone") opts.roomTone = false;
    else fail(`Unknown argument: ${a}`);
  }
  if (!opts.video) fail("Missing --video <ID>");
  if (![opts.targetLufs, opts.truePeak, opts.highpass, opts.deess, opts.ratio, opts.threshold].every(Number.isFinite)) fail("numeric options must be numbers");
  if (opts.deess < 0 || opts.deess > 1) fail("--deess is 0..1");
  if (opts.ratio < 1 || opts.ratio > 20) fail("--ratio is 1..20");
  return opts;
}

function fail(msg: string): never {
  console.error(`[audio:master] ERROR: ${msg}`);
  process.exit(1);
}

function ffmpeg(args: string[]): string {
  const res = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-y", ...args], { encoding: "utf-8", maxBuffer: 256 * 1024 * 1024 });
  if (res.error || res.status !== 0) {
    fail(`ffmpeg failed (exit ${res.status}): ${res.error?.message ?? ""}\n${(res.stderr ?? "").split("\n").slice(-25).join("\n")}`);
  }
  return res.stderr;
}

function duration(file: string): number {
  const res = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file], { encoding: "utf-8" });
  const d = parseFloat(res.stdout);
  if (res.status !== 0 || !Number.isFinite(d)) fail(`ffprobe could not read duration of ${file}`);
  return d;
}

function hasFilter(name: string): boolean {
  const res = spawnSync("ffmpeg", ["-hide_banner", "-filters"], { encoding: "utf-8" });
  return new RegExp(`\\s${name}\\s`).test(res.stdout ?? "");
}

function measure(file: string): Metrics {
  const log = ffmpeg(["-i", file, "-af", "ebur128=peak=true", "-f", "null", "-"]);
  const summary = log.slice(log.lastIndexOf("Summary:"));
  const grab = (re: RegExp) => {
    const m = summary.match(re);
    if (!m) fail(`Could not parse ebur128 output for ${file}`);
    return parseFloat(m[1]);
  };
  return {
    integrated: grab(/I:\s+(-?[\d.]+|-inf)\s+LUFS/),
    lra: grab(/LRA:\s+(-?[\d.]+)\s+LU/),
    truePeak: grab(/Peak:\s+(-?[\d.]+|-inf)\s+dBFS/),
  };
}

function fmt(m: Metrics): string {
  return `I=${m.integrated.toFixed(1)} LUFS  TP=${m.truePeak.toFixed(2)} dBTP  LRA=${m.lra.toFixed(1)} LU`;
}

function resolveInput(opts: Options): string {
  if (opts.input) return path.resolve(opts.input);
  const combined = path.join(REPO_ROOT, "workspace", opts.video.replace(/^workspace[/\\]/, ""), "03-voiceover", "audio", "combined", "full_voiceover.wav");
  // Master from the raw combined file, never from an already-mastered one.
  if (fs.existsSync(combined)) return combined;
  const resolved = resolveJobPaths(opts.video, REPO_ROOT).audioFile;
  if (resolved) return resolved;
  return fail(`No voiceover found for ${opts.video}`);
}

function main() {
  const opts = parseArgs();
  const input = resolveInput(opts);
  if (!fs.existsSync(input)) fail(`Input not found: ${input}`);
  const output = opts.output
    ? path.resolve(opts.output)
    : path.join(REPO_ROOT, "workspace", opts.video.replace(/^workspace[/\\]/, ""), "06-audio", "voiceover_master.wav");
  if (output === input) fail("Output must differ from input");
  fs.mkdirSync(path.dirname(output), { recursive: true });

  const inDur = duration(input);
  console.log(`[audio:master] in:  ${input} (${inDur.toFixed(3)}s)`);
  console.log(`[audio:master] out: ${output}`);

  const before = measure(input);
  console.log(`[audio:master] before: ${fmt(before)}`);

  // Voice chain: highpass -> de-ess -> compress. Room tone is mixed under the whole file.
  const chain: { stage: string; what: string; settings: string; on: boolean }[] = [];
  const voice = ["aresample=48000"];
  if (opts.highpass > 0) voice.push(`highpass=f=${opts.highpass}`);
  chain.push({ stage: "High-pass EQ", what: "cuts rumble and mic thumps below the voice", settings: opts.highpass > 0 ? `${opts.highpass} Hz, 12 dB/oct` : "off", on: opts.highpass > 0 });
  const deess = opts.deess > 0 && hasFilter("deesser");
  if (opts.deess > 0 && !deess) console.warn("[audio:master] WARNING: ffmpeg 'deesser' filter unavailable; skipping de-ess");
  if (deess) voice.push(`deesser=i=${opts.deess}:m=0.5:f=0.5`);
  chain.push({ stage: "De-esser", what: "softens harsh s / sh sounds", settings: deess ? `intensity ${opts.deess}` : "off", on: deess });
  if (opts.ratio > 1) voice.push(`acompressor=threshold=${opts.threshold}dB:ratio=${opts.ratio}:attack=10:release=120:makeup=2`);
  chain.push({ stage: "Compressor", what: "evens out loud and quiet words", settings: opts.ratio > 1 ? `${opts.ratio}:1 above ${opts.threshold} dB, attack 10 ms, release 120 ms, +2 dB makeup` : "off", on: opts.ratio > 1 });
  chain.push({ stage: "Room tone", what: "very quiet pink noise under the voice so pauses aren't dead digital silence", settings: opts.roomTone ? "pink noise ~ -62 dBFS, low-passed 4 kHz" : "off", on: opts.roomTone });

  // Deterministic pink-noise room tone (fixed seed), ~-62 dBFS, lowpassed.
  const noise = `anoisesrc=color=pink:seed=1337:sample_rate=${SAMPLE_RATE}:duration=${(inDur + 1).toFixed(3)}:amplitude=0.1,lowpass=f=4000,volume=-50dB,aformat=channel_layouts=mono`;

  const buildGraph = (tail: string) => opts.roomTone
    ? `[0:a]${voice.join(",")},aformat=channel_layouts=mono[v];${noise}[n];[v][n]amix=inputs=2:duration=first:normalize=0,${tail}`
    : `[0:a]${voice.join(",")},aformat=channel_layouts=mono,${tail}`;

  const run = (tail: string, out: string, outArgs: string[]) =>
    ffmpeg(["-i", input, "-filter_complex", buildGraph(tail), ...outArgs, out]);

  const ln = (extra: string) =>
    `loudnorm=I=${opts.targetLufs}:TP=${opts.truePeak}:LRA=${LRA_TARGET}${extra}`;

  // Pass 1: measure.
  const log = run(ln(":print_format=json"), "-", ["-f", "null"]);
  const jsonStart = log.lastIndexOf("{");
  let stats: Record<string, string>;
  try {
    stats = JSON.parse(log.slice(jsonStart, log.indexOf("}", jsonStart) + 1));
  } catch {
    return fail("Could not parse loudnorm pass-1 JSON");
  }
  const measured =
    `:measured_I=${stats.input_i}:measured_TP=${stats.input_tp}:measured_LRA=${stats.input_lra}` +
    `:measured_thresh=${stats.input_thresh}:offset=${stats.target_offset}:linear=true`;

  const wavArgs = ["-ar", String(SAMPLE_RATE), "-ac", "1", "-c:a", "pcm_s24le", "-fflags", "+bitexact"];
  run(ln(measured), output, wavArgs);

  let after = measure(output);
  // Safety limiter only if true peak still exceeds the ceiling.
  if (after.truePeak > opts.truePeak + 0.05) {
    console.log(`[audio:master] true peak ${after.truePeak.toFixed(2)} > ${opts.truePeak}; applying alimiter`);
    const ceiling = Math.pow(10, (opts.truePeak - 0.5) / 20).toFixed(5);
    run(`${ln(measured)},alimiter=limit=${ceiling}:level=disabled:attack=5:release=50`, output, wavArgs);
    after = measure(output);
  }
  console.log(`[audio:master] after:  ${fmt(after)}`);

  const outDur = duration(output);
  const diff = Math.abs(outDur - inDur);
  console.log(`[audio:master] duration in=${inDur.toFixed(4)}s out=${outDur.toFixed(4)}s diff=${(diff * 1000).toFixed(2)}ms`);
  if (diff > DURATION_TOLERANCE_SEC) fail(`Duration drift ${(diff * 1000).toFixed(1)}ms exceeds 10ms; word timestamps would desync`);
  if (after.truePeak > opts.truePeak + 0.05) fail(`True peak ${after.truePeak} dBTP exceeds ${opts.truePeak}`);
  if (Math.abs(after.integrated - opts.targetLufs) > 0.5) console.warn(`[audio:master] WARNING: integrated loudness ${after.integrated} LUFS is off target ${opts.targetLufs}`);
  chain.push({ stage: "Loudness", what: "two-pass loudness normalisation to the YouTube target (+ a limiter only if peaks are still over)", settings: `${opts.targetLufs} LUFS, true peak ${opts.truePeak} dBTP, LRA ${LRA_TARGET}`, on: true });
  fs.writeFileSync(path.join(path.dirname(output), "master.json"), JSON.stringify({
    at: new Date().toISOString(), input: path.relative(REPO_ROOT, input), output: path.relative(REPO_ROOT, output),
    options: { targetLufs: opts.targetLufs, truePeak: opts.truePeak, highpass: opts.highpass, deess: opts.deess, ratio: opts.ratio, threshold: opts.threshold, roomTone: opts.roomTone },
    chain, before, after, durationIn: inDur, durationOut: outDur,
  }, null, 2));
}

main();
