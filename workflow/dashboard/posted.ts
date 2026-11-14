/**
 * Dashboard routes for the Posted page (workflow/07-publish/posted.ts): where every video and short is posted.
 *
 *   GET /api/posted                                  rows (YouTube from the links + last analytics refresh) + unlinked uploads
 *   PUT /api/posted {ws, short?, platform, status, url?}   mark Instagram / Facebook: none | draft | live
 * Linking a YouTube upload reuses PUT /api/analytics/link.
 */
import { mapping, readSnapshot, shortLinks } from "../09-analytics/lib";
import { postedRows, setPosted } from "../07-publish/posted";
import type { AnalyticsCtx } from "./analytics";

export async function postedRoute(req: Request, url: URL, ctx: AnalyticsCtx): Promise<Response | null> {
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
