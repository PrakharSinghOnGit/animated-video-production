/**
 * Closed captions for YouTube: captions.json (word-aligned) → an .srt the viewer can switch on.
 * The video itself shows no running subtitles (Briefing style: impact text only), so this file is the captions.
 *
 * Cues follow the voice: a new cue at every sentence end, at a comma once the cue is long, or when it would pass
 * two lines of 42 characters / 6 s. Each cue shows from its first word until the next cue (or its last word + 0.6 s).
 *
 * Usage: bun run srt --video <ID> [--out path.srt]   (default: workspace/<ID>/07-assembly/export/<ID>.srt)
 */
import fs from "node:fs";
import path from "node:path";
import { resolveJobPaths } from "../src/lib/workspaceBridge";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const videoId = flag("--video") ?? flag("-v") ?? args.find((a) => !a.startsWith("-"));
if (!videoId) {
  console.error("Usage: bun run srt --video <ID> [--out path.srt]");
  process.exit(1);
}
const paths = resolveJobPaths(videoId);
const captionsFile = path.join(paths.outputDir, "captions.json");
if (!fs.existsSync(captionsFile)) {
  console.error(`❌ Missing ${captionsFile}. Run "bun run captions --video ${paths.jobId}" first.`);
  process.exit(1);
}
const out = flag("--out") ?? path.join(path.dirname(paths.outputDir), "07-assembly", "export", `${paths.jobId.replace(/\//g, "_")}.srt`);

type Word = { text: string; startMs: number; endMs: number };
const words: Word[] = JSON.parse(fs.readFileSync(captionsFile, "utf-8"))
  .map((w: Word) => ({ ...w, text: w.text.replace(/[*_`]/g, "").trim() }))
  .filter((w: Word) => w.text);

const LINE = 42, MAX_CHARS = LINE * 2, MAX_MS = 6000, TAIL_MS = 600;
const cues: Word[][] = [];
let cur: Word[] = [];
const len = (ws: Word[]) => ws.map((w) => w.text).join(" ").length;
for (const w of words) {
  if (cur.length && (len([...cur, w]) > MAX_CHARS || w.endMs - cur[0].startMs > MAX_MS)) { cues.push(cur); cur = []; }
  cur.push(w);
  const end = /[.!?…]["”’)]?$/.test(w.text), pause = /[,;:—–]["”’)]?$/.test(w.text) && len(cur) > LINE;
  if (end || pause) { cues.push(cur); cur = []; }
}
if (cur.length) cues.push(cur);

/** Two balanced lines when the cue is longer than one. */
function lines(ws: Word[]): string {
  const s = ws.map((w) => w.text).join(" ");
  if (s.length <= LINE) return s;
  let best = 1, bestD = Infinity;
  for (let i = 1; i < ws.length; i++) {
    const a = ws.slice(0, i).map((w) => w.text).join(" ").length, b = s.length - a - 1;
    const d = Math.abs(a - b) + (Math.max(a, b) > LINE ? 1000 : 0);
    if (d < bestD) { bestD = d; best = i; }
  }
  return `${ws.slice(0, best).map((w) => w.text).join(" ")}\n${ws.slice(best).map((w) => w.text).join(" ")}`;
}
const ts = (ms: number) => {
  const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60, r = Math.round(ms % 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(r).padStart(3, "0")}`;
};
const body = cues.map((c, i) => {
  const start = c[0].startMs, last = c[c.length - 1].endMs, next = cues[i + 1]?.[0].startMs ?? Infinity;
  const end = Math.max(last, Math.min(last + TAIL_MS, next - 40));
  return `${i + 1}\n${ts(start)} --> ${ts(end)}\n${lines(c)}\n`;
}).join("\n");

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, body, "utf-8");
console.log(`✅ ${cues.length} caption cues → ${path.relative(process.cwd(), out)}`);
