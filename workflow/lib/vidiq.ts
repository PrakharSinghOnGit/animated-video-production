/**
 * vidIQ, called directly (no LLM in between): the hosted MCP server at https://mcp.vidiq.com/mcp, through the MCP SDK.
 *
 * Nothing here may block the pipeline. Every entry point returns { ok: false, reason } instead of throwing when vidIQ is
 * not connected, unreachable, slow or out of credits, and the caller carries on the normal way.
 *
 *   bun run vidiq:login     one-time browser login (pick the vidIQ account with the credits); saves the tokens
 *   bun run vidiq:status    connected account, its channels and the credit balance (free)
 *   bun run vidiq:logout    forget the tokens
 *
 * Tokens live in workspace/.vidiq_auth.json (gitignored, mode 600) and refresh themselves. The login's browser callback
 * goes to http://127.0.0.1:53682 on this Mac, so run the login on the Mac (the dashboard's Connect action does that).
 *
 * Paid tools charge credits on submit; `spend` checks the balance first and refuses (as a skip) when it is short.
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { UnauthorizedError, type OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthClientInformationMixed, OAuthClientMetadata, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";

export const VIDIQ_URL = "https://mcp.vidiq.com/mcp";
const REPO = path.resolve(import.meta.dir, "../..");
export const AUTH_FILE = process.env.WG_VIDIQ_AUTH ?? path.join(REPO, "workspace/.vidiq_auth.json");
const PORT = 53682;
const REDIRECT = `http://127.0.0.1:${PORT}/callback`;

/** Credits per call, from the tools' own descriptions (2026-11). Free tools are 0. */
export const COST = { scriptGuidance: 0, scoreTitle: 5, generateTitles: 5, generateThumbnail: 22, uploadImage: 0, balance: 0, jobPoll: 0 } as const;

export type Result<T> = { ok: true; value: T } | { ok: false; reason: string };
/** A reason to skip, not an error: shown as "vidIQ skipped: …" and the step goes on without it. */
export class Skip extends Error {}

interface Saved { client?: OAuthClientInformationMixed; tokens?: OAuthTokens; verifier?: string; discovery?: unknown }
const load = (): Saved => { try { return JSON.parse(fs.readFileSync(AUTH_FILE, "utf-8")); } catch { return {}; } };
const save = (patch: Partial<Saved>) => {
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  fs.writeFileSync(AUTH_FILE, JSON.stringify({ ...load(), ...patch }, null, 1), { mode: 0o600 });
};
export const isLoggedIn = () => !!load().tokens?.access_token;

/** OAuth state on disk. Outside a login, a redirect means the tokens are gone or revoked: that is a skip. */
class FileProvider implements OAuthClientProvider {
  constructor(private onRedirect?: (url: URL) => void) {}
  get redirectUrl() { return REDIRECT; }
  get clientMetadata(): OAuthClientMetadata {
    return { client_name: "Video studio (local)", redirect_uris: [REDIRECT], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none" };
  }
  clientInformation() { return load().client; }
  saveClientInformation(c: OAuthClientInformationMixed) { save({ client: c }); }
  tokens() { return load().tokens; }
  saveTokens(t: OAuthTokens) { save({ tokens: t }); }
  saveCodeVerifier(v: string) { save({ verifier: v }); }
  codeVerifier() { const v = load().verifier; if (!v) throw new Error("no PKCE verifier saved"); return v; }
  saveDiscoveryState(s: unknown) { save({ discovery: s }); }
  discoveryState() { return load().discovery as never; }
  invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier" | "discovery") {
    const s = load();
    if (scope === "all" || scope === "tokens") delete s.tokens;
    if (scope === "all" || scope === "client") delete s.client;
    if (scope === "all" || scope === "verifier") delete s.verifier;
    if (scope === "all" || scope === "discovery") delete s.discovery;
    fs.writeFileSync(AUTH_FILE, JSON.stringify(s, null, 1), { mode: 0o600 });
  }
  redirectToAuthorization(url: URL) {
    if (!this.onRedirect) throw new Skip("not connected to vidIQ (run: bun run vidiq:login)");
    this.onRedirect(url);
  }
}

const withTimeout = <T>(p: Promise<T>, ms: number, what: string) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Skip(`${what} took over ${Math.round(ms / 1000)} s`)), ms))]);

export interface Vidiq {
  /** Call a tool; returns its structured result (or the parsed JSON text, or { text }). Throws on a tool error. */
  call<T = any>(tool: string, args?: Record<string, unknown>, timeoutMs?: number): Promise<T>;
  /** Total credits left (renewable + add-on). */
  balance(): Promise<number>;
  /** Check the balance covers `credits`; throws Skip when it does not. */
  spend(credits: number, what: string): Promise<void>;
  /** Poll an async job (thumbnails) until it is done; throws when it failed or timed out. */
  job<T = any>(mcpJobId: string, timeoutMs?: number): Promise<T>;
}

/** The parsed payload of a tool result: structuredContent, else the first text block as JSON, else { text }. */
export function parseToolResult(r: any): any {
  const text = (r?.content ?? []).filter((c: any) => c?.type === "text").map((c: any) => c.text).join("\n");
  if (r?.isError) throw new Error(text.slice(0, 400) || "vidIQ tool error");
  if (r?.structuredContent && typeof r.structuredContent === "object") return r.structuredContent;
  try { return JSON.parse(text); } catch { return { text }; }
}

async function open(onRedirect?: (url: URL) => void) {
  const provider = new FileProvider(onRedirect);
  const transport = new StreamableHTTPClientTransport(new URL(VIDIQ_URL), { authProvider: provider });
  const client = new Client({ name: "wealthgap-studio", version: "1.0.0" });
  return { client, transport };
}

function api(client: Client): Vidiq {
  const call = async (tool: string, args: Record<string, unknown> = {}, timeoutMs = 60_000) =>
    parseToolResult(await withTimeout(client.callTool({ name: tool, arguments: args }, undefined, { timeout: timeoutMs }), timeoutMs + 5_000, `vidIQ ${tool}`));
  const balance = async () => {
    const b = await call("vidiq_balance");
    return Number(b?.totalCredits ?? 0);
  };
  return {
    call,
    balance,
    async spend(credits, what) {
      if (credits <= 0) return;
      const have = await balance();
      if (have < credits) throw new Skip(`not enough vidIQ credits for ${what} (have ${have}, need ${credits})`);
    },
    async job(id, timeoutMs = 240_000) {
      const end = Date.now() + timeoutMs;
      for (;;) {
        const j = await call("vidiq_job_poll", { mcpJobId: id });
        if (j?.status === "completed") return j.result ?? j;
        if (j?.status && j.status !== "inprogress") throw new Error(`vidIQ job ${j.status}${j.errorCode ? ` (${j.errorCode})` : ""}${j.refunded ? ", credits refunded" : ""}`);
        if (Date.now() > end) throw new Skip(`vidIQ job still running after ${Math.round(timeoutMs / 1000)} s (id ${id})`);
        await new Promise((r) => setTimeout(r, 4000));
      }
    },
  };
}

/**
 * Connect, run `fn`, disconnect. Any failure (not logged in, offline, timeout, tool error, too few credits) comes back as
 * { ok: false, reason } so the caller can fall back. WG_NO_VIDIQ=1 turns vidIQ off everywhere (tests, offline work).
 */
export async function withVidiq<T>(fn: (v: Vidiq) => Promise<T>): Promise<Result<T>> {
  if (process.env.WG_NO_VIDIQ) return { ok: false, reason: "turned off (WG_NO_VIDIQ)" };
  if (!isLoggedIn()) return { ok: false, reason: "not connected to vidIQ (run: bun run vidiq:login)" };
  const { client, transport } = await open();
  try {
    await withTimeout(client.connect(transport), 20_000, "connecting to vidIQ");
    return { ok: true, value: await fn(api(client)) };
  } catch (e) {
    const err = e as Error;
    const reason = e instanceof UnauthorizedError ? "vidIQ login expired (run: bun run vidiq:login)" : err.message || String(e);
    return { ok: false, reason };
  } finally {
    await client.close().catch(() => {});
  }
}

/** Browser login: opens vidIQ's sign-in, waits for the callback on 127.0.0.1, saves the tokens. */
export async function login(): Promise<Result<string>> {
  let resolveCode!: (c: string) => void, rejectCode!: (e: Error) => void;
  const code = new Promise<string>((res, rej) => { resolveCode = res; rejectCode = rej; });
  const server = Bun.serve({
    port: PORT, hostname: "127.0.0.1",
    fetch(req) {
      const u = new URL(req.url);
      if (u.pathname !== "/callback") return new Response("not found", { status: 404 });
      const c = u.searchParams.get("code"), err = u.searchParams.get("error");
      if (c) resolveCode(c); else rejectCode(new Error(`vidIQ login refused: ${err ?? "no code"}`));
      return new Response(`<html><body style="font:16px system-ui;padding:40px">${c ? "Connected to vidIQ. You can close this tab." : "vidIQ login failed. Close this tab and try again."}</body></html>`, { headers: { "content-type": "text/html" } });
    },
  });
  try {
    // a fresh login: forget old tokens (switching accounts) but keep the registered client
    new FileProvider().invalidateCredentials("tokens");
    let opened = false;
    const first = await open((url) => {
      opened = true;
      console.log(`🔑 Opening vidIQ sign-in in your browser. If it does not open, visit:\n   ${url.href}`);
      spawn("open", [url.href], { stdio: "ignore", detached: true }).unref();
    });
    try { await first.client.connect(first.transport); } catch (e) { if (!(e instanceof UnauthorizedError) && !opened) throw e; }
    if (!opened) return { ok: true, value: "already connected" };
    const c = await withTimeout(code, 5 * 60_000, "waiting for the vidIQ sign-in");
    await first.transport.finishAuth(c);
    await first.client.close().catch(() => {});
    return { ok: true, value: "connected" };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  } finally {
    server.stop(true);
  }
}

/** Account, channels and balance, for the CLI and the dashboard. Free. */
export interface VidiqStatus { connected: boolean; reason?: string; account?: string; channels?: { id: string; title: string | null; handle: string | null }[]; credits?: number; resetsAt?: string }
export async function status(): Promise<VidiqStatus> {
  const r = await withVidiq(async (v) => {
    const [ch, b] = await Promise.all([v.call("vidiq_user_channels"), v.call("vidiq_balance")]);
    return {
      account: ch?.authenticatedAs ?? undefined,
      channels: (ch?.channels ?? []).map((c: any) => ({ id: c.id ?? c.channelId, title: c.title ?? null, handle: c.handle ?? null })),
      credits: Number(b?.totalCredits ?? 0), resetsAt: b?.renewableResetsAt,
    };
  });
  return r.ok ? { connected: true, ...r.value } : { connected: false, reason: r.reason };
}

if (import.meta.main) {
  const cmd = process.argv[2] ?? "status";
  if (cmd === "login") {
    const r = await login();
    if (!r.ok) { console.error(`❌ ${r.reason}`); process.exit(1); }
  } else if (cmd === "logout") {
    fs.rmSync(AUTH_FILE, { force: true });
    console.log("✅ vidIQ tokens removed");
    process.exit(0);
  } else if (cmd !== "status") {
    console.error("Usage: bun run workflow/lib/vidiq.ts login|status|logout");
    process.exit(1);
  }
  const s = await status();
  if (!s.connected) { console.log(`⚪ vidIQ: ${s.reason}`); process.exit(cmd === "login" ? 1 : 0); }
  console.log(`✅ vidIQ connected${s.account ? ` as ${s.account}` : ""}: ${s.credits} credits${s.resetsAt ? ` (renews ${s.resetsAt.slice(0, 10)})` : ""}`);
  for (const c of s.channels ?? []) console.log(`   channel ${c.title ?? c.id}${c.handle ? ` (${c.handle})` : ""}`);
}
