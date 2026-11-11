/** Paths, command-line flags and the small fs / http helpers every dashboard module shares. No state but the public-port marks. */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import * as sh from "../../08-shorts/lib";

export const REPO = path.resolve(import.meta.dir, "../../..");
/** WG_WS_ROOT lets tests point the server at a temp folder of workspaces; normally the repo's workspace/. */
export const WS_ROOT = process.env.WG_WS_ROOT ?? path.join(REPO, "workspace");
export const DIST = path.join(import.meta.dir, "../web/dist");
/** WG_ENV_FILE lets tests point the Settings page at a temp file; normally the repo's .env. */
export const ENV_FILE = process.env.WG_ENV_FILE ?? path.join(REPO, ".env");
export const LIMITS_FILE = path.join(os.homedir(), ".claude/wealthgap/statusline.json");
export const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
export const argPort = parseInt(arg("--port") ?? "", 10);
export const PORT = Number.isFinite(argPort) ? argPort : 4600;
export const HOST = arg("--host") ?? "127.0.0.1";
export const PUBLIC = process.argv.includes("--public");
export const PUBLIC_PORT = PORT + 1;

/** Requests that came in through the password-protected public port (public.ts); guard() skips its Host check for them. */
export const viaPublic = new WeakSet<Request>();

/** The Tailscale Funnel link while the dashboard is published (bun run dashboard:public), else null. */
export const remote: { url: string | null } = { url: null };

/** This machine's own IPv4 addresses on the network (the Host a phone at home uses with --host). */
export const lanIps = () => Object.values(os.networkInterfaces()).flat().filter((n) => n && n.family === "IPv4" && !n.internal).map((n) => n!.address);

/** VID<n>_<Name> = a long video (+ its shorts); SH<n>_<Name> = a shorts project (shorts only, written from a brief). */
export const WS_ID = sh.PROJECT_ID;
/** "shorts" for a shorts project: the dashboard shows only its Overview and Shorts. */
/** The stages of a short shown on a shorts project's progress bar (the beat is optional, so it is left out). */
export const SHORT_BAR = [["approved", "Script approved"], ["voice", "Voice"], ["align", "Align"], ["plan", "Plan"], ["act", "Act"], ["sound", "Sound"], ["render", "Render"], ["qc", "QC"], ["exported", "Exported"]] as const;
export const kindOf = (ws: string): "video" | "shorts" => (sh.isShortsProject(ws) ? "shorts" : "video");
/** A shorts project's name: the brief's first heading. */
export const briefTitle = (ws: string) => readText(sh.briefPath(ws)).match(/^#\s+(.+)$/m)?.[1]?.trim() || null;
export const ACT_ID = /^A\d{2,3}$/;
export const LOG_CAP = 4 * 1024 * 1024;
export const ANSI = /\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07]*\x07/g;

// ───────────────────────────── helpers ─────────────────────────────

export const wsDir = (id: string) => path.join(WS_ROOT, id);
export const exists = (p: string) => fs.existsSync(p);
export function mtime(p: string): number {
  try { return fs.statSync(p).mtimeMs; } catch { return 0; }
}
export function readJson<T = any>(p: string): T | null {
  try { return JSON.parse(fs.readFileSync(p, "utf-8")); } catch { return null; }
}
export function ls(dir: string, re?: RegExp): string[] {
  try { return fs.readdirSync(dir).filter((f) => !f.startsWith(".") && (!re || re.test(f))).sort(); } catch { return []; }
}
export function fileInfo(id: string, rel: string) {
  const abs = path.join(wsDir(id), rel);
  try {
    const s = fs.statSync(abs);
    return { path: rel, size: s.size, mtime: s.mtimeMs };
  } catch { return null; }
}
export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
export const bad = (msg: string, status = 400) => json({ error: msg }, status);

export function validWs(id: string): boolean {
  return WS_ID.test(id) && exists(wsDir(id)) && fs.statSync(wsDir(id)).isDirectory();
}

export const readText = (p: string) => { try { return fs.readFileSync(p, "utf-8"); } catch { return ""; } };

export function actIds(ws: string): string[] {
  const plan = readJson(path.join(wsDir(ws), "05-video/acts.json"));
  return (plan?.acts ?? []).map((a: any) => String(a.id));
}

export const notesRel = (act: string) => `05-video/review/${act}/director_notes.md`;
export const voiceReviewPath = (ws: string) => path.join(wsDir(ws), "03-voiceover/review.json");

/** Blocks cross-site requests and DNS rebinding: Host must be ours; writes need a custom header (forces CORS preflight). */
export function guard(req: Request): Response | null {
  if (viaPublic.has(req)) return req.method !== "GET" && req.method !== "HEAD" && req.headers.get("x-wg") !== "1" ? bad("missing x-wg header", 403) : null;
  const host = req.headers.get("host") ?? "";
  const names = ["127.0.0.1", "localhost", ...(HOST === "127.0.0.1" ? [] : [...lanIps(), `${os.hostname().replace(/\.local$/, "")}.local`])];
  if (!names.some((n) => host.toLowerCase() === `${n.toLowerCase()}:${PORT}`)) return bad("bad host", 403);
  if (req.method !== "GET" && req.method !== "HEAD" && req.headers.get("x-wg") !== "1") return bad("missing x-wg header", 403);
  return null;
}

export async function body(req: Request): Promise<any> {
  try { return await req.json(); } catch { return {}; }
}
