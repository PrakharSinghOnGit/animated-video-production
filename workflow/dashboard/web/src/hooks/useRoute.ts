import { useCallback, useEffect, useState } from "react";

export type View = "ws" | "usage" | "machine";
export interface Route { view: View; ws: string | null; step: string | null; act: string | null }

const read = (): Route => {
  const h = new URLSearchParams(location.hash.slice(1));
  const v = h.get("view");
  return { view: v === "usage" || v === "machine" ? v : "ws", ws: h.get("ws"), step: h.get("step"), act: h.get("act") };
};

/** Route lives in the URL hash (view, ws, step, act) so reloads and links keep their place. */
export function useRoute(): [Route, (patch: Partial<Route>) => void] {
  const [r, setR] = useState<Route>(read);
  useEffect(() => {
    const on = () => setR(read());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const go = useCallback((patch: Partial<Route>) => {
    setR((prev) => {
      const n = { ...prev, ...patch };
      const h = new URLSearchParams();
      h.set("view", n.view);
      if (n.ws) h.set("ws", n.ws);
      if (n.step) h.set("step", n.step);
      if (n.act) h.set("act", n.act);
      history.replaceState(null, "", `#${h}`);
      return n;
    });
  }, []);
  return [r, go];
}
