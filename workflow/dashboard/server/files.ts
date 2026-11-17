/** Serving files: workspace files with path checks and ranges, downloads, the built web app; plus the overview's sizes and foley edits. */
import fs from "node:fs";
import path from "node:path";
import * as sh from "../../08-shorts/lib";
import { DIST, bad, exists, readJson, wsDir } from "./core";

// ───────────────────────────── files ─────────────────────────────

/** Resolve a workspace-relative path, refusing anything that escapes the workspace (incl. symlinks). */
export function safePath(ws: string, rel: string | null): string | null {
  if (!rel || rel.includes("\0") || path.isAbsolute(rel)) return null;
  const parts = rel.split(/[\\/]+/);
  if (parts.some((p) => p === ".." || p.startsWith(".") || p === "node_modules")) return null;
  const root = fs.realpathSync(wsDir(ws));
  const abs = path.resolve(root, rel);
  if (!abs.startsWith(root + path.sep)) return null;
  let real: string;
  try { real = fs.realpathSync(abs); } catch { return null; }
  if (!real.startsWith(root + path.sep)) return null;
  return real;
}

// ───────────────────────────── project overview: downloads, size, foley edits ─────────────────────────────

/** The folder of the long video (short = null) or of one of its shorts. */
export const subWs = (ws: string, short: string | null) => (short ? sh.shortWs(ws, short) : wsDir(ws));
/** ?short=S1 → "S1" | null; a Response when it names a short that does not exist. */
export function shortParam(ws: string, url: URL): string | null | Response {
  const sid = url.searchParams.get("short");
  if (!sid) return null;
  return sh.SHORT_ID.test(sid) && sh.listShorts(ws).includes(sid) ? sid : bad("unknown short");
}

export const sizeCache = new Map<string, { at: number; bytes: number }>();
/** Disk size of a folder (du), cached for a minute: the overview polls it. */
export async function dirBytes(dir: string): Promise<number> {
  const c = sizeCache.get(dir);
  if (c && Date.now() - c.at < 60_000) return c.bytes;
  let bytes = c?.bytes ?? 0;
  try {
    const proc = Bun.spawn(["du", "-sk", dir], { stdout: "pipe", stderr: "ignore" });
    const out = await new Response(proc.stdout).text();
    const kb = parseInt(out.split(/\s+/)[0], 10);
    if (Number.isFinite(kb)) bytes = kb * 1024;
  } catch {}
  sizeCache.set(dir, { at: Date.now(), bytes });
  return bytes;
}

/** 08-deliver/deliver.json with every item checked against the disk (a missing file is flagged, a path that leaves the folder is dropped). */
export function deliverInfo(dir: string) {
  const j = readJson<any>(path.join(dir, "08-deliver/deliver.json"));
  if (!j || !Array.isArray(j.items)) return null;
  const items = j.items.flatMap((it: any) => {
    if (!it || typeof it.key !== "string" || typeof it.file !== "string" || path.isAbsolute(it.file) || it.file.split(/[\\/]+/).includes("..")) return [];
    let bytes = 0, present = false;
    try { const st = fs.statSync(path.join(dir, it.file)); present = st.isFile(); bytes = st.size; } catch {}
    return [{ key: it.key, group: String(it.group ?? "other"), label: String(it.label ?? it.key), file: it.file, bytes, present, note: typeof it.note === "string" ? it.note : undefined }];
  });
  return { builtAt: Number(j.builtAt) || 0, items };
}

export const FOLEY_KEY = /^[^\0\r\n]{1,200}$/;
/** sfx_edits.json: { off: [key], gainDb: { key: -24..6 }, keep: [key] (thinned events put back) }; anything else is refused. */
export function validSfxEdits(b: any): { off: string[]; gainDb: Record<string, number>; keep: string[] } | string {
  if (!b || typeof b !== "object" || Array.isArray(b)) return "body must be an object";
  const off = b.off ?? [], gain = b.gainDb ?? {}, keep = b.keep ?? [];
  const keys = (l: unknown) => Array.isArray(l) && l.length <= 20000 && l.every((k: unknown) => typeof k === "string" && FOLEY_KEY.test(k));
  if (!keys(off)) return "off: a list of event keys";
  if (!keys(keep)) return "keep: a list of event keys";
  if (!gain || typeof gain !== "object" || Array.isArray(gain)) return "gainDb: an object of key → dB";
  const g: Record<string, number> = {};
  for (const [k, v] of Object.entries(gain)) {
    if (!FOLEY_KEY.test(k) || typeof v !== "number" || !Number.isFinite(v) || v < -24 || v > 6) return `gainDb ${k.slice(0, 40)}: a number from -24 to 6`;
    if (v !== 0) g[k] = Math.round(v * 10) / 10;
  }
  return { off: [...new Set<string>(off)], gainDb: g, keep: [...new Set<string>(keep)] };
}

export function serveFile(req: Request, abs: string): Response {
  const file = Bun.file(abs);
  const size = file.size;
  const ext = path.extname(abs).toLowerCase();
  const safeType = [".html", ".htm", ".svg", ".xml", ".js", ".mjs"].includes(ext) ? "text/plain; charset=utf-8" : file.type;
  const headers: Record<string, string> = {
    "accept-ranges": "bytes",
    "content-type": safeType,
    "x-content-type-options": "nosniff",
    "content-security-policy": "sandbox",
    "cache-control": "no-cache",
  };
  const range = req.headers.get("range");
  if (range) {
    const m = range.match(/^bytes=(\d*)-(\d*)$/);
    if (!m || (!m[1] && !m[2])) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    let start: number, end: number;
    if (!m[1]) { start = Math.max(0, size - parseInt(m[2], 10)); end = size - 1; }
    else { start = parseInt(m[1], 10); end = m[2] ? Math.min(parseInt(m[2], 10), size - 1) : size - 1; }
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    return new Response(file.slice(start, end + 1), { status: 206, headers: { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1) } });
  }
  return new Response(file, { headers: { ...headers, "content-length": String(size) } });
}

// ───────────────────────────── web app (workflow/dashboard/web/dist) ─────────────────────────────

/** Static files of the built React app; any other GET falls back to index.html (client-side routing). */
export function serveWeb(req: Request, p: string): Response {
  if (req.method !== "GET" && req.method !== "HEAD") return bad("not found", 404);
  const index = path.join(DIST, "index.html");
  if (!exists(index)) return new Response("Dashboard UI is not built. Run: bun run dashboard (builds it) or bun run --cwd workflow/dashboard/web build", { status: 503 });
  let rel: string;
  try { rel = decodeURIComponent(p); } catch { return bad("bad path"); }
  const abs = path.resolve(DIST, "." + rel);
  if (abs.startsWith(DIST + path.sep) && exists(abs) && fs.statSync(abs).isFile()) {
    const hashed = rel.startsWith("/assets/");
    return new Response(Bun.file(abs), { headers: { "cache-control": hashed ? "public, max-age=31536000, immutable" : "no-cache" } });
  }
  return new Response(Bun.file(index), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
