import React, { useLayoutEffect, useRef, useState } from "react";
import { AbsoluteFill, continueRender, delayRender, getInputProps, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { useScene } from "../scene";
import { hash } from "./lib";
import { W, H, setFrameSize, checkCaches, resetCaches, type G } from "./engine";
import { setSeams, type SeamPlan, type SeamSide } from "./seam";
import type { SceneSeamSide } from "../scene";

/** The neighbour frames a seam needs (decoded once per page; a missing file falls back to the act's own transition). */
const seamImgs = new Map<string, Promise<HTMLImageElement | null>>();
function loadSeamImg(rel: string): Promise<HTMLImageElement | null> {
  let p = seamImgs.get(rel);
  if (!p) {
    p = new Promise((res) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => { console.warn(`[CanvasHost] seam image ${rel} not found: this seam uses the act's own transition`); res(null); };
      im.src = staticFile(rel);
    });
    seamImgs.set(rel, p);
  }
  return p;
}
const seamProbe = (() => { try { return !!(getInputProps() as { seamProbe?: boolean }).seamProbe; } catch { return false; } })();

/** Fully transparent at the centre and four inner points: nothing was drawn (a lost canvas), the old backdrop would show. */
function blank(g: CanvasRenderingContext2D, w: number, h: number): boolean {
  try {
    return [[0.5, 0.5], [0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]].every(([x, y]) => g.getImageData(Math.floor(w * x), Math.floor(h * y), 1, 1).data[3] === 0);
  } catch { return false; }
}

export interface PaperCtx {
  /** seconds since this sequence started (frame / fps) */
  t: number;
  frame: number;
  fps: number;
  W: number;
  H: number;
  /** spoken word timing in seconds relative to the sequence (falls back deterministically without a scene context) */
  word: (text: string, occurrence?: number) => { t0: number; t1: number };
  /** seconds */
  voiceStart: number;
  /** seconds */
  duration: number;
  /** every spoken word of this sequence, seconds relative to it */
  words: { w: string; t: number; t1: number }[];
}

let warned = false;
const strHash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; };

function useSceneSafe() {
  try { return useScene(); } catch { return null; }
}

/**
 * Shared canvas stage: waits for `ensureFonts`, then calls `draw` every frame with a cleared canvas of the composition's size
 * and a PaperCtx (t, word(), words...). PaperCanvas and SpyCanvas are thin wrappers that pick the fonts loader.
 */
export const CanvasHost: React.FC<{ draw: (g: G, ctx: PaperCtx) => void; ensureFonts: () => Promise<void>; label?: string }> = ({ draw, ensureFonts, label = "fonts" }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();
  setFrameSize(width, height);   // 1920x1080 video or 1080x1920 short: the engine draws in this composition's pixels
  const scene = useSceneSafe();
  const ref = useRef<HTMLCanvasElement>(null);
  const [handle] = useState(() => delayRender(`Loading ${label}`));
  const [ready, setReady] = useState(false);
  const released = useRef(false);
  const seamRef = useRef<SeamPlan | null>(null);

  useLayoutEffect(() => {
    let alive = true;
    const plan = scene?.seams;
    const side = async (x?: SceneSeamSide): Promise<SeamSide | undefined> =>
      x ? { kind: x.kind, share: x.share, ground: x.ground, img: x.img ? await loadSeamImg(x.img) : null } : undefined;
    Promise.all([ensureFonts(), side(plan?.in), side(plan?.out)]).then(([, i, o]) => {
      seamRef.current = seamProbe ? { probe: true } : plan ? { in: i, out: o } : null;
      if (alive) setReady(true);
    });
    return () => { alive = false; };
  }, []);

  useLayoutEffect(() => {
    if (!ready) return;
    const canvas = ref.current;
    const g = canvas?.getContext("2d");
    if (!canvas || !g) return;
    const duration = (scene ? scene.durationFrames : durationInFrames) / fps;
    const ctx: PaperCtx = {
      t: frame / fps, frame, fps, W: width, H: height, duration,
      voiceStart: scene ? scene.voiceStart / fps : 0,
      words: (scene?.words ?? []).map((w: any) => ({ w: w.text, t: w.startFrame / fps, t1: w.endFrame / fps })),
      word: (text, occurrence = 1) => {
        if (scene && scene.has(text, occurrence)) {
          const w = scene.word(text, occurrence);
          return { t0: w.start / fps, t1: w.end / fps };
        }
        if (!warned) { warned = true; console.warn(`[CanvasHost] word("${text}") not available (no scene words); using deterministic fallback timings.`); }
        const t0 = 0.8 + hash(strHash(text) + occurrence * 7) * Math.max(0.5, duration - 2.4);
        return { t0, t1: t0 + 0.4 };
      },
    };
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1; g.globalCompositeOperation = "source-over"; g.filter = "none";
    setFrameSize(width, height);
    const n = checkCaches();
    if (n) console.warn(`[CanvasHost] frame ${frame}: ${n} cached canvas(es) were lost by the GPU and are rebuilt`);
    if ((g as unknown as { isContextLost?: () => boolean }).isContextLost?.()) throw new Error(`[CanvasHost] frame ${frame}: the canvas context was lost (render again; it would be a blank frame)`);
    g.clearRect(0, 0, W, H);
    setSeams(seamRef.current);
    draw(g, ctx);
    // a blank frame shows the dark backdrop under the acts: rebuild every cache and draw again, else fail loudly
    if (blank(g, width, height)) {
      console.warn(`[CanvasHost] frame ${frame}: drew nothing; rebuilding cached canvases and drawing again`);
      resetCaches();
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = "source-over"; g.filter = "none";
      g.clearRect(0, 0, W, H);
      draw(g, ctx);
      if (blank(g, width, height)) throw new Error(`[CanvasHost] frame ${frame}: the act drew a blank frame twice (render again; a canvas or the GPU failed)`);
    }
    if (!released.current) { released.current = true; continueRender(handle); }
  });

  return (
    <AbsoluteFill>
      <canvas ref={ref} width={width} height={height} style={{ width: "100%", height: "100%", display: "block" }} />
    </AbsoluteFill>
  );
};
