import { useEffect, useRef } from "react";

/** Calls `fn` now and every `ms` while the tab is visible. A new `fn` identity does not restart the timer. */
export function usePoll(fn: () => void | Promise<void>, ms: number, enabled = true) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!enabled) return;
    let stop = false, busy = false;
    const tick = async () => {
      if (stop || busy || document.hidden) return;
      busy = true;
      try { await ref.current(); } finally { busy = false; }
    };
    tick();
    const t = setInterval(tick, ms);
    const vis = () => { if (!document.hidden) tick(); };
    document.addEventListener("visibilitychange", vis);
    return () => { stop = true; clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, [ms, enabled]);
}
