/**
 * One-time sign-in to YouTube (read-only): opens Google's consent page, catches the redirect on a loopback port,
 * and stores the refresh token next to youtube_client.json (gitignored, mode 600).
 *
 * Usage: bun run yt:auth [--no-open]
 * Pick the account (or Brand Account channel) that owns the channel. "Google hasn't verified this app" is expected for
 * your own Testing app: Advanced → Continue. Testing-mode tokens expire after 7 days; run this again when the dashboard
 * says "re-connect".
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { DIR, SCOPES, readClient, saveToken, tokenFile } from "./lib";

const c = readClient();
const verifier = crypto.randomBytes(48).toString("base64url");
const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
const state = crypto.randomBytes(16).toString("hex");

let redirect = "";
const done = new Promise<string>((resolve, reject) => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req) {
      const u = new URL(req.url);
      if (u.pathname !== "/") return new Response("", { status: 404 });
      const err = u.searchParams.get("error");
      if (err) { setTimeout(() => { server.stop(); reject(new Error(err)); }, 100); return page(`Sign-in cancelled: ${err}`); }
      if (u.searchParams.get("state") !== state) return page("State mismatch: start again with bun run yt:auth", 400);
      const code = u.searchParams.get("code");
      if (!code) return page("No code in the redirect", 400);
      setTimeout(() => { server.stop(); resolve(code); }, 100);
      return page("Connected. You can close this tab and go back to the dashboard.");
    },
  });
  redirect = `http://127.0.0.1:${server.port}`;
  setTimeout(() => { server.stop(); reject(new Error("timed out after 5 minutes")); }, 5 * 60_000);
});
function page(msg: string, status = 200) {
  return new Response(`<!doctype html><meta charset=utf-8><title>WealthGap</title><body style="font:16px system-ui;padding:40px">${msg.replace(/[<&]/g, "")}</body>`, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

const url = `${c.auth_uri}?${new URLSearchParams({
  client_id: c.client_id, redirect_uri: redirect, response_type: "code", scope: SCOPES.join(" "),
  access_type: "offline", prompt: "consent", state, code_challenge: challenge, code_challenge_method: "S256",
})}`;
console.log("🔐 Open this URL to connect YouTube (read-only):\n");
console.log(url + "\n");
if (!process.argv.includes("--no-open") && process.platform === "darwin") spawn("open", [url], { stdio: "ignore", detached: true }).unref();

try {
  const code = await done;
  const r = await fetch(c.token_uri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: c.client_id, client_secret: c.client_secret, redirect_uri: redirect, grant_type: "authorization_code", code_verifier: verifier }),
  });
  const j: any = await r.json();
  if (!r.ok || !j.refresh_token) throw new Error(`${j.error ?? r.status}: ${j.error_description ?? "no refresh token returned"}`);
  saveToken({ access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + Number(j.expires_in ?? 3600) * 1000, scope: j.scope, obtained_at: new Date().toISOString() });
  try { fs.rmSync(path.join(DIR, "auth_error.json")); } catch {}
  console.log(`✅ connected; token saved to ${path.relative(process.cwd(), tokenFile())}. Next: bun run yt:fetch`);
  process.exit(0);
} catch (e: any) {
  console.error(`❌ ${e.message}`);
  process.exit(1);
}
