/**
 * Render profiling (off unless the render's inputProps carry `wgProfile: true`, which `bun run profile` sets): counts and
 * times the canvas calls each frame makes (fill / stroke / drawImage / text ..., marked "+shadow" or "+filter" when a
 * shadow blur or a filter was active, the expensive cases), and logs one `WGPROF {...}` line per frame with the time the
 * act's draw took. Deterministic output is unchanged: it only wraps the calls.
 */
import { getInputProps } from "remotion";

export const profiling = (() => { try { return !!(getInputProps() as { wgProfile?: boolean }).wgProfile; } catch { return false; } })();

type Stat = { n: number; ms: number };
let stats: Record<string, Stat> = {};
let installed = false;
const METHODS = ["fill", "stroke", "fillRect", "strokeRect", "drawImage", "fillText", "strokeText", "getImageData", "putImageData", "clip", "createPattern", "measureText"] as const;

/** Wrap the 2D context methods of on-screen and offscreen canvases (once per page). */
export function installProfiler(): void {
  if (installed || !profiling) return;
  installed = true;
  const protos = [globalThis.CanvasRenderingContext2D?.prototype, (globalThis as any).OffscreenCanvasRenderingContext2D?.prototype].filter(Boolean);
  for (const proto of protos) {
    const off = proto !== globalThis.CanvasRenderingContext2D?.prototype;
    for (const m of METHODS) {
      const orig = proto[m];
      if (typeof orig !== "function") continue;
      proto[m] = function (this: CanvasRenderingContext2D, ...a: unknown[]) {
        const fx = (this.shadowBlur > 0 && this.shadowColor !== "rgba(0, 0, 0, 0)" ? "+shadow" : "") + (this.filter && this.filter !== "none" ? "+filter" : "");
        const key = `${off ? "off." : ""}${m}${fx}`;
        const t = performance.now();
        try { return orig.apply(this, a); } finally {
          const s = (stats[key] ??= { n: 0, ms: 0 });
          s.n++; s.ms += performance.now() - t;
        }
      };
    }
  }
}

/** Log this frame's numbers and start the next frame's count. */
export function flushProfile(frame: number, drawMs: number, checkMs: number): void {
  if (!profiling) return;
  const ops = Object.fromEntries(Object.entries(stats).map(([k, v]) => [k, [v.n, Math.round(v.ms * 100) / 100]]));
  console.log(`WGPROF ${JSON.stringify({ frame, drawMs: Math.round(drawMs * 100) / 100, checkMs: Math.round(checkMs * 100) / 100, ops })}`);
  stats = {};
}
