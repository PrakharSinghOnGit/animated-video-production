/**
 * Dashboard routes for the Posted page (workflow/07-publish/posted.ts): where every video and short is posted.
 *
 *   GET /api/posted                                  rows (YouTube from the links + last analytics refresh) + unlinked uploads
 *   PUT /api/posted {ws, short?, platform, status, url?}   mark Instagram / Facebook: none | draft | live
 *   GET /api/posted/frames?ws=<id>[&short=S1]       three frames of the final render as one JPEG (built once, cached)
 * Linking a YouTube upload reuses PUT /api/analytics/link.
 */
import { mapping, readSnapshot, shortIds, shortLinks, workspaces } from "../09-analytics/lib";
import { framesStrip, postedRows, setPosted } from "../07-publish/posted";
import { serveFile } from "./server/files";
import type { AnalyticsCtx } from "./analytics";

export async function postedRoute(req: Request, url: URL, ctx: AnalyticsCtx): Promise<Response | null> {
  if (url.pathname === "/api/posted/frames" && req.method === "GET") {
    const ws = url.searchParams.get("ws") ?? "", short = url.searchParams.get("short");
    if (!workspaces().includes(ws) || (short && !shortIds(ws).includes(short))) return ctx.bad("unknown video", 404);
    const f = await framesStrip(ws, short);
    return f ? serveFile(req, f) : ctx.bad("no final render", 404);
  }
  if (url.pathname !== "/api/posted") return null;
  if (req.method === "GET") {
    const { rows, fetchedAt } = postedRows();
    const m = mapping(), sl = shortLinks();
    const unlinked = (readSnapshot()?.videos ?? []).filter((v) => !m[v.ytId] && !sl[v.ytId])
      .map((v) => ({ ytId: v.ytId, title: v.title, short: v.short, publishedAt: v.publishedAt, privacy: v.privacy ?? null }));
    return ctx.json({ rows, unlinked, fetchedAt });
  }
  if (req.method === "PUT") {
    const b = await ctx.body(req);
    if (typeof b.url === "string" && b.url.trim() && !/^https:\/\/([a-z0-9-]+\.)*(instagram\.com|facebook\.com|fb\.watch)\//i.test(b.url.trim())) return ctx.bad("url: an instagram.com or facebook.com link");
    try { setPosted(String(b.ws ?? ""), b.short ? String(b.short) : "video", b.platform, b.status, typeof b.url === "string" ? b.url : undefined); }
    catch (e) { return ctx.bad((e as Error).message); }
    return ctx.json({ ok: true });
  }
  return null;
}
