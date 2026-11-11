/** Routes that are not about one project: the project list, the action schema, machine stats, activity, usage, limits, brand images. */
import path from "node:path";
import { sample, history, topProcs, want, machine } from "../../system";
import { refreshUsage, usageReport } from "../../usage";
import { nextUntitled } from "../../../lib/rename";
import * as sh from "../../../08-shorts/lib";
import { REPO, WS_ID, bad, body, exists, json, remote, viaPublic, wsDir } from "../core";
import { jobSummary, jobs, killTree, runningJob, startJob } from "../jobs";
import { currentStudio, studioState } from "../studio";
import { renames } from "../naming";
import { B, schema } from "../actions";
import { listWorkspaces, timingsAll } from "../details";
import { limits } from "../settings";

export async function appRoutes(req: Request, url: URL): Promise<Response | null> {
  const p = url.pathname;
  if (p === "/api/workspaces" && req.method === "GET") return json({ workspaces: listWorkspaces(), studio: studioState(), renames: Object.fromEntries(renames) });
  if (p === "/api/schema" && req.method === "GET") return json(schema());
  if (p === "/api/system" && req.method === "GET") {
    want();
    if (!history.length || Date.now() - history[history.length - 1].t > 2500) sample();
    return json({ machine: machine(), now: history[history.length - 1], history: history.slice(-150), top: topProcs(8) });
  }
  if (p === "/api/activity" && req.method === "GET") {
    const all = [...jobs.values()].sort((a, b) => b.startedAt - a.startedAt).slice(0, 40).map(jobSummary);
    return json({ jobs: all, studio: studioState() });
  }
  if (p === "/api/usage" && req.method === "GET") {
    const rows = listWorkspaces().flatMap((w) => timingsAll(w.id).map((r) => ({ ws: w.id, ...r })));
    await refreshUsage(url.searchParams.has("refresh"));
    return json(usageReport(rows));
  }
  if (p === "/api/limits" && req.method === "GET") return json(limits());
  if (p === "/api/session" && req.method === "GET") return json({ remote: viaPublic.has(req), publicUrl: remote.url });

  const bm = p.match(/^\/brand\/(Logo|Banner|WaterMark)\.png$/);
  if (bm && req.method === "GET") return new Response(Bun.file(path.join(REPO, "brand-assets", `${bm[1]}.png`)), { headers: { "content-type": "image/png", "cache-control": "max-age=3600" } });

  if (p === "/api/workspaces" && req.method === "POST") {
    const b = await body(req);
    // no id: the next number, untitled (named automatically once its idea or script is written)
    const id = typeof b.id === "string" && b.id.trim() ? b.id.trim() : nextUntitled(b.kind === "shorts" ? "SH" : "VID");
    if (!WS_ID.test(id)) return bad("ID must match VID<n>_<Name> (a video) or SH<n>_<Name> (shorts), letters, digits, underscores");
    if (exists(wsDir(id))) return bad("workspace already exists", 409);
    if (runningJob(id)) return bad("already being created", 409);
    const job = startJob(id, "new-video", `New ${sh.isShortsProject(id) ? "shorts project" : "video"} ${id}`, [B("new-video", id)]);
    return json({ id, job: jobSummary(job) });
  }

  if (p === "/api/studio/stop" && req.method === "POST") {
    const studio = currentStudio();
    if (studio?.pid) killTree(studio.pid);
    return json({ ok: true });
  }

  return null;
}
