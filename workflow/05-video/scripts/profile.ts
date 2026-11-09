/**
 * Where render time goes, per act: renders a few short samples of each act with the kit's profiler on (one tab, so the
 * numbers are per frame) and reports the real speed, how much of a frame the act's own drawing takes (the rest is Chrome
 * capturing and encoding the frame), the blank-frame check, and the canvas calls that cost the most.
 *
 * Usage: bun run profile --video <ID> [--scene A09,A10] [--at 0.25,0.5,0.75] [--frames 30]      free, ~1–3 min
 *        bun run profile --video <ID> --scene A10 --bench 1,3,5,8 [--frames 240] [--audio]
 *            the full video (as the render runs it) over a stretch of each act, at each number of tabs (concurrency)
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { resolveJobPaths } from "../src/lib/workspaceBridge";

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const videoId = flag("--video") ?? flag("-v");
if (!videoId) { console.error("Usage: bun run profile --video <ID> [--scene A09,A10] [--at 0.25,0.5,0.75] [--frames 30]"); process.exit(1); }
const paths = resolveJobPaths(videoId);
const out = paths.outputDir;
const timeline = JSON.parse(fs.readFileSync(path.join(out, "timeline.json"), "utf-8"));
const only = flag("--scene")?.toUpperCase().split(",");
const scenes: any[] = timeline.scenes.filter((s: any) => !only || only.includes(s.id)).sort((a: any, b: any) => a.windowStartFrame - b.windowStartFrame);
const at = (flag("--at") ?? "0.25,0.5,0.75").split(",").map(Number);
const nFrames = Math.max(5, parseInt(flag("--frames") ?? "30", 10));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wg-profile-"));

console.log("📦 Bundling...");
const serveUrl = await bundle({ entryPoint: path.join(out, "src", "index.ts"), publicDir: path.join(out, "public") });

// --bench 1,3,5,8: the full video (Main, as the render runs it) over a stretch of each --scene act, at each concurrency
const bench = flag("--bench")?.split(",").map(Number).filter((n) => n >= 1 && n <= 16);
if (bench?.length) {
  const propsFile = path.join(out, "render-props.json");
  const inputProps = fs.existsSync(propsFile) ? JSON.parse(fs.readFileSync(propsFile, "utf-8")) : {};
  console.log("🎞  loading the full video...");
  const composition = await selectComposition({ serveUrl, id: "Main", inputProps });
  const len = Math.max(30, parseInt(flag("--frames") ?? "240", 10));
  for (const s of scenes) {
    const from = s.windowStartFrame + Math.round((at[0] ?? 0.5) * Math.max(0, s.durationFrames - len));
    for (const c of bench) {
      const t = Date.now();
      // --audio: with the soundtrack, as the real render; the speed is printed every 10% (a long run shows any slowdown)
      let mark = 0, tm = t, last = 0;
      const onProgress = ({ renderedFrames }: { renderedFrames: number }) => {
        if (renderedFrames < (mark + 0.1) * len) return;
        mark = Math.floor((renderedFrames / len) * 10) / 10; const now = Date.now();
        console.log(`   ${Math.round(mark * 100)}%: ${((renderedFrames - last) / ((now - tm) / 1000)).toFixed(1)} fps`); tm = now; last = renderedFrames;
      };
      await renderMedia({ serveUrl, composition, inputProps, codec: "h264", crf: 16, outputLocation: path.join(tmp, "bench.mp4"), frameRange: [from, from + len - 1], concurrency: c, chromiumOptions: { gl: "angle" }, muted: !args.includes("--audio"), logLevel: "error", ...(len >= 1000 ? { onProgress } : {}) });
      console.log(`${s.id} frames ${from}–${from + len - 1}, ${c} tab${c > 1 ? "s" : ""}: ${(len / ((Date.now() - t) / 1000)).toFixed(1)} fps`);
    }
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(0);
}
type Row = { act: string; fps: number; drawMs: number; checkMs: number; frames: number; ops: Record<string, [number, number]> };
const rows: Row[] = [];
for (const s of scenes) {
  const composition = await selectComposition({ serveUrl, id: s.id, inputProps: { wgProfile: true } });
  let frames = 0, drawMs = 0, checkMs = 0, wall = 0;
  const ops: Record<string, [number, number]> = {};
  for (const p of at) {
    const from = Math.min(composition.durationInFrames - nFrames, Math.max(0, Math.round(p * composition.durationInFrames)));
    const onBrowserLog = (l: { text: string }) => {
      const m = /WGPROF (\{.*\})/.exec(l.text);
      if (!m) return;
      const r = JSON.parse(m[1]);
      frames++; drawMs += r.drawMs; checkMs += r.checkMs;
      for (const [k, [n, ms]] of Object.entries(r.ops as Record<string, [number, number]>)) { const o = (ops[k] ??= [0, 0]); o[0] += n; o[1] += ms; }
    };
    // a warm-up frame first (fonts, caches; its log is not counted), then the timed range
    await renderMedia({ serveUrl, composition, codec: "h264", outputLocation: path.join(tmp, "w.mp4"), frameRange: [from, from], inputProps: { wgProfile: true }, concurrency: 1, chromiumOptions: { gl: "angle" }, logLevel: "error" });
    const t = Date.now();
    await renderMedia({ serveUrl, composition, codec: "h264", outputLocation: path.join(tmp, `${s.id}.mp4`), frameRange: [from, from + nFrames - 1], inputProps: { wgProfile: true }, concurrency: 1, chromiumOptions: { gl: "angle" }, onBrowserLog, logLevel: "error" });
    wall += Date.now() - t;
  }
  rows.push({ act: s.id, fps: (nFrames * at.length) / (wall / 1000), drawMs: drawMs / Math.max(1, frames), checkMs: checkMs / Math.max(1, frames), frames, ops });
  const r = rows[rows.length - 1];
  const top = Object.entries(r.ops).sort((a, b) => b[1][1] - a[1][1]).slice(0, 4).map(([k, [n, ms]]) => `${k} ${Math.round(n / r.frames)}×/${(ms / r.frames).toFixed(1)}ms`).join(", ");
  console.log(`${s.id}  ${r.fps.toFixed(1).padStart(5)} fps  draw ${r.drawMs.toFixed(1).padStart(6)} ms  check ${r.checkMs.toFixed(1).padStart(5)} ms  ${top}`);
}
fs.rmSync(tmp, { recursive: true, force: true });
