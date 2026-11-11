import { useCallback, useEffect, useState } from "react";
import { BarChart3, Brain, Clapperboard, ExternalLink, FileText, Film, Link2, MessageSquare, PackageOpen, RefreshCw, Unlink, Wrench } from "lucide-react";
import { api } from "@/lib/api";
import { useApp } from "@/hooks/app";
import { ago, money } from "@/lib/utils";
import { fmtTime, int, pct, type AnalyticsData, type CommentsData, type LessonStore } from "@/lib/analytics";
import type { Published } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardSub, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/fields";
import { PageHeader } from "@/components/ui/layout";
import { DataTable, Td } from "@/components/DataTable";
import { JobLog } from "@/components/analytics/JobLog";
import { VideoAnalytics } from "@/components/analytics/VideoAnalytics";

/** A published video's landing page: the upload's numbers (the same analysis as Analytics → this video), its shorts'
 *  numbers, the comments waiting, and the way back into production (script, steps, downloads). Nothing here edits it. */
export function PublishedOverview({ p }: { p: Published }) {
  const { d, ws, go, toast, reloadList } = useApp();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [comments, setComments] = useState<CommentsData | null>(null);
  const [job, setJob] = useState<{ id: string; label: string } | null>(null);

  const load = useCallback(async () => {
    try { const a = await api.analytics(false); setData(a); if (a.running) setJob((j) => j ?? { id: a.running!.id, label: a.running!.label }); } catch (e) { toast((e as Error).message); }
    api.comments().then(setComments).catch(() => {});
  }, [toast]);
  useEffect(() => { void load(); }, [load, ws]);

  const run = async (action: "fetch" | "review" | "comments") => {
    if (action === "review" && !window.confirm(`Review ${ws} with the analytics reviewer? It uses your Claude plan; its lessons wait for your approval.`)) return;
    try { const r = await api.analyticsRun(action, action === "review" ? { video: ws! } : {}); setJob({ id: r.job.id, label: r.job.label }); } catch (e) { toast((e as Error).message); }
  };
  const unlink = async () => {
    if (!window.confirm(`Unlink ${ws} from its upload? It goes back to In progress with the pipeline as its overview.`)) return;
    try { await api.analyticsLink(ws!, null); await reloadList(); } catch (e) { toast((e as Error).message); }
  };
  // a shorts project: unlinking its shorts moves it back to In progress
  const unlinkShorts = async () => {
    if (!window.confirm(`Unlink all ${p.shorts.length} shorts of ${ws} from their uploads? It goes back to In progress.`)) return;
    try { for (const s of p.shorts) if (s.ytId) await api.analyticsLink(ws!, null, s.id); await reloadList(); } catch (e) { toast((e as Error).message); }
  };
  if (!d || !ws) return null;

  const snap = data?.snapshot;
  // a shorts project: no long video; the page is its shorts' numbers
  const only = p.kind === "shorts";
  const v = p.ytId ? snap?.videos.find((x) => x.ytId === p.ytId) : undefined;
  const shortsOf = snap?.videos.filter((x) => x.parent === ws) ?? [];
  const cs = comments?.store ? Object.values(comments.store.comments) : [];
  const mineIds = new Set([p.ytId, ...p.shorts.map((s) => s.ytId)].filter(Boolean) as string[]);
  const myComments = cs.filter((c) => mineIds.has(c.videoId));
  const waiting = myComments.filter((c) => c.status === "todo").length;
  const busy = !!data?.running;
  const prod = (label: string, Icon: typeof FileText, to: Parameters<typeof go>[0]) => <Button size="sm" variant="outline" onClick={() => go({ step: null, act: null, short: null, ...to })}><Icon />{label}</Button>;

  return (
    <div className="mx-auto grid max-w-[1400px] grid-cols-[minmax(0,1fr)] gap-5 px-6 pb-12 pt-6 max-sm:px-4">
      <PageHeader
        eyebrow={<span className="font-mono normal-case tracking-normal">{d.id} · published</span>}
        title={p.title ?? d.title ?? d.id}
        badges={p.thumb ? <img src={p.thumb} alt="" className="h-10 rounded border object-cover max-sm:hidden" /> : undefined}
        sub={<>{p.publishedAt ? `${only ? "First short published" : "Published"} ${new Date(p.publishedAt).toLocaleDateString()}` : "Not in the analytics snapshot yet"}{only ? ` · ${p.shorts.length} short${p.shorts.length === 1 ? "" : "s"}${p.views != null ? `, ${int(p.views)} views in all` : ""}` : ""}{v ? ` · ${fmtTime(v.durationS)}` : ""}{snap ? ` · numbers from ${ago(snap.fetchedAt)}` : ""} · made for {money(d.totals.costUsd)}</>}
        actions={<>
          {p.ytId && <Button variant="outline" asChild><a href={`https://www.youtube.com/watch?v=${p.ytId}`} target="_blank" rel="noreferrer"><ExternalLink />YouTube</a></Button>}
          {p.ytId && <Button variant="outline" asChild><a href={`https://studio.youtube.com/video/${p.ytId}/analytics`} target="_blank" rel="noreferrer"><BarChart3 />Studio</a></Button>}
          <Button disabled={busy || data?.auth.state !== "ok"} onClick={() => run("fetch")} title="Pull fresh numbers for the whole channel (bun run yt:fetch)"><RefreshCw />Refresh</Button>
          {!only && <Button variant="default" disabled={busy || !v} onClick={() => run("review")} title="The analytics reviewer reads this video's numbers, script and plan and proposes lessons"><Brain />Review</Button>}
        </>}
      />
      {job && <JobLog job={job.id} label={job.label} onEnd={() => { void load(); void reloadList(); }} onClose={() => setJob(null)} />}

      {only ? null : !data ? <div className="text-muted-foreground">Loading numbers…</div>
        : !v ? <Card><CardBody className="text-[13px]">This upload ({p.ytId}) isn't in the analytics snapshot yet. {data.auth.state === "ok" ? "Click Refresh to pull it." : "Connect YouTube on the Analytics page first."}</CardBody></Card>
        : <VideoAnalytics embedded data={data} yt={v.ytId} onLessons={(s: LessonStore) => setData((x) => (x ? { ...x, lessons: s } : x))} onReview={() => run("review")} reload={() => void load()} />}
      <div className="grid items-start gap-3.5 @4xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader><Film className="size-4 text-muted-foreground" /><CardTitle>Shorts</CardTitle><CardSub>Link each short to its upload to see its numbers here</CardSub></CardHeader>
          {p.shorts.length ? (
            <DataTable head={[{ label: "Short" }, { label: "Views", right: true }, { label: "Avg viewed", right: true }, { label: "Subs", right: true }]}>
              {p.shorts.map((s) => {
                const sv = shortsOf.find((x) => x.shortId === s.id);
                const item = d.shorts.items.find((x) => x.id === s.id);
                return (
                  <tr key={s.id}>
                    <Td className="min-w-48">
                      <div><b className="font-mono">{s.id}</b> <span>{s.title ?? item?.entry.title ?? "(untitled)"}</span></div>
                      <div className="mt-1">{s.ytId
                        ? <span className="flex flex-wrap gap-1">
                            <Button size="sm" variant="ghost" className="-ml-2" asChild><a href={`https://www.youtube.com/shorts/${s.ytId}`} target="_blank" rel="noreferrer"><ExternalLink />YouTube</a></Button>
                            {sv && <Button size="sm" variant="ghost" onClick={() => go({ view: "analytics", yt: s.ytId })}><BarChart3 />Analytics</Button>}
                          </span>
                        : <LinkShort ws={ws} short={s.id} onDone={() => { void reloadList(); void load(); }} />}
                      </div>
                    </Td>
                    <Td right className="tabular-nums">{s.ytId ? int(sv?.views ?? s.views ?? undefined) : "—"}</Td>
                    <Td right className="tabular-nums">{sv?.avgPct !== undefined ? `${Math.round(sv.avgPct)}%` : "—"}</Td>
                    <Td right className="tabular-nums">{sv?.subsGained ?? "—"}</Td>
                  </tr>
                );
              })}
            </DataTable>
          ) : <CardBody className="text-[13px] text-muted-foreground">No shorts were cut from this video.</CardBody>}
        </Card>

        <div className="grid gap-3.5">
          <Card>
            <CardHeader><MessageSquare className="size-4 text-muted-foreground" /><CardTitle>Comments</CardTitle><CardSub>on this video and its shorts</CardSub></CardHeader>
            <CardBody className="text-[13px]">
              {comments?.store
                ? <span>{myComments.length} comment{myComments.length === 1 ? "" : "s"}{waiting ? <>, <Badge tone="warning">{waiting} waiting on you</Badge></> : ", none waiting"}</span>
                : <span className="text-muted-foreground">Not fetched yet.</span>}
              <div><Button size="sm" variant={waiting ? "default" : "outline"} onClick={() => go({ view: "comments", ws: null, sec: null, step: null, act: null, short: null })}><MessageSquare />Open comments</Button></div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader><Wrench className="size-4 text-muted-foreground" /><CardTitle>Production</CardTitle><CardSub>read-only reference</CardSub></CardHeader>
            <CardBody>
              <div className="flex flex-wrap gap-1.5">
                {!only && prod("Script", FileText, { sec: "video", step: "script" })}
                {!only && prod("Video steps", Clapperboard, { sec: "video" })}
                {prod(only ? "Shorts and brief" : "Shorts", Film, { sec: "shorts" })}
                {!only && prod("Packaging", PackageOpen, { sec: "packaging" })}
                {prod("Downloads & runs", Wrench, { sec: "production" })}
              </div>
              {only ? <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                <span>{p.shorts.length} short{p.shorts.length === 1 ? "" : "s"} linked</span>
                <Button size="sm" variant="ghost" className="ml-auto" onClick={unlinkShorts}><Unlink />Unlink</Button>
              </div> : <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                <span>Linked to <code>{p.ytId}</code>{v?.ctr !== undefined ? ` · CTR ${pct(v.ctr)}` : ""}</span>
                <Button size="sm" variant="ghost" className="ml-auto" onClick={unlink}><Unlink />Unlink</Button>
              </div>}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

export function LinkShort({ ws, short, onDone }: { ws: string; short: string; onDone: () => void }) {
  const { toast } = useApp();
  const [id, setId] = useState("");
  const link = async () => {
    try { const r = await api.analyticsLink(ws, id, short); toast(`${short} linked to ${r.id}`); setId(""); onDone(); } catch (e) { toast((e as Error).message); }
  };
  return (
    <span className="flex max-w-80 gap-1">
      <Input aria-label={`YouTube URL of ${short}`} placeholder="Shorts URL or id" value={id} onChange={(e) => setId(e.target.value)} onKeyDown={(e) => e.key === "Enter" && id.trim() && void link()} className="h-7 min-w-0 flex-1 text-xs" />
      <Button size="sm" disabled={!id.trim()} onClick={link}><Link2 />Link</Button>
    </span>
  );
}
