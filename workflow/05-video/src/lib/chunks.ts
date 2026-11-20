/**
 * Per-act renders ("chunks"): the video is rendered one act at a time and joined, so a changed act re-renders only
 * itself (and a neighbour whose transition shows its frame), not the whole video.
 *
 * A chunk is the act's slice of the Main composition (frameRange), not the act's own composition: the backdrop, the
 * seam transitions, the end hold and the fade are exactly what a whole render draws, so the joined file is the same
 * frames as one long render. Acts are back to back in the timeline (no overlaps), so the slices partition the video.
 *
 * A chunk is reused while its key is unchanged: render quality, its frame range and the timeline's shared fields, its
 * scene entry (words, seams, music), its act file, the template (Main.tsx, Root.tsx), the public assets, the kit's
 * source, and the neighbour frames its transitions show (public/seams/*.jpg). Those frames are keyed by what they were
 * probed from (`probeKey`, recorded in seams.json by `bun run seams`), not by their bytes: the GPU does not draw a probe
 * bit-identically every time (VID13: 1 of 20 frames differed by a pixel value), which would re-render acts for nothing.
 *
 * Files: 05-video/chunks/<profile>/<ACT>.mp4 + <ACT>.json (the key). profile = "s1" (full size, crf 16: what the final
 * and full-quality act previews use) or "s0.5" / "s0.25" (smaller drafts, crf 26).
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { END_HOLD_S } from "../../../../packages/kit/src/main/hold";

const REPO = path.resolve(import.meta.dir, "../../../..");
export type Scale = "1" | "0.5" | "0.25";
export interface Chunk { id: string; from: number; to: number; key: string; file: string; fresh: boolean }

/** sharedKey for a server that asks often (the dashboard): recomputed at most every `ttlMs`. */
const sharedMemo = new Map<string, { at: number; key: string }>();
export function sharedKeyCached(outputDir: string, ttlMs = 15_000): string {
  const m = sharedMemo.get(outputDir);
  if (m && Date.now() - m.at < ttlMs) return m.key;
  const key = sharedKey(outputDir);
  sharedMemo.set(outputDir, { at: Date.now(), key });
  return key;
}

export const crfFor = (scale: Scale) => (scale === "1" ? 16 : 26);
export const chunkDir = (outputDir: string, scale: Scale) => path.join(outputDir, "chunks", `s${scale}`);

const sha = (x: string | Buffer) => crypto.createHash("sha256").update(x).digest("hex");
function walk(dir: string, keep: (f: string) => boolean, out: string[] = []): string[] {
  let ents: fs.Dirent[] = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents.sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, keep, out); else if (keep(f)) out.push(f);
  }
  return out;
}
/** What an act's probe frames (seams.ts) are a function of: the act file, its timeline entry without the seam plan, and the shared key. */
export function probeKey(outputDir: string, scene: any, shared = sharedKey(outputDir)): string {
  const { seams: _drop, ...entry } = scene;
  const sf = sceneFile(outputDir, scene.id);
  return sha(shared + JSON.stringify(entry) + (sf ? sha(fs.readFileSync(sf)) : "placeholder"));
}
/** Everything every act depends on: the kit's source, the template, the public assets (by name + size + mtime), Remotion. */
export function sharedKey(outputDir: string): string {
  const h = crypto.createHash("sha256");
  for (const f of walk(path.join(REPO, "packages/kit/src"), (f) => /\.(tsx?|json|css|woff2?|ttf|otf|png|jpe?g|svg)$/.test(f) && !f.includes(`${path.sep}preview${path.sep}`))) {
    h.update(path.relative(REPO, f)); h.update(fs.readFileSync(f));
  }
  for (const n of ["Main.tsx", "Root.tsx"]) { const f = path.join(outputDir, "src", n); if (fs.existsSync(f)) h.update(fs.readFileSync(f)); }
  const pub = path.join(outputDir, "public");
  for (const f of walk(pub, (f) => !f.includes(`${path.sep}seams${path.sep}`) && path.basename(f) !== "voiceover.wav")) {
    const st = fs.statSync(f); h.update(`${path.relative(pub, f)}:${st.size}:${Math.round(st.mtimeMs)}`);
  }
  try { h.update(JSON.parse(fs.readFileSync(path.join(REPO, "node_modules/remotion/package.json"), "utf-8")).version); } catch {}
  return h.digest("hex");
}
function sceneFile(outputDir: string, id: string): string | null {
  const d = path.join(outputDir, "src", "scenes");
  try { const n = fs.readdirSync(d).find((x) => x.startsWith(`${id}_`) && x.endsWith(".tsx")) ?? fs.readdirSync(d).find((x) => x === `${id}.tsx`); return n ? path.join(d, n) : null; } catch { return null; }
}

/** The chunks of this timeline at this quality: frame ranges, keys, and whether the file on disk is still current. */
export function planChunks(outputDir: string, timeline: any, scale: Scale, shared = sharedKey(outputDir)): Chunk[] {
  const scenes: any[] = [...timeline.scenes].sort((a, b) => a.windowStartFrame - b.windowStartFrame);
  const fps = timeline.fps, total = Math.max(1, timeline.durationFrames) + Math.round(fps * (timeline.endHoldS ?? END_HOLD_S));
  const dir = chunkDir(outputDir, scale);
  let probed: Record<string, string> = {};
  try { probed = JSON.parse(fs.readFileSync(path.join(outputDir, "seams.json"), "utf-8")).probeKeys ?? {}; } catch {}
  const global = JSON.stringify({ fps, w: timeline.width, h: timeline.height, dur: timeline.durationFrames, hold: timeline.endHoldS ?? null, fade: timeline.fadeOutFrames ?? null, total, scale, crf: crfFor(scale), v: 1 });
  return scenes.map((s, i) => {
    const from = i === 0 ? 0 : s.windowStartFrame, to = i === scenes.length - 1 ? total : scenes[i + 1].windowStartFrame;
    const h = crypto.createHash("sha256");
    h.update(shared); h.update(global); h.update(`${from}-${to}`); h.update(JSON.stringify(s));
    const sf = sceneFile(outputDir, s.id); h.update(sf ? fs.readFileSync(sf) : "placeholder");
    // the neighbour frames this act's transitions show: a changed neighbour changes this act's first/last frames
    for (const side of [s.seams?.in, s.seams?.out]) {
      const m = /seams\/(A\d+)_(first|last)\.jpg$/.exec(side?.img ?? ""), img = side?.img ? path.join(outputDir, "public", side.img) : "";
      // a frame from a seams run that recorded no probe keys (older runs): fall back to its bytes
      h.update(!m || !fs.existsSync(img) ? "none" : probed[m[1]] ? `${m[1]}:${m[2]}:${probed[m[1]]}` : sha(fs.readFileSync(img)));
    }
    const key = h.digest("hex"), file = path.join(dir, `${s.id}.mp4`);
    let fresh = false;
    try { fresh = JSON.parse(fs.readFileSync(path.join(dir, `${s.id}.json`), "utf-8")).key === key && fs.statSync(file).size > 0; } catch {}
    return { id: s.id, from, to, key, file, fresh };
  });
}

/**
 * Render the chunks that are not current (all of them with force; only these act ids with `only`). One bundle and one
 * browser for the whole batch. Returns the plan with every rendered chunk now fresh.
 */
export async function renderChunks(o: { outputDir: string; timeline: any; scale: Scale; only?: string[]; force?: boolean; concurrency?: number }): Promise<Chunk[]> {
  const plan = planChunks(o.outputDir, o.timeline, o.scale);
  const todo = plan.filter((c) => (!o.only || o.only.includes(c.id)) && (o.force || !c.fresh));
  const reused = plan.filter((c) => (!o.only || o.only.includes(c.id)) && !todo.includes(c));
  console.log(`[chunks] ${o.scale === "1" ? "full size" : `${o.scale}×`}: ${todo.length} act${todo.length === 1 ? "" : "s"} to render${todo.length ? ` (${todo.map((c) => c.id).join(", ")})` : ""}, ${reused.length} reused`);
  if (!todo.length) return plan;
  const { bundle } = await import("@remotion/bundler");
  const { renderMedia, selectComposition } = await import("@remotion/renderer");
  const publicDir = path.join(o.outputDir, "public");
  const t0 = Date.now();
  const serveUrl = await bundle({ entryPoint: path.join(o.outputDir, "src", "index.ts"), publicDir: fs.existsSync(publicDir) ? publicDir : undefined });
  const inputProps = { timeline: o.timeline, showVoiceOver: false };
  const R = { chromiumOptions: { gl: "angle" as const }, timeoutInMilliseconds: 120_000 };
  const composition = await selectComposition({ serveUrl, id: "Main", inputProps, ...R });
  fs.mkdirSync(chunkDir(o.outputDir, o.scale), { recursive: true });
  console.log(`[chunks] bundled in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  for (const [i, c] of todo.entries()) {
    const t1 = Date.now(), tmp = c.file.replace(/\.mp4$/, ".part.mp4");
    let last = -1;
    await renderMedia({
      serveUrl, composition, codec: "h264", outputLocation: tmp, inputProps, frameRange: [c.from, c.to - 1], muted: true,
      crf: crfFor(o.scale), scale: Number(o.scale), pixelFormat: "yuv420p", overwrite: true, logLevel: "error",
      ...(o.concurrency ? { concurrency: o.concurrency } : {}), ...R,
      onProgress: ({ progress }) => { const p = Math.floor(progress * 10); if (p !== last) { last = p; process.stdout.write(`\r[chunks] ${c.id} (${i + 1}/${todo.length}) ${p * 10}%   `); } },
    });
    fs.renameSync(tmp, c.file);
    fs.writeFileSync(c.file.replace(/\.mp4$/, ".json"), JSON.stringify({ key: c.key, from: c.from, to: c.to, at: new Date().toISOString(), ms: Date.now() - t1 }, null, 1));
    c.fresh = true;
    console.log(`\r[chunks] ${c.id} (${i + 1}/${todo.length}) rendered in ${((Date.now() - t1) / 1000).toFixed(0)} s, frames ${c.from}–${c.to - 1}`);
  }
  return plan;
}

/** Join the chunks into one video without re-encoding (they share codec, size and settings). Fails if one is missing or stale. */
export function joinChunks(plan: Chunk[], out: string): void {
  const bad = plan.filter((c) => !c.fresh || !fs.existsSync(c.file));
  if (bad.length) throw new Error(`cannot join: ${bad.map((c) => c.id).join(", ")} not rendered for the current state`);
  const list = out.replace(/\.mp4$/, ".chunks.txt");
  fs.writeFileSync(list, plan.map((c) => `file '${c.file.replace(/'/g, "'\\''")}'`).join("\n") + "\n");
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", out], { encoding: "utf-8" });
  fs.rmSync(list, { force: true });
  if (r.status !== 0) throw new Error(`joining the chunks failed: ${r.stderr}`);
}

/** Frame count of a video (ffprobe, decoding-free when the container knows it). */
export function frameCount(file: string): number {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-count_packets", "-show_entries", "stream=nb_read_packets", "-of", "csv=p=0", file], { encoding: "utf-8" });
  return parseInt(r.stdout.trim(), 10) || 0;
}
