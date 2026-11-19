/**
 * Local control room for the video pipeline: one page to pick a workspace, edit the script,
 * run each step, watch its log, and see/hear what it produced.
 *
 * Usage: bun run dashboard [--port 4600] [--host 0.0.0.0] [--public]
 *   binds 127.0.0.1 unless --host is given; --host 0.0.0.0 opens it to the local network (no login: home network only)
 *   --public (bun run dashboard:public): also serves the app with a password (PWA_PASS in .env) on 127.0.0.1:<port+1>
 *   and publishes that port on the internet with Tailscale Funnel; prints the link and a QR code (public.ts)
 *   NTFY_TOPIC=<topic> sends a phone notification (ntfy.sh app) when a job ends (PHONE_NOTIFY=0 turns it off)
 *   on macOS a desktop notification is shown too (MAC_NOTIFY=0 turns it off)
 *   Both switches live in Settings → Notifications and are re-read from .env at every job end (no restart needed).
 *
 * Commands are allowlisted: the client sends a step key, the server builds the argv and runs it
 * with Bun.spawn (no shell) from the repo root. One job per workspace. Logs live in memory and
 * are appended to workspace/<ID>/dashboard.log. Status is derived from files on disk + that log.
 *
 * This file is the entry: the router and the boot. The parts live in server/ (see docs/ARCHITECTURE.md):
 *   core (paths, helpers, guard) · jobs · notify · studio · naming · actions/ (the allowlist, one file per step)
 *   status · details (what the page shows) · files · settings · routes/ (one file per feature)
 */
import { analyticsRoute, type AnalyticsCtx } from "./analytics";
import { ideasRoute } from "./ideas";
import { postedRoute } from "./posted";
import { listenRoute } from "./listen";
import { publicHandler, readPass, startFunnel, stopFunnel, qr } from "./public";
import { ANSI, DIST, ENV_FILE, HOST, PORT, PUBLIC, PUBLIC_PORT, REPO, WS_ID, bad, body, guard, json, lanIps, remote, validWs, viaPublic, wsDir } from "./server/core";
import { childEnv, jobSummary, jobs, killTree, logStream, pump, runningJob, startJob, startSampler } from "./server/jobs";
import { notifyCfg } from "./server/notify";
import { currentStudio } from "./server/studio";
import { serveWeb } from "./server/files";
import "./server/naming";
import { appRoutes } from "./server/routes/app";
import { settingsRoutes } from "./server/routes/settings";
import { projectRoutes } from "./server/routes/project";
import { scriptRoutes } from "./server/routes/script";
import { publishRoutes } from "./server/routes/publish";
import { shortsRoutes } from "./server/routes/shorts";
import { actsRoutes } from "./server/routes/acts";
import { voiceRoutes } from "./server/routes/voice";
import { acceptRoutes } from "./server/routes/accept";
import { autopilotRoutes } from "./server/routes/autopilot";
import { startAutopilotLoop } from "./server/autopilot";

const anCtx: AnalyticsCtx = { json, bad, body, startJob, runningJob, jobSummary, getJob: (id) => jobs.get(id), logStream };

/** Routes of one project (/api/ws/<id>/…), tried in order; each answers or returns null. */
const WS_ROUTES = [projectRoutes, scriptRoutes, publishRoutes, shortsRoutes, actsRoutes, voiceRoutes, acceptRoutes, autopilotRoutes];

async function appFetch(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const p = url.pathname;
  const g = guard(req);
  if (g) return g;
  const an = await analyticsRoute(req, url, anCtx);
  if (an) return an;
  const idr = await ideasRoute(req, url, anCtx);
  if (idr) return idr;
  const por = await postedRoute(req, url, anCtx);
  if (por) return por;

  if (p === "/api/listen/voices") { const r = await listenRoute(req, p, null, "", { json, bad, body, wsDir }); if (r) return r; }
  for (const route of [appRoutes, settingsRoutes]) { const r = await route(req, url); if (r) return r; }

  const m = p.match(/^\/api\/ws\/([^/]+)(\/.*)?$/);
  if (!m) return p.startsWith("/api/") || p.startsWith("/brand/") ? bad("not found", 404) : serveWeb(req, p);
  const ws = decodeURIComponent(m[1]);
  const rest = m[2] ?? "";
  if (!WS_ID.test(ws)) return bad("bad workspace id");

  // logs can be read for a job that is still creating its workspace
  const lm = rest.match(/^\/log\/(\w+)$/);
  if (lm && req.method === "GET") {
    const job = jobs.get(lm[1]);
    if (!job || job.ws !== ws) return bad("no such job (server restarted?)", 404);
    if (url.searchParams.get("plain")) return new Response(job.text, { headers: { "content-type": "text/plain; charset=utf-8" } });
    return logStream(job);
  }

  if (!validWs(ws)) return bad("no such workspace", 404);

  // the script as an audio file (macOS say) to review by ear
  if (rest.startsWith("/listen")) return (await listenRoute(req, p, ws, rest, { json, bad, body, wsDir }))!;

  for (const route of WS_ROUTES) { const r = await route(req, url, ws, rest); if (r) return r; }
  return bad("not found", 404);
}

startSampler();
startAutopilotLoop();

const LIMIT_BODY = 1024 * 1024 * 1024; // uploads (music, footage) can be large
const server = Bun.serve({ hostname: HOST, port: PORT, idleTimeout: 0, maxRequestBodySize: LIMIT_BODY, fetch: appFetch });

console.log(`🎛  WealthGap dashboard on http://${HOST}:${server.port}`);
if (HOST !== "127.0.0.1") {
  for (const ip of lanIps()) console.log(`   on your network: http://${ip}:${server.port}  (no login: home network only)`);
}
if (PUBLIC) startPublic();
{ const c = notifyCfg(); console.log(`   notifications: Mac ${c.mac ? "on" : "off"}, phone ${c.phone ? "on" : c.topic ? "off" : "off (no NTFY_TOPIC)"} (Settings → Notifications)`); }

function startPublic() {
  if (!readPass(ENV_FILE)) { console.log("   ✗ internet access off: set PWA_PASS=<password> in .env first"); return; }
  const handler = publicHandler({ repo: REPO, envFile: ENV_FILE, dist: DIST, app: appFetch, markPublic: (r) => viaPublic.add(r) });
  Bun.serve({ hostname: "127.0.0.1", port: PUBLIC_PORT, idleTimeout: 0, maxRequestBodySize: LIMIT_BODY, fetch: handler });
  const f = startFunnel(PUBLIC_PORT);
  if (!f.ok) { console.log(`   ✗ internet access off: ${f.why}`); return; }
  remote.url = f.url;
  // keep the Mac awake while the dashboard is published (idle sleep would take the link down; closing the lid still sleeps)
  try { Bun.spawn(["caffeinate", "-i", "-w", String(process.pid)], { stdout: "ignore", stderr: "ignore" }); } catch {}
  console.log(`\n   🌍 on the internet (password: PWA_PASS): ${f.url}\n`);
  console.log(qr(f.url).split("\n").map((l) => "   " + l).join("\n"));
  console.log("   Scan with your phone, sign in, then Share → Add to Home Screen (iPhone) or Install app (Android).\n");
}

function shutdown() {
  if (remote.url) stopFunnel();
  const studio = currentStudio();
  if (studio?.pid) killTree(studio.pid);
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
