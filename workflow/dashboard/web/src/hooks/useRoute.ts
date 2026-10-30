import { useCallback, useEffect, useState } from "react";

export type View = "overview" | "ws" | "usage" | "machine" | "settings";
/** The sections of a video project; null = the project overview. */
export type Section = "video" | "shorts" | "packaging";
export interface Route { view: View; ws: string | null; sec: Section | null; step: string | null; act: string | null; short: string | null }

const read = (): Route => {
  const h = new URLSearchParams(location.hash.slice(1));
  const v = h.get("view");
  const sec = h.get("sec");
  return { view: v === "ws" || v === "usage" || v === "machine" || v === "settings" ? v : "overview", ws: h.get("ws"), sec: sec === "video" || sec === "shorts" || sec === "packaging" ? sec : null, step: h.get("step"), act: h.get("act"), short: h.get("short") };
};

/** Route lives in the URL hash (view, ws, sec, step, act, short) so reloads and links keep their place. */
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
      if (n.sec) h.set("sec", n.sec);
      if (n.step) h.set("step", n.step);
      if (n.short) h.set("short", n.short);
      if (n.act) h.set("act", n.act);
      history.replaceState(null, "", `#${h}`);
      return n;
    });
  }, []);
  return [r, go];
}
