/**
 * Internet access for the dashboard (`bun run dashboard:public`).
 *
 * A second listener on 127.0.0.1:<port+1> serves the same app behind a password (PWA_PASS in .env); Tailscale Funnel
 * publishes only that port at https://<mac>.<tailnet>.ts.net. The usual port (4600) stays login-free for this Mac
 * (and the home network with --host), so nothing changes locally. Internet traffic can reach only the
 * password-protected port.
 *
 * Login: POST /api/login {password} -> signed cookie (30 days, renewed while used). The signing key is
 * sha256(random secret in workspace/.dashboard_secret + PWA_PASS), so changing PWA_PASS signs every device out.
 * Wrong passwords are rate limited per client and in total. Manifest, icons, service worker and offline page are
 * public (a browser fetches them without cookies when installing the app); everything else needs the cookie.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { renderUnicodeCompact } from "uqr";

const DAY = 86_400_000;
const SESSION_MS = 30 * DAY;
const COOKIE = "wg_session";
/** Files the browser needs before login (install prompt, icons, offline page, the login page itself). */
const OPEN = /^\/(manifest\.webmanifest|sw\.js|offline\.html|icons\/[\w-]+\.png|login)$/;

export interface PublicCfg {
  repo: string;
  envFile: string;
  dist: string;
  /** the app's own fetch handler; `markPublic` lets its guard know the request came through the public port */
  app: (req: Request) => Promise<Response> | Response;
  markPublic: (req: Request) => void;
}

// ───────────────────────────── password + signing key ─────────────────────────────

let envCache = { mtime: -1, pass: "" };
/** PWA_PASS from .env, re-read when the file changes (no restart needed after editing it in Settings). */
export function readPass(envFile: string): string {
  let m = 0;
  try { m = fs.statSync(envFile).mtimeMs; } catch { return process.env.PWA_PASS ?? ""; }
  if (m !== envCache.mtime) {
    const line = fs.readFileSync(envFile, "utf-8").split("\n").map((l) => l.match(/^\s*(?:export\s+)?PWA_PASS\s*=\s*(.*)$/)).find(Boolean);
    let v = line ? line[1].trim() : "";
    if (/^(["']).*\1$/.test(v)) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, "");
    envCache = { mtime: m, pass: v };
  }
  return envCache.pass || process.env.PWA_PASS || "";
}

function serverSecret(repo: string): Buffer {
  const f = path.join(repo, "workspace/.dashboard_secret");
  try { const b = Buffer.from(fs.readFileSync(f, "utf-8").trim(), "hex"); if (b.length >= 32) return b; } catch {}
  const b = crypto.randomBytes(32);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, b.toString("hex") + "\n", { mode: 0o600 });
  return b;
}

const sha = (s: string | Buffer) => crypto.createHash("sha256").update(s).digest();
const b64u = (b: Buffer) => b.toString("base64url");

// ───────────────────────────── rate limit ─────────────────────────────

const PER_CLIENT = 5, WINDOW = 15 * 60_000, GLOBAL = 30;
const fails = new Map<string, number[]>();
let globalFails: number[] = [];
function lockedFor(client: string): number {
  const now = Date.now();
  const mine = (fails.get(client) ?? []).filter((t) => now - t < WINDOW);
  globalFails = globalFails.filter((t) => now - t < WINDOW);
  if (mine.length >= PER_CLIENT) return mine[0] + WINDOW - now;
  if (globalFails.length >= GLOBAL) return globalFails[0] + WINDOW - now;
  return 0;
}
function fail(client: string) {
  const now = Date.now();
  fails.set(client, [...(fails.get(client) ?? []).filter((t) => now - t < WINDOW), now]);
  globalFails.push(now);
  if (fails.size > 5000) fails.clear();
}

// ───────────────────────────── handler ─────────────────────────────

export function publicHandler(cfg: PublicCfg) {
  const secret = serverSecret(cfg.repo);
  const key = () => sha(Buffer.concat([secret, Buffer.from(":" + readPass(cfg.envFile))]));
  const sign = (exp: number) => b64u(crypto.createHmac("sha256", key()).update(String(exp)).digest());
  const cookie = (value: string, maxAge: number) => `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
  const issue = () => { const exp = Date.now() + SESSION_MS; return cookie(`${exp}.${sign(exp)}`, SESSION_MS / 1000); };

  /** Session expiry (ms) when the cookie is valid for the current password, else 0. */
  function session(req: Request): number {
    if (!readPass(cfg.envFile)) return 0;
    const raw = (req.headers.get("cookie") ?? "").split(/;\s*/).find((c) => c.startsWith(COOKIE + "="))?.slice(COOKIE.length + 1);
    const m = raw?.match(/^(\d{13})\.([\w-]{43})$/);
    if (!m) return 0;
    const exp = Number(m[1]);
    if (exp < Date.now()) return 0;
    const a = Buffer.from(m[2]), b = Buffer.from(sign(exp));
    return a.length === b.length && crypto.timingSafeEqual(a, b) ? exp : 0;
  }

  const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });

  async function login(req: Request): Promise<Response> {
    if (req.headers.get("x-wg") !== "1") return json({ error: "missing x-wg header" }, 403);
    const pass = readPass(cfg.envFile);
    if (!pass) return json({ error: "PWA_PASS is not set in .env" }, 503);
    // Tailscale Funnel puts the visitor's address in X-Forwarded-For
    const client = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
    const wait = lockedFor(client);
    if (wait) return json({ error: `Too many wrong passwords. Try again in ${Math.ceil(wait / 60000)} min.` }, 429);
    let given = "";
    try { given = String((await req.json())?.password ?? ""); } catch {}
    if (!crypto.timingSafeEqual(sha(given), sha(pass))) {
      fail(client);
      await Bun.sleep(400);
      return json({ error: "Wrong password." }, 401);
    }
    fails.delete(client);
    return json({ ok: true }, 200, { "set-cookie": issue() });
  }

  function harden(res: Response): Response {
    try {
      res.headers.set("x-frame-options", "DENY");
      res.headers.set("x-content-type-options", "nosniff");
      res.headers.set("referrer-policy", "same-origin");
    } catch {}   // some responses (redirects) have immutable headers
    return res;
  }

  return async function fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const p = url.pathname;
    if (p === "/api/login" && req.method === "POST") return harden(await login(req));
    if (p === "/api/logout" && req.method === "POST") return harden(json({ ok: true }, 200, { "set-cookie": cookie("", 0) }));
    const exp = session(req);
    if (p === "/login") {
      if (exp) return new Response(null, { status: 302, headers: { location: "/" } });
      return harden(new Response(LOGIN_HTML, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } }));
    }
    if (OPEN.test(p) && (req.method === "GET" || req.method === "HEAD")) {
      const abs = path.join(cfg.dist, p);
      if (fs.existsSync(abs)) {
        const type = p.endsWith(".webmanifest") ? "application/manifest+json" : p.endsWith(".js") ? "text/javascript" : undefined;
        return harden(new Response(Bun.file(abs), { headers: { ...(type ? { "content-type": type } : {}), "cache-control": p.startsWith("/icons/") ? "max-age=86400" : "no-cache" } }));
      }
    }
    if (!exp) {
      if (p.startsWith("/api/")) return harden(json({ error: "login required" }, 401));
      return new Response(null, { status: 302, headers: { location: "/login" } });
    }
    cfg.markPublic(req);
    const res = harden(await cfg.app(req));
    if (exp - Date.now() < SESSION_MS / 2) { try { res.headers.append("set-cookie", issue()); } catch {} }   // keep active devices signed in
    return res;
  };
}

// ───────────────────────────── Tailscale Funnel ─────────────────────────────

function tailscaleBin(): string | null {
  return Bun.which("tailscale") ?? ["/Applications/Tailscale.app/Contents/MacOS/Tailscale", "/opt/homebrew/bin/tailscale"].find((f) => fs.existsSync(f)) ?? null;
}

function run(bin: string, args: string[], timeoutMs = 20_000) {
  const r = Bun.spawnSync([bin, ...args], { stdout: "pipe", stderr: "pipe", timeout: timeoutMs });
  return { code: r.exitCode ?? -1, out: (r.stdout.toString() + r.stderr.toString()).trim() };
}

export type FunnelResult = { ok: true; url: string } | { ok: false; why: string };

/** Publishes 127.0.0.1:<port> at https://<this mac>.ts.net with Tailscale Funnel (stays on until stopFunnel). */
export function startFunnel(port: number): FunnelResult {
  const bin = tailscaleBin();
  if (!bin) return { ok: false, why: "Tailscale is not installed. Once: brew install --cask tailscale-app, open Tailscale, log in, then run this again." };
  const st = run(bin, ["status", "--json"]);
  let status: any = null;
  try { status = JSON.parse(st.out); } catch {}
  if (!status) return { ok: false, why: `Tailscale is not running (open the Tailscale app). ${st.out.split("\n")[0] ?? ""}` };
  if (status.BackendState !== "Running") return { ok: false, why: `Tailscale is ${status.BackendState ?? "not connected"}: open the Tailscale app and log in.` };
  const host = String(status.Self?.DNSName ?? "").replace(/\.$/, "");
  if (!host) return { ok: false, why: "Tailscale has no DNS name for this Mac (turn on MagicDNS in the Tailscale admin console)." };
  const r = run(bin, ["funnel", "--bg", String(port)]);
  if (r.code !== 0) {
    const link = r.out.match(/https:\/\/login\.tailscale\.com\/\S+/)?.[0];
    return { ok: false, why: link ? `Funnel needs a one-time OK for this Mac. Open ${link}, allow it, then run this again.` : `tailscale funnel failed: ${r.out.slice(0, 400)}` };
  }
  return { ok: true, url: `https://${host}` };
}

export function stopFunnel() {
  const bin = tailscaleBin();
  if (bin) run(bin, ["funnel", "--https=443", "off"], 5000);
}

/** QR code for the terminal (two rows per character). */
export const qr = (text: string) => renderUnicodeCompact(text, { border: 1 });

// ───────────────────────────── login page ─────────────────────────────

const LOGIN_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="color-scheme" content="dark light" />
  <meta name="theme-color" content="#0b0b0b" media="(prefers-color-scheme: dark)" />
  <meta name="theme-color" content="#f6f4f2" media="(prefers-color-scheme: light)" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-title" content="Wealth Gap" />
  <link rel="manifest" href="/manifest.webmanifest" />
  <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
  <link rel="icon" href="/icons/favicon-48.png" />
  <title>Wealth Gap: sign in</title>
  <style>
    :root { --bg: #f6f4f2; --card: #fbfaf9; --fg: #161514; --muted: #6b6762; --line: #e4e0dc; --field: #ffffff; --btn: #161514; --btn-fg: #fbfaf9; --err: #b4322f; --ring: #8a857f; }
    @media (prefers-color-scheme: dark) { :root { --bg: #0b0b0b; --card: #141414; --fg: #ededec; --muted: #9a9894; --line: #262626; --field: #0f0f0f; --btn: #ededec; --btn-fg: #0b0b0b; --err: #f07470; --ring: #6b6762; } }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100dvh; display: grid; place-items: center; padding: max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom)); background: var(--bg); color: var(--fg); font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
    main { width: 100%; max-width: 360px; background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 24px; }
    .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; }
    .brand img { width: 36px; height: 36px; border-radius: 7px; }
    .brand b { font-size: 15px; letter-spacing: -0.01em; }
    .brand span { display: block; font-size: 12px; color: var(--muted); }
    label { display: block; font-size: 12.5px; font-weight: 500; margin-bottom: 6px; }
    input[type=password] { width: 100%; height: 44px; padding: 0 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--field); color: var(--fg); font: inherit; font-size: 16px; }
    input:focus-visible, button:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
    button { margin-top: 14px; width: 100%; height: 44px; border: 0; border-radius: 8px; background: var(--btn); color: var(--btn-fg); font: inherit; font-weight: 600; cursor: pointer; }
    button:disabled { opacity: .6; cursor: default; }
    .err { min-height: 20px; margin-top: 10px; color: var(--err); font-size: 13px; }
    .hidden { position: absolute; left: -9999px; }
  </style>
</head>
<body>
  <main>
    <div class="brand"><img src="/icons/icon-192.png" alt="" /><div><b>The Wealth Gap</b><span>Production dashboard</span></div></div>
    <form id="f">
      <input class="hidden" type="text" name="username" autocomplete="username" value="wealthgap" tabindex="-1" aria-hidden="true" />
      <label for="pw">Password</label>
      <input id="pw" type="password" name="password" autocomplete="current-password" required autofocus />
      <button id="go" type="submit">Sign in</button>
      <div id="err" class="err" role="alert"></div>
    </form>
  </main>
  <script>
    const f = document.getElementById("f"), pw = document.getElementById("pw"), go = document.getElementById("go"), err = document.getElementById("err");
    f.addEventListener("submit", async (e) => {
      e.preventDefault(); go.disabled = true; err.textContent = "";
      try {
        const r = await fetch("/api/login", { method: "POST", headers: { "content-type": "application/json", "x-wg": "1" }, body: JSON.stringify({ password: pw.value }) });
        if (r.ok) {
          const next = new URLSearchParams(location.search).get("next") || "/" + location.hash;
          location.replace(next.startsWith("/") && !next.startsWith("//") ? next : "/");
          return;
        }
        err.textContent = (await r.json().catch(() => ({}))).error || "Sign-in failed.";
        pw.select();
      } catch { err.textContent = "Can't reach the dashboard."; }
      go.disabled = false;
    });
  </script>
</body>
</html>`;
