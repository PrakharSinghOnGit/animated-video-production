import { useEffect, useState } from "react";

/** Current time in ms, re-rendering the caller every `ms` (default 1 s). Keep it in small leaf components. */
export function useNow(ms = 1000): number {
  const [n, setN] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setN(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return n;
}
