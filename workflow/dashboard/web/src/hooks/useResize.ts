import { useCallback, useRef } from "react";

/** Pointer-drag handler for a side panel's edge. `dir` = which way the panel grows when dragged toward +x. */
export function useResize(width: number, set: (w: number) => void, min: number, max: number, dir: 1 | -1) {
  const start = useRef<{ x: number; w: number } | null>(null);
  const clamp = useCallback((w: number) => Math.max(min, Math.min(max, Math.round(w))), [min, max]);
  return {
    onPointerDown: (e: React.PointerEvent) => { start.current = { x: e.clientX, w: width }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); },
    onPointerMove: (e: React.PointerEvent) => { if (start.current) set(clamp(start.current.w + dir * (e.clientX - start.current.x))); },
    onPointerUp: () => { start.current = null; },
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "ArrowLeft") set(clamp(width - dir * 16)); if (e.key === "ArrowRight") set(clamp(width + dir * 16)); },
  };
}
