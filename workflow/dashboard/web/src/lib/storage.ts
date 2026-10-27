import { useCallback, useEffect, useState } from "react";

/** localStorage, always wrapped: it throws in private windows and when site data is blocked. */
export const store = {
  get<T>(k: string, d: T): T {
    try { const v = localStorage.getItem(`wg.${k}`); return v == null ? d : (JSON.parse(v) as T); } catch { return d; }
  },
  set(k: string, v: unknown) {
    try { localStorage.setItem(`wg.${k}`, JSON.stringify(v)); } catch { /* not persisted */ }
  },
};

export function useStored<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [v, setV] = useState<T>(() => store.get(key, initial));
  const set = useCallback((n: T | ((p: T) => T)) => setV((p) => { const x = typeof n === "function" ? (n as (p: T) => T)(p) : n; store.set(key, x); return x; }), [key]);
  return [v, set];
}

export function useMedia(query: string): boolean {
  const [m, setM] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setM(mq.matches);
    on(); mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return m;
}
