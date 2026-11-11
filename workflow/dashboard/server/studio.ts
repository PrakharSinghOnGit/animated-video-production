/** Remotion studio (bun run studio) started from the dashboard: one at a time, its port read from its output. */
import { ANSI, REPO } from "./core";
import { childEnv, pump } from "./jobs";

// ───────────────────────────── studio ─────────────────────────────

export interface Studio { ws: string; pid: number | null; port: number | null; text: string; startedAt: number; exited: number | null }
let studio: Studio | null = null;
/** The Remotion studio process the dashboard started, if any (one at a time). */
export const currentStudio = () => studio;

export function startStudio(ws: string): Studio {
  const s: Studio = { ws, pid: null, port: null, text: "", startedAt: Date.now(), exited: null };
  const proc = Bun.spawn(["bun", "run", "studio", "--video", ws], { cwd: REPO, env: childEnv(), stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  s.pid = proc.pid;
  const onText = (t: string) => {
    t = t.replace(ANSI, "");
    s.text = (s.text + t).slice(-20000);
    const m = t.match(/https?:\/\/(?:localhost|127\.0\.0\.1):(\d+)/);
    if (m && !s.port) s.port = parseInt(m[1], 10);
  };
  pump(proc.stdout, onText);
  pump(proc.stderr, onText);
  proc.exited.then((c) => { s.exited = c; s.pid = null; });
  studio = s;
  return s;
}

export function studioState() {
  if (!studio) return null;
  return { ws: studio.ws, running: studio.exited === null, port: studio.port, url: studio.port ? `http://localhost:${studio.port}` : null, exited: studio.exited, startedAt: studio.startedAt, tail: studio.text.split("\n").slice(-25).join("\n") };
}
