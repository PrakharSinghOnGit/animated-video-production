import { useCallback, useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { Brain, FlaskConical, GraduationCap, PlugZap, RefreshCw, Unlink } from "lucide-react";
import { api } from "@/lib/api";
import { useApp } from "@/hooks/app";
import { useStored } from "@/lib/storage";
import { ago, cn, money } from "@/lib/utils";
import { fmtTime, int, num, pct, type AnalyticsData, type LessonStore } from "@/lib/analytics";
import type { ModelsData } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardSub, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/fields";
import { PageHeader, Segmented, StatCard } from "@/components/ui/layout";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { DataTable, Td } from "@/components/DataTable";
import { JobLog } from "@/components/analytics/JobLog";
import { Lessons } from "@/components/analytics/Lessons";
import { LinkControl } from "@/components/analytics/LinkControl";
import { FlagRow, VideoAnalytics } from "@/components/analytics/VideoAnalytics";


/** Analytics: the channel (global) or one video (route.yt). Reads only the server's cache; Refresh calls the API. */
export function AnalyticsPage() {
  const { route, go, toast } = useApp();
  const [mock, setMock] = useStored<boolean>("analytics.mock", false);
  const [agent, setAgent] = useStored<string>("analytics.agent", "default");
  const [models, setModels] = useState<ModelsData | null>(null);
  useEffect(() => { api.models().then(setModels).catch(() => {}); }, []);
  const analyticsDefault = models?.roles.find((r) => r.key === "analytics")?.current ?? "claude:sonnet";
  const effective = agent === "default" ? analyticsDefault : agent;
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [job, setJob] = useState<{ id: string; label: string } | null>(null);

  const load = useCallback(async () => {
    try { const d = await api.analytics(mock); setData(d); if (d.running) setJob((j) => j ?? { id: d.running!.id, label: d.running!.label }); }
    catch (e) { toast((e as Error).message); }
  }, [mock, toast]);
  useEffect(() => { void load(); }, [load]);

  const run = async (action: "auth" | "fetch" | "mock" | "review" | "learn", extra: { video?: string } = {}) => {
    if (action === "review" && /^(claude|opus|sonnet|haiku)/.test(effective) && !window.confirm(`Run the analytics reviewer with ${effective}? It uses your Claude plan. Its lessons wait for your approval.`)) return;
    try {
      const r = await api.analyticsRun(action, { ...extra, agent, mock: action === "review" ? mock : undefined });
      setJob({ id: r.job.id, label: r.job.label });
      if (action === "mock") setMock(true);
    } catch (e) { toast((e as Error).message); }
  };
  const onLessons = (s: LessonStore) => setData((d) => (d ? { ...d, lessons: s } : d));

  if (!data) return <div className="p-6 text-muted-foreground">Loading analytics…</div>;
  const snap = data.snapshot;
  const header = (
    <PageHeader
      title="Analytics"
      info="Weak numbers point at the prompt that made them: low CTR → thumbnails and titles, a weak opening → the script's hook, an act losing viewers → that act. The reviewer proposes lessons; nothing changes a prompt until you approve it."
      badges={<>{snap && <span className="text-[15px] font-normal text-muted-foreground">{snap.channel.title}</span>}{data.mock && <Badge tone="warning">Mock data</Badge>}</>}
      sub={snap ? <>Cached {ago(snap.fetchedAt)} · {snap.quota.calls} API calls · {snap.quota.dataApiUnits} of 10,000 daily quota units</> : "Not connected yet"}
      actions={<>
        {(data.mockAvailable || data.mock) && (
          <Segmented label="Data source" value={mock ? "mock" : "real"} onChange={(v) => setMock(v === "mock")} options={[{ value: "real", label: "Real" }, { value: "mock", label: "Mock" }]} />
        )}
        {data.auth.state === "ok"
          ? <Button disabled={!!data.running} onClick={() => run("fetch")}><RefreshCw />Refresh</Button>
          : data.auth.state !== "no-client" && <Button variant="default" disabled={!!data.running} onClick={() => run("auth")}><PlugZap />{data.auth.state === "expired" ? "Reconnect" : "Connect YouTube"}</Button>}
        <Button disabled={!!data.running} onClick={() => run("learn")} title="Pull general rules out of every act's review notes (each note is read once; cheap model, Settings → Agent models → Lessons from fix notes). A rule that comes up on 2 acts is proposed below. Fix with notes does this by itself."><GraduationCap />Learn from notes</Button>
        <div className="flex items-center">
          <NativeSelect aria-label="Reviewer model" value={agent} onChange={(e) => setAgent(e.target.value)} className="w-auto rounded-r-none border-r-0 text-xs">
            <option value="default">Default ({analyticsDefault})</option>
            {models && (Object.entries(models.providers) as [string, ModelsData["providers"]["claude"]][]).filter(([, p]) => p.ok).map(([k, p]) => (
              <optgroup key={k} label={p.label}>{p.models.filter((m) => m.tools !== false).map((m) => <option key={m.id} value={`${k}:${m.id}`}>{m.label}{m.free ? " · free" : ""}</option>)}</optgroup>
            ))}
          </NativeSelect>
          <Button variant="default" className="rounded-l-none" disabled={!snap || !!data.running} onClick={() => run("review")}><Brain />Run reviewer</Button>
        </div>
      </>}
    />
  );

  return (
    <div className="mx-auto grid max-w-[1400px] gap-5 px-6 pb-12 pt-6 max-sm:px-4">
      {header}
      {job && <JobLog job={job.id} label={job.label} onEnd={() => void load()} onClose={() => setJob(null)} />}
      <Connection data={data} onMock={() => run("mock")} />
      {snap && route.yt
        ? <div className="-m-4"><VideoAnalytics data={data} yt={route.yt} onLessons={onLessons} onReview={(v) => run("review", { video: v })} reload={() => void load()} /></div>
        : snap && <Channel data={data} onLessons={onLessons} reload={() => void load()} open={(yt) => go({ yt })} />}
    </div>
  );
}

function Connection({ data, onMock }: { data: AnalyticsData; onMock: () => void }) {
  const a = data.auth;
  if (a.state === "ok" && (data.snapshot || data.mock)) return data.snapshot?.reach.status !== "ok" && !data.mock && data.snapshot
    ? <Card><CardBody className="text-[13px]"><span><b>Impressions and CTR:</b> {data.snapshot.reach.note}. YouTube only offers them through daily bulk reports; until they arrive, packaging (thumbnail/title) cannot be judged.</span></CardBody></Card>
    : data.snapshot?.errors.length && !data.mock ? <Card><CardBody className="text-[12.5px] text-warning">{data.snapshot.errors.slice(0, 4).map((e, i) => <span key={i}>⚠ {e}</span>)}</CardBody></Card> : null;
  return (
    <Card>
      <CardHeader><CardTitle>{a.state === "ok" ? "Connected: fetch the first snapshot" : a.state === "expired" ? "YouTube sign-in expired" : a.state === "no-token" ? "Connect YouTube" : "OAuth client missing"}</CardTitle></CardHeader>
      <CardBody className="text-[13px]">
        {a.state === "no-client" && <span>Put the Desktop OAuth client JSON from Google Cloud at the repo root as <code>youtube_client.json</code> (gitignored).</span>}
        {a.state === "no-token" && <ol className="m-0 grid list-decimal gap-1 pl-5">
          <li>Click <b>Connect YouTube</b>: a Google page opens on this Mac (or run <code>bun run yt:auth</code>).</li>
          <li>Choose the account that owns the channel. If the channel is a Brand Account, pick the channel itself.</li>
          <li>"Google hasn't verified this app" is expected for your own Testing app: <b>Continue</b>. Access is read-only.</li>
          <li>Then <b>Refresh</b>. The first refresh also starts YouTube's daily impressions/CTR reports (they begin 1–2 days later).</li>
        </ol>}
        {a.state === "expired" && <span>{a.error}. Testing-mode apps get 7-day tokens: click <b>Reconnect</b>, or publish the consent screen to Production in Google Cloud to stop this.</span>}
        {a.state === "ok" && <span>Click <b>Refresh</b> to pull the channel's numbers.</span>}
        {!data.mock && <div><Button size="sm" variant="outline" onClick={onMock}><FlaskConical />Try it with mock data</Button></div>}
      </CardBody>
    </Card>
  );
}

function Channel({ data, onLessons, reload, open }: { data: AnalyticsData; onLessons: (s: LessonStore) => void; reload: () => void; open: (yt: string) => void }) {
  const { toast } = useApp();
  const snap = data.snapshot!, dx = data.diagnosis!, b = dx.baseline;
  const [showShorts, setShowShorts] = useStored<boolean>("analytics.shorts", false);
  const last28 = snap.daily.slice(-28);
  const sum = (k: "views" | "minutes" | "subsNet") => last28.reduce((a, d) => a + d[k], 0);
  const chart = useMemo(() => snap.daily.map((d) => ({ day: d.day, views: d.views })), [snap]);
  const cfg: ChartConfig = { views: { label: "Views", color: "var(--chart-2)" } };
  const videos = snap.videos.filter((v) => showShorts || !v.short);
  const linked = data.workspaces.filter((w) => w.ytId);
  const review = data.reviews[0];
  const problems = Object.values(dx.videos).flatMap((v) => v.flags.filter((f) => f.kind === "problem").map((f) => ({ ...f, v })));
  const byArea = Object.entries(problems.reduce<Record<string, number>>((a, f) => ({ ...a, [f.area]: (a[f.area] ?? 0) + 1 }), {})).sort((p, q) => q[1] - p[1]);
  const kpi = (label: string, value: string, sub?: string) => <StatCard label={label} value={value} hint={sub} />;
  const unlink = async (ws: string) => {
    if (!window.confirm(`Unlink ${ws} from its YouTube video?`)) return;
    try { await api.analyticsLink(ws, null); reload(); } catch (e) { toast((e as Error).message); }
  };

  return (
    <>
      <div className="wg-stagger grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {kpi("Subscribers", int(snap.channel.subs), `${sum("subsNet") >= 0 ? "+" : ""}${sum("subsNet")} in 28 days`)}
        {kpi("Views, 28 days", int(sum("views")))}
        {kpi("Watch hours, 28 days", int(sum("minutes") / 60))}
        {kpi("Median CTR", pct(b.ctr), b.n < 3 ? `${b.n} long video(s): too few for a baseline` : `over ${b.n} long videos`)}
        {kpi("Median avg viewed", pct(b.avgPct, 0))}
        {kpi("Linked to workspaces", `${linked.length}/${data.workspaces.length}`)}
      </div>

      <Card>
        <CardHeader><CardTitle>Daily views</CardTitle><CardSub>Last 90 days, whole channel</CardSub></CardHeader>
        <CardBody>
          <ChartContainer config={cfg} className="aspect-auto h-52 w-full">
            <AreaChart data={chart} margin={{ left: -12, right: 8, top: 4, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="2 4" />
              <XAxis dataKey="day" tickFormatter={(d) => d.slice(5)} tickLine={false} axisLine={false} minTickGap={32} />
              <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(x) => int(x)} />
              <Tooltip cursor={{ stroke: "var(--border)" }} formatter={(x) => [Number(x).toLocaleString(), "views"]} labelFormatter={(d) => new Date(String(d)).toDateString()} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }} />
              <Area dataKey="views" type="monotone" stroke="var(--color-views)" strokeWidth={2} fill="var(--color-views)" fillOpacity={0.12} isAnimationActive={false} />
            </AreaChart>
          </ChartContainer>
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="flex-wrap">
          <CardTitle>Videos</CardTitle>
          <CardSub>Click a row for its retention curve, acts and diagnosis</CardSub>
          <label className="ml-auto flex items-center gap-1.5 text-[12px] text-muted-foreground"><input type="checkbox" checked={showShorts} onChange={(e) => setShowShorts(e.target.checked)} />Show shorts</label>
        </CardHeader>
        <DataTable head={[{ label: "Video" }, { label: "Published" }, { label: "Length", right: true }, { label: "Views", right: true }, { label: "CTR", right: true }, { label: "Avg viewed", right: true }, { label: "At 0:30", right: true }, { label: "Opening", right: true }, { label: "Subs/1k", right: true }, { label: "Diagnosis" }]}>
          {videos.map((v) => {
            const d = dx.videos[v.ytId], m = d.metrics;
            const pr = d.flags.filter((f) => f.kind === "problem"), st = d.flags.filter((f) => f.kind === "strength");
            const low = (x?: number, base?: number) => b.n >= 3 && x !== undefined && base !== undefined && Number.isFinite(base) && x < base * 0.85;
            return (
              <tr key={v.ytId} onClick={() => open(v.ytId)} className="cursor-pointer hover:bg-accent/50" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && open(v.ytId)}>
                <Td className="min-w-56"><div className="font-medium">{v.title}</div><div className="flex gap-1 pt-0.5">{v.ws ? <Badge>{v.ws}</Badge> : <span className="text-[11px] text-muted-foreground">not linked</span>}{v.short && <Badge>short</Badge>}</div></Td>
                <Td className="whitespace-nowrap">{new Date(v.publishedAt).toLocaleDateString()}</Td>
                <Td right className="tabular-nums">{fmtTime(v.durationS)}</Td>
                <Td right className="tabular-nums">{int(v.views)}</Td>
                <Td right className={cn("tabular-nums", low(m.ctr, b.ctr) && "text-warning")}>{pct(m.ctr)}</Td>
                <Td right className={cn("tabular-nums", low(m.avgPct, b.avgPct) && "text-warning")}>{pct(m.avgPct, 0)}</Td>
                <Td right className={cn("tabular-nums", low(m.ret30, b.ret30) && "text-warning")}>{pct(m.ret30, 0)}</Td>
                <Td right className={cn("tabular-nums", m.relEarly !== undefined && m.relEarly < 0.4 && "text-warning")}>{num(m.relEarly, 2)}</Td>
                <Td right className="tabular-nums">{num(m.subsPer1k)}</Td>
                <Td><div className="flex flex-wrap gap-1">{pr.length > 0 && <Badge tone={pr.some((f) => f.severity >= 3) ? "danger" : "warning"}>{pr.length} issue{pr.length > 1 ? "s" : ""}: {[...new Set(pr.map((f) => f.area))].join(", ")}</Badge>}{st.length > 0 && <Badge tone="success">{st.length} strength{st.length > 1 ? "s" : ""}</Badge>}</div></Td>
              </tr>
            );
          })}
        </DataTable>
      </Card>

      <div className="grid gap-3.5 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Where the channel is weakest</CardTitle><CardSub>Problems found across all videos, by area</CardSub></CardHeader>
          <CardBody>
            {byArea.length ? <div className="flex flex-wrap gap-1.5">{byArea.map(([a, n]) => <Badge key={a} tone="warning">{a}: {n}</Badge>)}</div> : <p className="m-0 text-muted-foreground">No problems flagged.</p>}
            <ul className="m-0 grid list-none gap-2.5 p-0 text-[13px]">{problems.sort((p, q) => q.severity - p.severity).slice(0, 5).map((f, i) => <FlagRow key={i} f={{ ...f, text: `${f.v.ws ?? snap.videos.find((x) => x.ytId === f.v.ytId)?.title}: ${f.text}` }} />)}</ul>
          </CardBody>
        </Card>
        <Card>
          <CardHeader className="flex-wrap"><CardTitle>Latest review</CardTitle>{review && <CardSub>{review.agent} · {ago(review.at)}{review.costUsd ? ` · ${money(review.costUsd)}` : ""}{review.video ? ` · ${review.video}` : ""}{review.mock ? " · mock" : ""}</CardSub>}</CardHeader>
          <CardBody className="text-[13px]">
            {review ? <>
              <p className="m-0">{review.summary}</p>
              {(review.findings ?? []).length > 0 && <details><summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">Findings ({review.findings!.length})</summary><ul className="m-0 mt-1 grid list-disc gap-1 pl-5 marker:text-subtle-foreground">{review.findings!.map((f, i) => <li key={i}><b>{f.video}</b> [{f.kind}/{f.area}]: {f.finding}</li>)}</ul></details>}
              {(review.watch ?? []).length > 0 && <div><div className="text-xs font-medium text-muted-foreground">Watch on the next upload</div><ul className="m-0 mt-1 grid list-disc gap-1 pl-5 marker:text-subtle-foreground">{review.watch!.map((w, i) => <li key={i}>{w}</li>)}</ul></div>}
            </> : <p className="m-0 text-muted-foreground">No review yet. Pick a model above and click Run reviewer.</p>}
          </CardBody>
        </Card>
      </div>

      <Lessons store={data.lessons} cap={data.cap} targetInfo={data.targetInfo} reviews={data.reviews} onChange={onLessons} />

      <Card>
        <CardHeader><CardTitle>Link workspaces to uploads</CardTitle><CardSub>Paste the YouTube URL once a video is live; linking takes effect immediately</CardSub></CardHeader>
        <CardBody>
          <LinkControl data={data} onDone={reload} />
          {linked.length > 0 && <ul className="m-0 grid gap-1 pl-0 text-[13px]">{linked.map((w) => (
            <li key={w.id} className="flex items-center gap-2"><Badge>{w.id}</Badge><code className="text-muted-foreground">{w.ytId}</code>
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => unlink(w.id)}><Unlink />Unlink</Button></li>
          ))}</ul>}
        </CardBody>
      </Card>
    </>
  );
}
