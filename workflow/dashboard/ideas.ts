/**
 * Dashboard routes for the Ideas page (workspace/_ideas/ideas.json, checked by workflow/01-ideation/ideas.ts).
 * Research and "start a project" run as analytics jobs (pseudo-workspace "_analytics") so the Ideas page streams
 * their log with the same JobLog.
 *
 *   GET    /api/ideas                       ideas + AUDIENCE.md + whether the API key is set + the models + a running job
 *   POST   /api/ideas {title, note?, keywords?}
 *   PUT    /api/ideas/:id {title?, note?, keywords?, status?}
 *   DELETE /api/ideas/:id
 *   POST   /api/ideas/:id/research           job: bun run ideas --id <id>
 *   POST   /api/ideas/:id/start {name}       job: new video VID<n>_<name>, then the idea into its 02-scripting/idea.md
 */
import fs from "node:fs";
import path from "node:path";
import { roleModel } from "../lib/models";
import { AUDIENCE_FILE, nextIdeaId, readIdeas, writeIdeas, type Idea } from "../01-ideation/lib";
import { workspaces } from "../09-analytics/lib";
import { AN_WS, hasCommentKey, type AnalyticsCtx } from "./analytics";

const B = (s: string, ...r: string[]) => ["bun", "run", s, ...r];
const clip = (x: unknown, n: number) => (typeof x === "string" ? x.trim().slice(0, n) : "");

export async function ideasRoute(req: Request, url: URL, ctx: AnalyticsCtx): Promise<Response | null> {
  const p = url.pathname;
  if (!p.startsWith("/api/ideas")) return null;

  if (p === "/api/ideas" && req.method === "GET") {
    const running = ctx.runningJob(AN_WS);
    let audience = "";
    try { audience = fs.readFileSync(AUDIENCE_FILE, "utf-8"); } catch {}
    return ctx.json({ store: readIdeas(), audience, hasKey: hasCommentKey(), model: roleModel("ideas"), queryModel: roleModel("ideaQueries"), running: running ? ctx.jobSummary(running) : null });
  }
  if (p === "/api/ideas" && req.method === "POST") {
    const b = await ctx.body(req);
    const title = clip(b.title, 200);
    if (!title) return ctx.bad("an idea needs a title");
    const s = readIdeas();
    const idea: Idea = { id: nextIdeaId(s), title, note: clip(b.note, 4000), keywords: clip(b.keywords, 200), status: "new", createdAt: new Date().toISOString() };
    s.ideas.push(idea);
    writeIdeas(s);
    return ctx.json({ ok: true, idea, store: s });
  }

  const m = p.match(/^\/api\/ideas\/(I\d+)(\/research|\/start)?$/);
  if (!m) return ctx.bad("not found", 404);
  const s = readIdeas();
  const idea = s.ideas.find((i) => i.id === m[1]);
  if (!idea) return ctx.bad("no such idea", 404);

  if (!m[2] && req.method === "PUT") {
    const b = await ctx.body(req);
    if (b.title !== undefined) { const t = clip(b.title, 200); if (!t) return ctx.bad("an idea needs a title"); idea.title = t; }
    if (b.note !== undefined) idea.note = clip(b.note, 4000);
    if (b.keywords !== undefined) idea.keywords = clip(b.keywords, 200);
    if (b.status !== undefined) {
      if (!["new", "researched", "dropped"].includes(b.status)) return ctx.bad("bad status");
      idea.status = b.status === "new" && idea.research ? "researched" : b.status;
    }
    writeIdeas(s);
    return ctx.json({ ok: true, store: s });
  }
  if (!m[2] && req.method === "DELETE") {
    s.ideas = s.ideas.filter((i) => i.id !== idea.id);
    writeIdeas(s);
    return ctx.json({ ok: true, store: s });
  }
  if (req.method !== "POST") return ctx.bad("not found", 404);
  if (ctx.runningJob(AN_WS)) return ctx.bad("another analytics or idea job is running", 409);

  if (m[2] === "/research") {
    if (!hasCommentKey()) return ctx.bad("YOUTUBE_API_KEY is missing in .env");
    return ctx.json({ job: ctx.jobSummary(ctx.startJob(AN_WS, "ideas", `Idea check ${idea.id} (${roleModel("ideas")})`, [B("ideas", "--id", idea.id)])) });
  }
  // start a project: the next free VID number + a name, then the idea, angle and packages into its idea.md
  const b = await ctx.body(req);
  const name = clip(b.name, 60).replace(/\s+/g, "_");
  if (!/^[A-Za-z0-9_]+$/.test(name)) return ctx.bad("name: letters, digits and underscores, e.g. Sticky_Prices");
  if (idea.ws) return ctx.bad(`already started as ${idea.ws}`, 409);
  if (idea.status === "dropped") return ctx.bad("restore the idea before starting a project from it", 409);
  const n = Math.max(0, ...workspaces().map((w) => Number(w.match(/^VID(\d+)_/)?.[1] ?? 0))) + 1;
  const ws = `VID${String(n).padStart(2, "0")}_${name}`;
  if (fs.existsSync(path.join(path.dirname(path.dirname(import.meta.dir)), "workspace", ws))) return ctx.bad(`${ws} exists`, 409);
  return ctx.json({ ws, job: ctx.jobSummary(ctx.startJob(AN_WS, "ideas-start", `Start ${ws} from ${idea.id}`, [B("new-video", ws), B("ideas", "--to-workspace", idea.id, ws)])) });
}
