/**
 * openDAW for the dashboard: launcher for the local openDAW dev server (like Remotion Studio), the bundle download and
 * the mix upload. server.ts calls `dawRoute()` first thing in fetch() and `dawInfo()` from details().
 *
 * openDAW runs on another origin (localhost:8080), so exactly these routes answer CORS, and only for that origin:
 *   GET  /api/ws/<id>/daw/project.odb   the project bundle (also Cross-Origin-Resource-Policy: cross-origin, because the
 *                                       openDAW page is cross-origin isolated with COEP require-corp)
 *   POST /api/ws/<id>/daw/mix           raw WAV body -> 06-audio/daw/export_raw.wav, mastered to -14 LUFS / -1 dBTP ->
 *                                       workspace/<id>/06-audio/mix_daw.wav (needs x-wg: 1 like every write)
 * Plus the launcher: GET /api/daw, POST /api/daw/start, POST /api/daw/stop.
 */
import fs from "node:fs";
import path from "node:path";
import { isSetUp, OPENDAW_DIR } from "../06-audio/opendaw/setup";

export const DAW_PORT = 8080;
const ORIGINS = [`http://localhost:${DAW_PORT}`, `http://127.0.0.1:${DAW_PORT}`];
const MAX_MIX_BYTES = 1024 * 1024 * 1024;

export interface DawCtx {
  guard: (req: Request) => Response | null;
  json: (data: unknown, status?: number) => Response;
  bad: (msg: string, status?: number) => Response;
  wsDir: (id: string) => string;
  validWs: (id: string) => boolean;
  childEnv: () => Record<string, string | undefined>;
  killTree: (pid: number, signal?: NodeJS.Signals) => void;
  pump: (stream: ReadableStream<Uint8Array>, onText: (t: string) => void) => void;
  ansi: RegExp;
}

interface Daw { pid: number | null; port: number | null; text: string; startedAt: number; exited: number | null }
let daw: Daw | null = null;

function dawState() {
  return {
    setUp: isSetUp(),
    port: DAW_PORT,
    running: !!daw && daw.exited === null,
    ready: !!daw && daw.exited === null && daw.port !== null,
    url: daw?.port ? `http://localhost:${daw.port}` : null,
    exited: daw?.exited ?? null,
    tail: daw ? daw.text.split("\n").slice(-12).join("\n") : "",
  };
}

function startDaw(ctx: DawCtx) {
  const d: Daw = { pid: null, port: null, text: "", startedAt: Date.now(), exited: null };
  const proc = Bun.spawn(["npx", "vite", "--clearScreen", "false", "--port", String(DAW_PORT), "--strictPort"], {
    cwd: path.join(OPENDAW_DIR, "packages/app/studio"),
    env: ctx.childEnv() as Record<string, string>,
    stdin: "ignore", stdout: "pipe", stderr: "pipe",
  });
  d.pid = proc.pid;
  const onText = (t: string) => {
    t = t.replace(ctx.ansi, "");
    d.text = (d.text + t).slice(-20000);
    const m = t.match(/https?:\/\/(?:localhost|127\.0\.0\.1):(\d+)/);
    if (m && !d.port) d.port = parseInt(m[1], 10);
  };
  ctx.pump(proc.stdout, onText);
  ctx.pump(proc.stderr, onText);
  proc.exited.then((c) => { d.exited = c; d.pid = null; });
  daw = d;
}

export function stopDaw(ctx: Pick<DawCtx, "killTree">) {
  if (daw?.pid) ctx.killTree(daw.pid);
}

/** What the Sound step shows. */
export function dawInfo(ws: string, wsDir: (id: string) => string) {
  const d = path.join(wsDir(ws), "06-audio");
  const stat = (rel: string) => { try { const s = fs.statSync(path.join(d, rel)); return { path: `06-audio/${rel}`, size: s.size, mtime: s.mtimeMs }; } catch { return null; } };
  let build: any = null;
  try { build = JSON.parse(fs.readFileSync(path.join(d, "daw/build.json"), "utf-8")); } catch {}
  const events = (() => { try { return fs.statSync(path.join(wsDir(ws), "05-video/events.json")).mtimeMs; } catch { return 0; } })();
  const bundle = stat("daw/project.odb");
  return { setUp: isSetUp(), bundle, build, mix: stat("mix_daw.wav"), autoMix: stat("mix.wav"), bundleStale: !!bundle && events > bundle.mtime };
}

const corsHeaders = (req: Request): Record<string, string> => {
  const origin = req.headers.get("origin") ?? "";
  return ORIGINS.includes(origin)
    ? { "access-control-allow-origin": origin, "access-control-allow-headers": "x-wg, content-type", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-max-age": "600", vary: "origin" }
    : {};
};
const withCors = (res: Response, req: Request, extra: Record<string, string> = {}) => {
  for (const [k, v] of Object.entries({ ...corsHeaders(req), ...extra })) res.headers.set(k, v);
  return res;
};

async function ffmpeg(args: string[]): Promise<{ code: number; err: string }> {
  const p = Bun.spawn(["ffmpeg", "-hide_banner", "-nostats", "-y", ...args], { stdout: "ignore", stderr: "pipe" });
  const err = await new Response(p.stderr).text();
  return { code: await p.exited, err };
}
const lnJson = (err: string) => JSON.parse(err.slice(err.lastIndexOf("{"), err.lastIndexOf("}") + 1));

/** Two-pass linear loudnorm to -14 LUFS / -1 dBTP, 48 kHz 24-bit stereo (same targets as 06-audio/mix.py), plus a limiter if the peak is still over. */
async function masterTo(src: string, out: string): Promise<{ ok: true; lufs: number; tp: number } | { ok: false; error: string }> {
  const ln = "loudnorm=I=-14:TP=-1:LRA=11";
  const a = await ffmpeg(["-i", src, "-af", `${ln}:print_format=json`, "-f", "null", "-"]);
  if (a.code) return { ok: false, error: a.err.slice(-300) };
  const st = lnJson(a.err);
  const meas = `:measured_I=${st.input_i}:measured_TP=${st.input_tp}:measured_LRA=${st.input_lra}:measured_thresh=${st.input_thresh}:offset=${st.target_offset}:linear=true`;
  const b = await ffmpeg(["-i", src, "-af", ln + meas, "-ar", "48000", "-ac", "2", "-c:a", "pcm_s24le", out]);
  if (b.code) return { ok: false, error: b.err.slice(-300) };
  let after = lnJson((await ffmpeg(["-i", out, "-af", `${ln}:print_format=json`, "-f", "null", "-"])).err);
  if (parseFloat(after.input_tp) > -0.95) {
    const lim = out + ".lim.wav";
    const c = await ffmpeg(["-i", out, "-af", `alimiter=limit=${10 ** (-1.3 / 20)}:level=disabled`, "-ar", "48000", "-c:a", "pcm_s24le", lim]);
    if (c.code) return { ok: false, error: c.err.slice(-300) };
    fs.renameSync(lim, out);
    after = lnJson((await ffmpeg(["-i", out, "-af", `${ln}:print_format=json`, "-f", "null", "-"])).err);
  }
  return { ok: true, lufs: parseFloat(after.input_i), tp: parseFloat(after.input_tp) };
}

/** Returns a Response for the openDAW routes, or null when the request is not one of them. */
export async function dawRoute(req: Request, url: URL, ctx: DawCtx): Promise<Response | null> {
  const p = url.pathname;
  const bundleRoute = p.match(/^\/api\/ws\/([^/]+)\/daw\/(project\.odb|mix)$/);

  if (req.method === "OPTIONS" && bundleRoute) {
    // a preflight carries no x-wg header: check only that the Host is ours, then answer for the openDAW origin
    const host = (req.headers.get("host") ?? "").toLowerCase();
    if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)) return ctx.bad("bad host", 403);
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  if (p === "/api/daw" || p === "/api/daw/start" || p === "/api/daw/stop") {
    const g = ctx.guard(req);
    if (g) return g;
    if (p === "/api/daw" && req.method === "GET") return ctx.json(dawState());
    if (p === "/api/daw/start" && req.method === "POST") {
      if (!isSetUp()) return ctx.bad("openDAW is not set up: run `bun run daw:setup` once", 409);
      if (!daw || daw.exited !== null) startDaw(ctx);
      return ctx.json(dawState());
    }
    if (p === "/api/daw/stop" && req.method === "POST") {
      if (daw?.pid) ctx.killTree(daw.pid);
      return ctx.json({ ok: true });
    }
    return null;
  }

  if (!bundleRoute) return null;
  const g = ctx.guard(req);
  if (g) return g;
  const ws = decodeURIComponent(bundleRoute[1]);
  if (!ctx.validWs(ws)) return withCors(ctx.bad("no such workspace", 404), req);
  const audio = path.join(ctx.wsDir(ws), "06-audio");

  if (bundleRoute[2] === "project.odb" && (req.method === "GET" || req.method === "HEAD")) {
    const f = path.join(audio, "daw/project.odb");
    if (!fs.existsSync(f)) return withCors(ctx.bad("no openDAW project yet: run 'Build openDAW project' on the Sound step", 404), req);
    return withCors(new Response(req.method === "HEAD" ? null : Bun.file(f), { headers: { "content-type": "application/octet-stream", "content-length": String(fs.statSync(f).size), "cache-control": "no-store" } }), req, { "cross-origin-resource-policy": "cross-origin" });
  }

  if (bundleRoute[2] === "mix" && req.method === "POST") {
    const len = Number(req.headers.get("content-length") ?? 0);
    if (len > MAX_MIX_BYTES) return withCors(ctx.bad("mix too large", 413), req);
    const bytes = new Uint8Array(await req.arrayBuffer());
    const tag = (o: number) => String.fromCharCode(...bytes.subarray(o, o + 4));
    if (bytes.length < 1024 || tag(0) !== "RIFF" || tag(8) !== "WAVE") return withCors(ctx.bad("body is not a WAV file"), req);
    fs.mkdirSync(path.join(audio, "daw"), { recursive: true });
    const raw = path.join(audio, "daw/export_raw.wav");
    await Bun.write(raw, bytes);
    // openDAW's mixdown has no bus compressor or limiter: master it like audio:mix does (-14 LUFS / -1 dBTP) so QC passes
    const tmp = path.join(audio, `.mix_daw.${process.pid}.tmp.wav`);
    const m = await masterTo(raw, tmp);
    if (!m.ok) return withCors(ctx.bad(`could not master the export: ${m.error}`, 500), req);
    fs.renameSync(tmp, path.join(audio, "mix_daw.wav"));
    return withCors(ctx.json({ bytes: bytes.length, ...m }), req);
  }
  return withCors(ctx.bad("not found", 404), req);
}
