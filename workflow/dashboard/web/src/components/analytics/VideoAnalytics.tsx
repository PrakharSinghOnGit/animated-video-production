import { useMemo } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ReferenceArea, ReferenceDot, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ArrowLeft, Brain, CheckCircle2, ExternalLink, Info } from "lucide-react";
import { useApp } from "@/hooks/app";
import { cn } from "@/lib/utils";
import { TRAFFIC, fmtTime, int, num, pct, type AnalyticsData, type Flag, type LessonStore } from "@/lib/analytics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardSub, CardTitle } from "@/components/ui/card";
import { ChartContainer, type ChartConfig, useFade, ENTER } from "@/components/ui/chart";
import { DataTable, Td } from "@/components/DataTable";
import { Lessons } from "./Lessons";
import { LinkControl } from "./LinkControl";

export function FlagRow({ f }: { f: Flag }) {
  const Icon = f.kind === "problem" ? AlertTriangle : f.kind === "strength" ? CheckCircle2 : Info;
  return (
    <li className="flex gap-2">
      <Icon className={cn("mt-0.5 size-4 shrink-0", f.kind === "problem" ? (f.severity >= 3 ? "text-destructive" : "text-warning") : f.kind === "strength" ? "text-success" : "text-muted-foreground")} aria-label={f.kind} />
      <div className="min-w-0">
        <span>{f.text}</span>
        <div className="mt-0.5 flex flex-wrap gap-1 text-[11px] text-muted-foreground">
          <span className="uppercase tracking-wide">{f.kind} · {f.area}</span>
          {f.targets.length > 0 && <span>→ {f.targets.map((t) => `${t}.md`).join(", ")}</span>}
          {f.basis && <span>· basis: {f.basis}</span>}
        </div>
      </div>
    </li>
  );
}

function Tile({ label, value, base, better }: { label: string; value: string; base?: string; better?: boolean | null }) {
  return (
    <div className="rounded-[10px] border bg-card px-4 py-3 shadow-sm">
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-[18px] font-semibold tracking-[-0.02em] tabular-nums">{value}</div>
      {base && <div className={cn("text-[11.5px]", better === true ? "text-success" : better === false ? "text-warning" : "text-muted-foreground")}>{better === true ? "▲ " : better === false ? "▼ " : ""}channel median {base}</div>}
    </div>
  );
}
const cmp = (a?: number, b?: number) => (a === undefined || b === undefined || !Number.isFinite(a) || !Number.isFinite(b) ? null : a >= b);

/** `embedded`: inside a published video's page, which has its own header (no back button, title or actions here). */
export function VideoAnalytics({ data, yt, onLessons, onReview, reload, embedded }: { data: AnalyticsData; yt: string; onLessons: (s: LessonStore) => void; onReview: (video: string) => void; reload: () => void; embedded?: boolean }) {
  const { go } = useApp();
  const snap = data.snapshot!;
  const v = snap.videos.find((x) => x.ytId === yt);
  const d = data.diagnosis?.videos[yt];
  const b = data.diagnosis?.baseline;
  const acts = v?.ws ? data.acts[v.ws] ?? [] : [];

  const series = useMemo(() => (v?.retention ?? []).map((p) => ({ s: Math.round(p.r * (v?.durationS ?? 0)), watch: +(p.watch * 100).toFixed(1), rel: p.rel !== undefined ? +p.rel.toFixed(3) : undefined })), [v]);
  const watchFade = useFade("var(--color-watch)"), relFade = useFade("var(--color-rel)");
  if (!v || !d) return <div className="p-6 text-muted-foreground">This video is not in the snapshot. <Button variant="ghost" onClick={() => go({ yt: null })}>Back</Button></div>;
  const m = d.metrics;
  const actAt = (s: number) => acts.find((a) => s >= a.startMs / 1000 && s < a.endMs / 1000);
  const ret: ChartConfig = { watch: { label: "Still watching", color: "var(--chart-2)" } };
  const rel: ChartConfig = { rel: { label: "Relative retention", color: "var(--chart-1)" } };
  const yMax = Math.max(100, ...series.map((p) => p.watch));
  const traffic = (v.traffic ?? []).slice(0, 8).map((t) => ({ name: TRAFFIC[t.source] ?? t.source, views: t.views }));
  const mentions = (l: { evidence: { video: string }[] }) => l.evidence.some((e) => e.video === v.ytId || (!!v.ws && e.video === v.ws));

  const Tip = ({ active, payload }: { active?: boolean; payload?: { payload: { s: number; watch: number; rel?: number } }[] }) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload, a = actAt(p.s);
    return (
      <div className="grid gap-0.5 rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-xl">
        <b>{fmtTime(p.s)}{a ? ` · ${a.id} ${a.title}` : ""}</b>
        <span>{p.watch}% still watching</span>
        {p.rel !== undefined && <span className="text-muted-foreground">relative to similar videos: {p.rel.toFixed(2)} (0.5 = typical)</span>}
      </div>
    );
  };

  return (
    <div className={cn("grid grid-cols-[minmax(0,1fr)] gap-5", !embedded && "p-4 pb-10")}>
      {!embedded && <div className="flex flex-wrap items-start gap-3">
        <Button variant="ghost" size="sm" onClick={() => go({ yt: null })}><ArrowLeft />All videos</Button>
        {v.thumb && <img src={v.thumb} alt="" className="h-16 rounded border object-cover max-sm:hidden" />}
        <div className="min-w-0 flex-1 basis-64">
          <h1 className="m-0 text-[20px] font-semibold leading-tight tracking-[-0.02em]">{v.title}</h1>
          <p className="m-0 mt-1 text-muted-foreground">
            Published {new Date(v.publishedAt).toLocaleDateString()} · {fmtTime(v.durationS)} · {int(v.views)} views
            {v.ws && <> · <button className="text-brand underline-offset-2 hover:underline" onClick={() => go({ view: "ws", ws: v.ws!, sec: null, step: null, act: null, short: null, yt: null })}>{v.ws}</button></>}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button variant="outline" size="sm" asChild><a href={`https://studio.youtube.com/video/${v.ytId}/analytics`} target="_blank" rel="noreferrer"><ExternalLink />Studio</a></Button>
          <Button size="sm" variant="default" onClick={() => onReview(v.ws ?? v.ytId)}><Brain />Review this video</Button>
        </div>
      </div>}

      {!v.ws && !v.short && <Card><CardBody><span>Link this upload to its workspace to see act boundaries, the words at each drop, and to let the reviewer read its script and plan.</span><LinkControl data={data} fixedYt={v.ytId} onDone={reload} /></CardBody></Card>}

      <div className="grid grid-cols-2 gap-2 @2xl:grid-cols-3 @5xl:grid-cols-6">
        <Tile label="CTR" value={pct(m.ctr)} base={b && b.n >= 3 ? pct(b.ctr) : undefined} better={b && b.n >= 3 ? cmp(m.ctr, b.ctr) : null} />
        <Tile label="Impressions" value={int(m.impressions)} />
        <Tile label="Avg viewed" value={pct(m.avgPct, 0)} base={b && b.n >= 3 ? pct(b.avgPct, 0) : undefined} better={b && b.n >= 3 ? cmp(m.avgPct, b.avgPct) : null} />
        <Tile label="Watching at 0:30" value={pct(m.ret30, 0)} base={b && b.n >= 3 ? pct(b.ret30, 0) : undefined} better={b && b.n >= 3 ? cmp(m.ret30, b.ret30) : null} />
        <Tile label="Opening vs similar" value={num(m.relEarly, 2)} base="0.50 typical" better={cmp(m.relEarly, 0.5)} />
        <Tile label="Net subs / 1k views" value={num(m.subsPer1k)} base={b && b.n >= 3 ? num(b.subsPer1k) : undefined} better={b && b.n >= 3 ? cmp(m.subsPer1k, b.subsPer1k) : null} />
      </div>

      <Card>
        <CardHeader><CardTitle>Audience retention</CardTitle><CardSub>% of viewers still watching at each moment{acts.length ? "; shaded bands are the plan's acts, dots are the sharpest drops" : ""}</CardSub></CardHeader>
        <CardBody>
          {series.length ? (
            <ChartContainer config={ret} className="aspect-auto h-72 w-full">
              <AreaChart data={series} margin={{ left: 0, right: 8, top: 18, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="2 4" />
                {acts.map((a, i) => i % 2 === 1 && <ReferenceArea key={`b${a.id}`} x1={a.startMs / 1000} x2={Math.min(a.endMs / 1000, v.durationS)} fill="var(--muted-foreground)" fillOpacity={0.06} strokeOpacity={0} />)}
                {acts.map((a) => <ReferenceLine key={a.id} x={a.startMs / 1000} stroke="var(--border)" label={{ value: a.id, position: "insideTopLeft", fontSize: 10, fill: "var(--muted-foreground)", dy: -16 }} />)}
                <XAxis dataKey="s" type="number" domain={[0, v.durationS]} tickFormatter={fmtTime} tickLine={false} axisLine={false} minTickGap={28} />
                <YAxis domain={[0, Math.ceil(yMax / 10) * 10]} tickFormatter={(x) => `${x}%`} tickLine={false} axisLine={false} width={48} />
                <Tooltip content={<Tip />} cursor={{ stroke: "var(--border)" }} />
                {watchFade[0]}<Area dataKey="watch" type="monotone" stroke="var(--color-watch)" strokeWidth={2} fill={watchFade[1]} fillOpacity={1} {...ENTER} />
                {d.dips.map((p, i) => { const pt = series.reduce((a, q) => (Math.abs(q.s - p.s) < Math.abs(a.s - p.s) ? q : a), series[0]); return <ReferenceDot key={i} x={pt.s} y={pt.watch} r={5} fill="var(--destructive)" stroke="var(--card)" strokeWidth={2} />; })}
              </AreaChart>
            </ChartContainer>
          ) : <p className="m-0 text-muted-foreground">No retention curve yet (YouTube needs some views; refresh later).</p>}
          {series.some((p) => p.rel !== undefined) && (
            <>
              <span className="text-[12px] text-muted-foreground">Relative retention: how this moment compares with YouTube videos of similar length (0.5 = typical, higher is better)</span>
              <ChartContainer config={rel} className="aspect-auto h-28 w-full">
                <AreaChart data={series} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="2 4" />
                  <XAxis dataKey="s" type="number" domain={[0, v.durationS]} tickFormatter={fmtTime} tickLine={false} axisLine={false} minTickGap={28} />
                  <YAxis domain={[0, 1]} ticks={[0, 0.5, 1]} tickLine={false} axisLine={false} width={48} />
                  <ReferenceLine y={0.5} stroke="var(--muted-foreground)" strokeDasharray="3 3" />
                  <Tooltip content={<Tip />} cursor={{ stroke: "var(--border)" }} />
                  {relFade[0]}<Area dataKey="rel" type="monotone" stroke="var(--color-rel)" strokeWidth={2} fill={relFade[1]} fillOpacity={1} {...ENTER} />
                </AreaChart>
              </ChartContainer>
            </>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-3.5 @4xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Diagnosis</CardTitle><CardSub>Computed from the numbers; the reviewer explains the causes</CardSub></CardHeader>
          <CardBody>{d.flags.length ? <ul className="m-0 grid list-none gap-2.5 p-0 text-[13px]">{d.flags.map((f, i) => <FlagRow key={i} f={f} />)}</ul> : <p className="m-0 text-muted-foreground">Nothing stands out against the baselines.</p>}</CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>Traffic sources</CardTitle><CardSub>Views by where viewers found it</CardSub></CardHeader>
          <CardBody>
            {traffic.length ? (
              <ChartContainer config={{ views: { label: "Views", color: "var(--chart-1)" } }} className="aspect-auto w-full" style={{ height: 28 * traffic.length + 20 }}>
                <BarChart data={traffic} layout="vertical" margin={{ left: 8, right: 44, top: 0, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={120} />
                  <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.4 }} formatter={(x) => [Number(x).toLocaleString(), "views"]} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }} />
                  <Bar dataKey="views" fill="var(--color-views)" radius={[0, 4, 4, 0]} barSize={14} {...ENTER} label={{ position: "right", fontSize: 11, fill: "var(--muted-foreground)", formatter: (x: unknown) => int(Number(x)) }} />
                </BarChart>
              </ChartContainer>
            ) : <p className="m-0 text-muted-foreground">No traffic data yet.</p>}
          </CardBody>
        </Card>
      </div>

      {d.acts.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Acts</CardTitle><CardSub>Viewers lost per act (from 0:30; the opening is judged as the hook)</CardSub></CardHeader>
          <DataTable head={[{ label: "Act" }, { label: "Time" }, { label: "Start → end", right: true }, { label: "Lost / min", right: true }, { label: "Rel.", right: true }, { label: "" }]}>
            {d.acts.map((a) => {
              const f = d.flags.find((x) => x.at?.act === a.id && x.area === "act");
              return (
                <tr key={a.id}>
                  <Td><b className="font-mono">{a.id}</b> {a.title}</Td>
                  <Td className="whitespace-nowrap tabular-nums">{fmtTime(a.startS)}–{fmtTime(a.endS)}</Td>
                  <Td right className="tabular-nums">{pct(a.startWatch, 0)} → {pct(a.endWatch, 0)}</Td>
                  <Td right className="tabular-nums">{pct(a.lossPerMin)}</Td>
                  <Td right className="tabular-nums">{num(a.rel, 2)}</Td>
                  <Td>{f && <Badge tone={f.kind === "problem" ? "warning" : "success"}>{f.kind === "problem" ? "losing viewers" : "gaining"}</Badge>}</Td>
                </tr>
              );
            })}
          </DataTable>
        </Card>
      )}

      {d.dips.some((p) => p.words) && (
        <Card>
          <CardHeader><CardTitle>What was said at each drop</CardTitle></CardHeader>
          <CardBody><ul className="m-0 grid list-disc gap-1.5 pl-5 text-[13px] marker:text-subtle-foreground">{d.dips.filter((p) => p.words).sort((p, q) => p.s - q.s).map((p, i) => <li key={i}><b className="tabular-nums">{fmtTime(p.s)}</b>{p.act ? ` (${p.act})` : ""}, −{pct(p.drop, 1)}: “{p.words}”</li>)}</ul></CardBody>
        </Card>
      )}

      {data.lessons.lessons.some(mentions) && (embedded
        ? <Card><CardBody className="flex-row flex-wrap items-center gap-2 text-[13px]"><span>{data.lessons.lessons.filter((l) => mentions(l) && l.status === "proposed").length} proposed lesson(s) cite this video.</span><Button size="sm" variant="outline" onClick={() => go({ view: "analytics", yt: v.ytId })}>Review them in Analytics</Button></CardBody></Card>
        : <Lessons store={data.lessons} cap={data.cap} targetInfo={data.targetInfo} reviews={data.reviews} onChange={onLessons} only={mentions} />)}
    </div>
  );
}
