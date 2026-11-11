/**
 * "Listen while walking": a script as an audio file, made by macOS's built-in `say` (free, local, a few seconds per
 * minute of speech). Not the real voiceover, just the words, so the creator can review a script by ear with the phone
 * locked. Files: workspace/<ID>/listen/<hash>.m4a (a new file per text/voice/speed; the newest few are kept).
 *
 *   GET  /api/listen/voices                         the usable English voices (novelty voices like Bells left out)
 *   POST /api/ws/:ws/listen {text, voice?, wpm?}    make (or reuse) the file → {url, bytes}
 *   GET  /api/ws/:ws/listen/<hash>.m4a              the file (with Range, so phones can seek)
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** macOS ships joke voices with English labels (they sing, bubble, boing); never offer them */
const NOVELTY = /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Grandma|Grandpa|Rocko|Shelley|Flo|Eddy|Reed|Sandy|Fred|Junior|Ralph|Kathy)\b/;
const KEEP = 6;

let voiceCache: { name: string; lang: string }[] | null = null;
export function sayVoices(): { name: string; lang: string }[] {
  if (voiceCache) return voiceCache;
  if (process.platform !== "darwin") return (voiceCache = []);
  const r = Bun.spawnSync(["say", "-v", "?"], { stdout: "pipe", stderr: "ignore" });
  const seen = new Set<string>();
  voiceCache = r.stdout.toString().split("\n").map((l) => l.match(/^(.+?)\s+(en_[A-Z]{2})\s+#/)).filter(Boolean)
    // "Samantha (English (US))" → "Samantha", the name `say -v` takes
    .map((m) => ({ name: m![1].replace(/\s*\(.*\)\s*$/, "").trim(), lang: m![2] })).filter((v) => !NOVELTY.test(v.name) && !seen.has(v.name) && seen.add(v.name));
  return voiceCache;
}
const defaultVoice = () => { const v = sayVoices(); return (v.find((x) => /premium|enhanced/i.test(x.name)) ?? v.find((x) => x.name === "Samantha") ?? v[0])?.name ?? ""; };

function serveRange(req: Request, file: string): Response {
  const size = fs.statSync(file).size;
  const m = (req.headers.get("range") ?? "").match(/bytes=(\d*)-(\d*)/);
  const head = { "content-type": "audio/mp4", "accept-ranges": "bytes", "cache-control": "max-age=86400" };
  if (!m) return new Response(Bun.file(file), { headers: { ...head, "content-length": String(size) } });
  const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
  const end = m[1] && m[2] ? Math.min(size - 1, Number(m[2])) : size - 1;
  if (start >= size || start > end) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
  return new Response(Bun.file(file).slice(start, end + 1), { status: 206, headers: { ...head, "content-length": String(end - start + 1), "content-range": `bytes ${start}-${end}/${size}` } });
}

export interface ListenCtx { json: (d: unknown, s?: number) => Response; bad: (m: string, s?: number) => Response; body: (r: Request) => Promise<any>; wsDir: (ws: string) => string }

/** Routes under /api/listen and /api/ws/:ws/listen; null when the path isn't one of them. */
export async function listenRoute(req: Request, p: string, ws: string | null, rest: string, ctx: ListenCtx): Promise<Response | null> {
  if (p === "/api/listen/voices" && req.method === "GET") return ctx.json({ voices: sayVoices(), default: defaultVoice(), available: process.platform === "darwin" });
  if (!ws || !rest.startsWith("/listen")) return null;
  const dir = path.join(ctx.wsDir(ws), "listen");

  const fm = rest.match(/^\/listen\/([a-f0-9]{16})\.m4a$/);
  if (fm && req.method === "GET") {
    const f = path.join(dir, `${fm[1]}.m4a`);
    return fs.existsSync(f) ? serveRange(req, f) : ctx.bad("no such audio", 404);
  }
  if (rest !== "/listen" || req.method !== "POST") return ctx.bad("not found", 404);
  if (process.platform !== "darwin") return ctx.bad("audio files need macOS's say command");
  const b = await ctx.body(req);
  const text = typeof b.text === "string" ? b.text.trim() : "";
  if (!text || text.length > 200_000) return ctx.bad("text: the spoken script, up to 200,000 characters");
  const voice = typeof b.voice === "string" && sayVoices().some((v) => v.name === b.voice) ? b.voice : defaultVoice();
  const wpm = Math.max(120, Math.min(320, Number(b.wpm) || 180));
  const hash = crypto.createHash("sha1").update(`${voice}|${wpm}|${text}`).digest("hex").slice(0, 16);
  const out = path.join(dir, `${hash}.m4a`);
  if (!fs.existsSync(out)) {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "wg-listen-")), "script.txt");
    fs.writeFileSync(tmp, text, "utf-8");
    const proc = Bun.spawn(["say", "-v", voice, "-r", String(wpm), "-f", tmp, "-o", `${out}.part.m4a`, "--file-format=m4af", "--data-format=aac"], { stdout: "ignore", stderr: "pipe" });
    const err = await new Response(proc.stderr).text();
    const code = await proc.exited;
    fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
    if (code !== 0 || !fs.existsSync(`${out}.part.m4a`)) return ctx.bad(`say failed: ${err.trim() || `exit ${code}`}`, 500);
    fs.renameSync(`${out}.part.m4a`, out);
    // keep the newest few
    const old = fs.readdirSync(dir).filter((f) => f.endsWith(".m4a") && !f.includes(".part")).map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, z) => z.t - a.t).slice(KEEP);
    for (const o of old) fs.rmSync(path.join(dir, o.f), { force: true });
  }
  return ctx.json({ url: `/api/ws/${encodeURIComponent(ws)}/listen/${hash}.m4a`, bytes: fs.statSync(out).size, voice, wpm });
}
