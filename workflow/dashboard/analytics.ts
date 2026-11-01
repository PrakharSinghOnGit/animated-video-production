/**
 * Dashboard routes for the Analytics page (global + per video) and the lessons gate.
 * Long work (sign-in, fetch, review, mock) runs as a normal dashboard job under the pseudo-workspace "_analytics",
 * so it shows in Activity and streams its log. Everything else reads the cache in workspace/_analytics.
 *
 *   GET  /api/analytics[?mock=1]            snapshot + diagnosis + lessons + links + latest review + auth state
 *   POST /api/analytics/run {action, agent?, video?, mock?}   action: auth | fetch | mock | review
 *   PUT  /api/analytics/link {ws, id|null}  link a workspace to its YouTube upload (id or URL)
 *   POST /api/analytics/lessons/:id {action, reason?, rule?}  approve | reject | retire | restore | edit
 *   GET  /api/analytics/log/:job            live log of an analytics job
 */
import { allSpecs, roleModel } from "../lib/models";
import fs from "node:fs";
import path from "node:path";
import { DIR, authState, mapping, parseYtId, planActs, readJson, readSnapshot, setMapping, workspaces } from "../09-analytics/lib";
import { diagnose } from "../09-analytics/diagnose";
import { ACTIVE_CAP, TARGETS, TARGET_INFO, decide, readStore } from "../learning/lessons";

export const AN_WS = "_analytics";
export interface AnalyticsCtx {
  json: (d: unknown, s?: number) => Response;
  bad: (m: string, s?: number) => Response;
  body: (r: Request) => Promise<any>;
  startJob: (ws: string, step: string, label: string, cmds: string[][], opts?: Record<string, any>) => any;
  runningJob: (ws: string) => any;
  jobSummary: (j: any) => any;
  getJob: (id: string) => any;
  logStream: (j: any) => Response;
}


function reviews() {
  const dir = path.join(DIR, "reviews");
  let files: string[] = [];
  try { files = fs.readdirSync(dir).filter((f) => /^\d{4}-.*_[a-z]+\.json$/.test(f)).sort().reverse().slice(0, 10); } catch {}
  return files.map((f) => readJson<any>(path.join(dir, f))).filter(Boolean);
}

export async function analyticsRoute(req: Request, url: URL, ctx: AnalyticsCtx): Promise<Response | null> {
  const p = url.pathname;
  if (!p.startsWith("/api/analytics")) return null;
  fs.mkdirSync(DIR, { recursive: true });

  if (p === "/api/analytics" && req.method === "GET") {
    const mock = url.searchParams.get("mock") === "1";
    const snap = readSnapshot(mock);
    const links = mapping();
    const acts = Object.fromEntries([...new Set([...Object.values(links), ...(snap?.videos ?? []).map((v) => v.ws).filter(Boolean) as string[]])].map((w) => [w, planActs(w)]));
    const running = ctx.runningJob(AN_WS);
    return ctx.json({
      auth: authState(), mock, mockAvailable: !!readSnapshot(true), realAvailable: !!readSnapshot(false),
      snapshot: snap, diagnosis: snap ? diagnose(snap) : null,
      lessons: readStore(), targets: TARGETS, targetInfo: TARGET_INFO, cap: ACTIVE_CAP,
      workspaces: workspaces().map((w) => ({ id: w, ytId: Object.entries(links).find(([, x]) => x === w)?.[0] ?? null, title: readJson<any>(path.join(DIR, "..", w, "05-video/acts.json"))?.video?.title ?? null })),
      acts, reviews: reviews(), fetchLog: (readJson<any[]>(path.join(DIR, "fetch_log.json")) ?? []).slice(-5),
      running: running ? ctx.jobSummary(running) : null,
    });
  }

  if (p === "/api/analytics/run" && req.method === "POST") {
    if (ctx.runningJob(AN_WS)) return ctx.bad("an analytics job is already running", 409);
    const b = await ctx.body(req);
    const B = (s: string, ...r: string[]) => ["bun", "run", s, ...r];
    if (b.action === "auth") return ctx.json({ job: ctx.jobSummary(ctx.startJob(AN_WS, "yt:auth", "Connect YouTube", [B("yt:auth")])) });
    if (b.action === "fetch") return ctx.json({ job: ctx.jobSummary(ctx.startJob(AN_WS, "yt:fetch", "Refresh YouTube analytics", [B("yt:fetch")])) });
    if (b.action === "mock") return ctx.json({ job: ctx.jobSummary(ctx.startJob(AN_WS, "yt:mock", "Write mock analytics", [B("yt:mock")])) });
    if (b.action === "review") {
      // "default" or empty = Settings → Models (analytics); anything else must be a known model
      const agent = b.agent && b.agent !== "default" && allSpecs().includes(String(b.agent)) ? String(b.agent) : roleModel("analytics");
      const argv = ["--agent", agent];
      if (typeof b.video === "string" && b.video) {
        if (!/^(VID\d+_[A-Za-z0-9_]+|[A-Za-z0-9_-]{11})$/.test(b.video)) return ctx.bad("bad video");
        argv.push("--video", b.video);
      }
      if (b.mock) argv.push("--mock");
      return ctx.json({ job: ctx.jobSummary(ctx.startJob(AN_WS, "yt:review", `Analytics review (${agent}${b.video ? `, ${b.video}` : ""})`, [B("yt:review", ...argv)], { agent })) });
    }
    return ctx.bad("unknown action");
  }

  if (p === "/api/analytics/link" && req.method === "PUT") {
    const b = await ctx.body(req);
    const id = b.id === null || b.id === "" ? null : parseYtId(String(b.id ?? ""));
    if (b.id && !id) return ctx.bad("not a YouTube video id or URL");
    if (id) { const other = mapping()[id]; if (other && other !== b.ws) return ctx.bad(`already linked to ${other}`, 409); }
    try { setMapping(String(b.ws ?? ""), id); } catch (e: any) { return ctx.bad(e.message); }
    return ctx.json({ ok: true, id });
  }

  const lm = p.match(/^\/api\/analytics\/lessons\/(L\d+)$/);
  if (lm && req.method === "POST") {
    const b = await ctx.body(req);
    if (!["approve", "reject", "retire", "restore", "edit"].includes(b.action)) return ctx.bad("bad action");
    try {
      decide(lm[1], b.action, { reason: typeof b.reason === "string" ? b.reason.slice(0, 500) : undefined, rule: typeof b.rule === "string" ? b.rule.slice(0, 600) : undefined });
      return ctx.json({ ok: true, lessons: readStore() });
    } catch (e: any) { return ctx.bad(e.message, 409); }
  }

  const jm = p.match(/^\/api\/analytics\/log\/(\w+)$/);
  if (jm && req.method === "GET") {
    const j = ctx.getJob(jm[1]);
    if (!j || j.ws !== AN_WS) return ctx.bad("no such job", 404);
    if (url.searchParams.get("plain")) return new Response(j.text, { headers: { "content-type": "text/plain; charset=utf-8" } });
    return ctx.logStream(j);
  }
  return ctx.bad("not found", 404);
}
