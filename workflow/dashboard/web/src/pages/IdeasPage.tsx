import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Check, CircleHelp, Compass, Lightbulb, Pencil, Plus, Radar, Rocket, Search, SpellCheck, Trash2, TriangleAlert, Undo2, X } from "lucide-react";
import { api } from "@/lib/api";
import { useApp } from "@/hooks/app";
import { useStored } from "@/lib/storage";
import { ago, cn, money } from "@/lib/utils";
import { fmtTime, int, type Idea, type IdeasData, type TitleLint, type WatchEntry, type WatchScan } from "@/lib/analytics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardSub, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/fields";
import { EmptyState, PageHeader, Segmented } from "@/components/ui/layout";
import { Fold } from "@/components/ui/collapsible";
import { Markdown } from "@/components/ui/markdown";
import { DataTable, Td } from "@/components/DataTable";
import { JobLog } from "@/components/analytics/JobLog";

type Filter = "open" | "started" | "dropped" | "all";
const VERDICT = { make: "success", rework: "warning", drop: "danger" } as const;
const DEMAND = { high: "success", medium: "info", low: "warning", unclear: "neutral" } as const;
const lintTone = (n: number) => (n >= 80 ? "success" : n >= 60 ? "warning" : "danger") as "success" | "warning" | "danger";

/** Ideas: the bank of video ideas before any project exists. Check one (YouTube search + a model against AUDIENCE.md),
 *  then start a project from it: its idea, angle and package candidates land in the new video's idea.md. */
export function IdeasPage() {
  const { toast, go, reloadList } = useApp();
  const [data, setData] = useState<IdeasData | null>(null);
  const [job, setJob] = useState<{ id: string; label: string; ws?: string } | null>(null);
  const [filter, setFilter] = useStored<Filter>("ideas.filter", "open");

  const load = useCallback(async () => {
    try { const d = await api.ideas(); setData(d); if (d.running && (d.running.step === "ideas" || d.running.step === "ideas-start")) setJob((j) => j ?? { id: d.running!.id, label: d.running!.label }); }
    catch (e) { toast((e as Error).message); }
  }, [toast]);
  useEffect(() => { void load(); }, [load]);

  const setStore = (store: IdeasData["store"]) => setData((d) => (d ? { ...d, store } : d));
  const discover = async (focus: string, check: number, watchlist: boolean) => {
    try { const r = await api.ideaDiscover(focus, check, watchlist); setJob({ id: r.job.id, label: r.job.label }); } catch (e) { toast((e as Error).message); }
  };
  const research = async (i: Idea) => {
    try { const r = await api.ideaResearch(i.id); setJob({ id: r.job.id, label: r.job.label }); } catch (e) { toast((e as Error).message); }
  };
  // no name asked: the project starts untitled and the naming model names it from the idea when the job ends
  const start = async (i: Idea) => {
    if (!window.confirm(`Start a video project from ${i.id} "${i.title}"? It gets the next number and a name from the idea.`)) return;
    try { const r = await api.ideaStart(i.id); setJob({ id: r.job.id, label: r.job.label, ws: r.ws }); } catch (e) { toast((e as Error).message); }
  };
  const onEnd = async () => {
    await load();
    if (job?.ws) { await reloadList(); toast(`${job.ws} created with the idea in its script step; naming it from the idea…`); setTimeout(() => { void load(); void reloadList(); }, 15000); }
  };

  if (!data) return <div className="p-6 text-muted-foreground">Loading ideas…</div>;
  // newest first; ideas found in one Find run share a time and are shown by rank
  const ideas = [...data.store.ideas].reverse().sort((a, b) => b.createdAt.localeCompare(a.createdAt) || (a.found?.rank ?? 99) - (b.found?.rank ?? 99));
  const shown = ideas.filter((i) => filter === "all" || (filter === "open" ? i.status === "new" || i.status === "researched" : i.status === filter));
  const busy = !!data.running;

  return (
    <div className="mx-auto grid max-w-[1400px] grid-cols-[minmax(0,1fr)] gap-5 px-6 pb-12 pt-6 max-sm:px-4">
      <PageHeader
        title="Ideas"
        info={<>Check an idea before it becomes a project. <b>Check</b> searches YouTube twice for recent videos on the topic and scores each against its channel's normal reach (views ÷ the median of the channel's recent uploads of the same format, the yt-viral method; ~250 of 10,000 daily quota units). Then {data.model} judges the idea against the audience brief and your channel's numbers, writes about 8 title + thumbnail packages, lints them with the yt-package title checker and keeps the 3 best (~$0.10–0.20). <b>Start project</b> creates the video with the idea, angle and packages in its script step and names it from the idea.</>}
        sub={<>{data.store.ideas.length} ideas · checks by {data.model} · search words by {data.queryModel}</>}
      />
      {job && <JobLog job={job.id} label={job.label} onEnd={() => void onEnd()} onClose={() => setJob(null)} />}
      {!data.hasKey && <Card><CardBody className="text-[13px] text-warning">Add <code>YOUTUBE_API_KEY</code> to <code>.env</code> to check ideas (the same read-only key as Comments).</CardBody></Card>}

      <FindIdeas onRun={discover} disabled={!data.hasKey || busy} channels={data.watchlist.length} />
      <NicheRadar watchlist={data.watchlist} scan={data.lastScan} disabled={!data.hasKey || busy}
        onWatchlist={(watchlist) => setData((d) => (d ? { ...d, watchlist } : d))}
        onScan={async (days, min) => { try { const r = await api.watchlistScan(days, min); setJob({ id: r.job.id, label: r.job.label }); } catch (e) { toast((e as Error).message); } }} />
      <div className="grid items-start gap-3.5 @4xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <AddIdea onAdded={(store, idea, check) => { setStore(store); if (check) void research(idea); }} canCheck={data.hasKey && !busy} />
        <div className="grid gap-3.5">
        <Card>
          <Fold className="px-4" title={<span className="flex items-center gap-2 text-[13px] font-semibold"><CircleHelp className="size-4 text-muted-foreground" />Audience brief: what every idea is checked against</span>}>
            <div className="max-h-[420px] overflow-y-auto pb-4 text-[13px]"><Markdown>{data.audience || "workflow/01-ideation/AUDIENCE.md is missing."}</Markdown></div>
          </Fold>
          <div className="border-t px-4 py-2 text-[12px] text-muted-foreground">Edit <code>workflow/01-ideation/AUDIENCE.md</code> as you learn who watches.</div>
        </Card>
        <TitleCheck />
        </div>
      </div>

      <Segmented label="Show" value={filter} onChange={setFilter} className="justify-self-start" options={[
        { value: "open", label: `Open (${ideas.filter((i) => i.status === "new" || i.status === "researched").length})` },
        { value: "started", label: "Started" }, { value: "dropped", label: "Dropped" }, { value: "all", label: "All" },
      ]} />
      {shown.length
        ? <div className="grid gap-3">{shown.map((i) => <IdeaCard key={i.id} idea={i} busy={busy} canCheck={data.hasKey} onStore={setStore} onResearch={() => research(i)} onStart={() => start(i)} openWs={(ws) => go({ view: "ws", ws, sec: null, step: null, act: null, short: null })} />)}</div>
        : <EmptyState icon={<Lightbulb />} title={filter === "open" ? "No open ideas" : "Nothing here"}>Add an idea above: a working title and a line on why it matters.</EmptyState>}
    </div>
  );
}

function AddIdea({ onAdded, canCheck }: { onAdded: (store: IdeasData["store"], idea: Idea, check: boolean) => void; canCheck: boolean }) {
  const { toast } = useApp();
  const [title, setTitle] = useState(""), [note, setNote] = useState(""), [keywords, setKeywords] = useState("");
  const add = async (check: boolean) => {
    try { const r = await api.ideaAdd({ title, note, keywords }); setTitle(""); setNote(""); setKeywords(""); onAdded(r.store, r.idea, check); }
    catch (e) { toast((e as Error).message); }
  };
  return (
    <Card>
      <CardHeader><Plus className="size-4 text-muted-foreground" /><CardTitle>New idea</CardTitle></CardHeader>
      <CardBody>
        <Input aria-label="Working title" placeholder="Working title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Textarea aria-label="Note" placeholder="Why it matters to the viewer, the angle, anything you know" rows={3} value={note} onChange={(e) => setNote(e.target.value)} className="font-sans text-[13px]" />
        <Input aria-label="Search words" placeholder="Search words (optional, comma separated; empty = picked for you)" value={keywords} onChange={(e) => setKeywords(e.target.value)} />
        <div className="flex flex-wrap justify-end gap-1.5">
          <Button disabled={!title.trim()} onClick={() => add(false)}><Plus />Add</Button>
          <Button variant="default" disabled={!title.trim() || !canCheck} onClick={() => add(true)}><Search />Add and check</Button>
        </div>
      </CardBody>
    </Card>
  );
}

function IdeaCard({ idea, busy, canCheck, onStore, onResearch, onStart, openWs }: {
  idea: Idea; busy: boolean; canCheck: boolean; onStore: (s: IdeasData["store"]) => void; onResearch: () => void; onStart: () => void; openWs: (ws: string) => void;
}) {
  const { toast } = useApp();
  const r = idea.research, v = r?.verdict;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: idea.title, note: idea.note, keywords: idea.keywords });
  const update = async (b: Parameters<typeof api.ideaUpdate>[1]) => {
    try { onStore((await api.ideaUpdate(idea.id, b)).store); setEditing(false); } catch (e) { toast((e as Error).message); }
  };
  const remove = async () => {
    if (!window.confirm(`Delete ${idea.id} "${idea.title}" and its check?`)) return;
    try { onStore((await api.ideaDelete(idea.id)).store); } catch (e) { toast((e as Error).message); }
  };
  const dropped = idea.status === "dropped";

  return (
    <Card className={cn(dropped && "opacity-70")}>
      <CardBody className="gap-3 text-[13px]">
        <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
          <div className="min-w-0 flex-1 basis-72">
            {editing ? (
              <div className="grid gap-1.5">
                <Input aria-label="Title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                <Textarea aria-label="Note" rows={3} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} className="font-sans text-[13px]" />
                <Input aria-label="Search words" placeholder="Search words (optional)" value={draft.keywords} onChange={(e) => setDraft({ ...draft, keywords: e.target.value })} />
                <div className="flex gap-1.5"><Button size="sm" variant="default" onClick={() => update(draft)}><Check />Save</Button><Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button></div>
              </div>
            ) : <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] text-subtle-foreground">{idea.id}</span>
                <h3 className="m-0 text-[15px] font-semibold tracking-[-0.01em]">{idea.title}</h3>
              </div>
              {idea.note && <p className="m-0 mt-1 text-muted-foreground">{idea.note}</p>}
            </>}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {v && <Badge tone={VERDICT[v.verdict] ?? "neutral"}>{v.verdict}</Badge>}
            {v && <Badge tone={v.fit.score >= 4 ? "success" : v.fit.score >= 3 ? "warning" : "danger"}>fit {v.fit.score}/5</Badge>}
            {v && <Badge tone={DEMAND[v.demand.level] ?? "neutral"}>demand {v.demand.level}</Badge>}
            {idea.status === "started" && <Badge tone="info">started</Badge>}
            {dropped && <Badge>dropped</Badge>}
            {idea.found && <Badge tone={idea.found.score >= 8 ? "success" : idea.found.score >= 6.5 ? "info" : "neutral"} title={`Find ideas rank ${idea.found.rank}: fit ${idea.found.fit}/5, demand ${idea.found.demand}/5`}>found #{idea.found.rank} · {idea.found.score}/10</Badge>}
            {!r && <Badge>not checked</Badge>}
          </div>
        </div>

        {!v && idea.found && <FoundBlock f={idea.found} />}
        {v && <p className="m-0">{v.summary}</p>}
        {r?.error && <p className="m-0 text-warning">{r.error}</p>}
        {v && <div className="rounded-lg border bg-muted/30 px-3 py-2"><span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Sharpest angle</span><p className="m-0 mt-0.5">{v.angle}</p></div>}

        {v && v.packages.length > 0 && (
          <div className="grid gap-2 @3xl:grid-cols-3">
            {v.packages.map((p, k) => (
              <div key={k} className="grid content-start gap-1 rounded-lg border px-3 py-2">
                <span className="flex items-center justify-between gap-2 text-[11px] font-medium text-muted-foreground">Package {"ABC"[k]}{p.lint && <Badge tone={lintTone(p.lint.score)} title="yt-package title check (length, mobile cut, repeats, vague words, a number)">title {p.lint.score}/100</Badge>}</span>
                <b className="font-semibold">{p.title}</b>
                <span className="text-[12.5px]"><span className="text-muted-foreground">Thumbnail:</span> {p.thumbnail}{p.thumbText ? <> · <b className="font-medium">"{p.thumbText}"</b></> : ""}</span>
                <span className="text-[12px] text-subtle-foreground">{p.why}</span>
                {p.lint && p.lint.issues.length > 0 && <LintIssues l={p.lint} />}
              </div>
            ))}
          </div>
        )}

        {v && (
          <Fold title={<span className="text-[12.5px] font-medium">Details: audience test, demand, overlap, risks, {r!.competitors.length} competing videos</span>} className="rounded-lg border px-3">
            <div className="grid gap-4 pb-3">
              <div className="grid gap-4 @4xl:grid-cols-2">
                <div>
                  <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Audience test</div>
                  <ul className="m-0 grid list-none gap-1.5 p-0">{v.fit.tests.map((t, k) => (
                    <li key={k} className="flex gap-2"><span className={cn("mt-px shrink-0 font-semibold", t.pass === true ? "text-success" : t.pass === false ? "text-destructive" : "text-muted-foreground")}>{t.pass === true ? "✓" : t.pass === false ? "✗" : "?"}</span><span><b className="font-medium">{t.test}</b>: {t.note}</span></li>
                  ))}</ul>
                </div>
                <div className="grid content-start gap-3">
                  <div><div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Demand</div><p className="m-0">{v.demand.evidence}</p></div>
                  {v.overlap.length > 0 && <div><div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Overlap with your channel</div><ul className="m-0 grid list-disc gap-1 pl-5 marker:text-subtle-foreground">{v.overlap.map((o, k) => <li key={k}><b className="font-medium">{o.video}</b>: {o.note}</li>)}</ul></div>}
                </div>
              </div>
              <div className="grid gap-4 @4xl:grid-cols-2">
                {v.risks.length > 0 && <div><div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Risks</div><ul className="m-0 grid list-disc gap-1 pl-5 marker:text-subtle-foreground">{v.risks.map((x, k) => <li key={k}>{x}</li>)}</ul></div>}
                {v.sources.length > 0 && <div><div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Claims to source</div><ul className="m-0 grid list-disc gap-1 pl-5 marker:text-subtle-foreground">{v.sources.map((x, k) => <li key={k}>{x}</li>)}</ul></div>}
              </div>
              <div>
                <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Competing videos, last 2 years (searched: {r!.queries.map((q) => `"${q}"`).join(", ")})</div>
                {r!.formulas && r!.formulas.length > 0 && <p className="m-0 mb-2 text-[12.5px]"><span className="text-muted-foreground">Title formulas among the outliers (2× or more, channels with a median of 100+ views):</span> {r!.formulas.map((f) => `${f.formula} ×${f.n}`).join(" · ")}</p>}
                <div className="overflow-hidden rounded-lg border">
                  <DataTable maxH="420px" head={[{ label: "Video" }, { label: "Channel" }, { label: "Age" }, { label: "Length", right: true }, { label: "Views", right: true }, { label: "Channel median", right: true }, { label: "Multiple", right: true }]}>
                    {r!.competitors.map((c) => (
                      <tr key={c.ytId}>
                        <Td className="min-w-64"><a href={`https://www.youtube.com/watch?v=${c.ytId}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:underline">{c.thumb && <img src={c.thumb} alt="" loading="lazy" className="h-9 w-16 shrink-0 rounded object-cover max-sm:hidden" />}<span className="line-clamp-2">{c.title}</span></a>{c.formula && c.formula !== "Unclassified" && <div className="mt-0.5 text-[11px] text-subtle-foreground">{c.formula}</div>}</Td>
                        <Td className="text-muted-foreground">{c.channel}<div className="text-[11px] text-subtle-foreground">{int(c.channelSubs)} subs</div></Td>
                        <Td className="whitespace-nowrap text-muted-foreground">{ago(c.publishedAt)}</Td>
                        <Td right className="tabular-nums">{c.durationS <= 180 ? <Badge>short</Badge> : fmtTime(c.durationS)}</Td>
                        <Td right className="tabular-nums">{int(c.views)}</Td>
                        <Td right className="tabular-nums text-muted-foreground" title={c.median !== undefined ? `median of ${c.sampleN} recent ${c.durationS <= 180 ? "shorts" : "long videos"}` : "under 4 recent uploads of this format: lifetime average views per video"}>{c.median !== undefined ? int(c.median) : <span>{int(c.channelAvgViews)} <span className="text-[11px]">avg</span></span>}{(c.median ?? c.channelAvgViews) < 100 && <div className="text-[11px] text-subtle-foreground">tiny: noise</div>}</Td>
                        <Td right className={cn("tabular-nums font-medium", (c.median ?? c.channelAvgViews) < 100 || (c.multiple ?? c.ratio) < 1 ? "text-muted-foreground" : (c.multiple ?? c.ratio) >= 3 ? "text-success" : "")}>{c.multiple ?? c.ratio}×</Td>
                      </tr>
                    ))}
                  </DataTable>
                </div>
              </div>
            </div>
          </Fold>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          {r && <span className="text-[12px] text-subtle-foreground">checked {ago(r.at)} · {r.model}{r.costUsd ? ` · ${money(r.costUsd)}` : ""} · {r.quotaUnits} quota units</span>}
          <div className="ml-auto flex flex-wrap gap-1.5">
            {!editing && idea.status !== "started" && <Button size="sm" variant="ghost" onClick={() => { setDraft({ title: idea.title, note: idea.note, keywords: idea.keywords }); setEditing(true); }}><Pencil />Edit</Button>}
            {idea.status !== "started" && <Button size="sm" variant="ghost" onClick={remove}><Trash2 />Delete</Button>}
            {idea.status !== "started" && (dropped
              ? <Button size="sm" variant="ghost" onClick={() => update({ status: "new" })}><Undo2 />Restore</Button>
              : <Button size="sm" variant="ghost" onClick={() => update({ status: "dropped" })}><X />Drop</Button>)}
            {idea.status !== "started" && !dropped && <Button size="sm" disabled={busy || !canCheck} onClick={onResearch}><Search />{r ? "Check again" : "Check"}</Button>}
            {idea.status === "started" && idea.ws
              ? <Button size="sm" variant="default" onClick={() => openWs(idea.ws!)}>Open {idea.ws}<ArrowRight /></Button>
              : !dropped && <Button size="sm" variant="default" disabled={busy} onClick={onStart}><Rocket />Start project</Button>}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function LintIssues({ l }: { l: TitleLint }) {
  return (
    <ul className="m-0 grid list-none gap-0.5 p-0 text-[11.5px] text-muted-foreground">
      {l.issues.map(([k, m], i) => <li key={i}><span className="font-medium text-warning">{k}</span> {m}</li>)}
    </ul>
  );
}

/** The yt-package title checker on any title + thumbnail text, as you type (free, no model). */
function TitleCheck() {
  const [title, setTitle] = useStored("ideas.titleCheck", "");
  const [thumb, setThumb] = useStored("ideas.thumbCheck", "");
  const [res, setRes] = useState<TitleLint | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!title.trim()) { setRes(null); setErr(""); return; }
    const t = setTimeout(() => { api.ideaLint(title, thumb).then((r) => { setRes(r); setErr(""); }).catch((e) => setErr((e as Error).message)); }, 300);
    return () => clearTimeout(t);
  }, [title, thumb]);
  return (
    <Card>
      <CardHeader><SpellCheck className="size-4 text-muted-foreground" /><CardTitle>Title check</CardTitle></CardHeader>
      <CardBody className="text-[13px]">
        <Input aria-label="Title to check" placeholder="A title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input aria-label="Thumbnail text" placeholder="Thumbnail text, up to 3 words (optional)" value={thumb} onChange={(e) => setThumb(e.target.value)} />
        {err && <span className="text-destructive">{err}</span>}
        {res && <div className="grid gap-1.5">
          <div className="flex items-center gap-2"><Badge tone={lintTone(res.score)}>{res.score}/100</Badge><span className="tabular-nums text-muted-foreground">{res.chars} characters</span></div>
          {res.issues.length > 0 && <LintIssues l={res} />}
          {res.good.length > 0 && <ul className="m-0 grid list-none gap-0.5 p-0 text-[11.5px] text-muted-foreground">{res.good.map((g, i) => <li key={i}><span className="font-medium text-success">ok</span> {g}</li>)}</ul>}
        </div>}
        <span className="text-[11.5px] text-subtle-foreground">Rules from yt-package: 60 characters (desktop cut), ~40 on a phone feed, at most 2 all-caps words, a number beats an adjective, and the thumbnail mustn't repeat the title. It's a floor, not a judge: only use a number the video sources.</span>
      </CardBody>
    </Card>
  );
}

/** Find ideas: what is working in the niche right now (recent outliers, yt-viral), turned into ranked ideas for this
 *  audience by the editor model. Optionally the full check of the best ones in the same run. */
function FindIdeas({ onRun, disabled, channels }: { onRun: (focus: string, check: number, watchlist: boolean) => void; disabled: boolean; channels: number }) {
  const [focus, setFocus] = useStored("ideas.findFocus", "");
  const [check, setCheck] = useStored("ideas.findCheck", 3);
  const [source, setSource] = useStored<"search" | "watchlist">("ideas.findSource", "search");
  const wl = source === "watchlist" && channels > 0;
  const cost = 0.2 + check * 0.15, units = (wl ? 3 * channels + 5 : 650) + check * 270;
  return (
    <Card>
      <CardHeader><Compass className="size-4 text-muted-foreground" /><CardTitle>Find ideas</CardTitle><CardSub>from videos that beat their channel's normal reach in the last 6 months</CardSub></CardHeader>
      <CardBody className="text-[13px]">
        <Segmented label="Where to look" value={wl ? "watchlist" : "search"} onChange={setSource} className="justify-self-start" options={[
          { value: "search", label: "YouTube search" },
          { value: "watchlist", label: `My watchlist (${channels} channels)` },
        ]} />
        <div className="flex flex-wrap items-center gap-2">
          <Input aria-label="Focus" placeholder="Focus (optional): housing, taxes, debt, jobs… empty = across your audience's topics" value={focus} onChange={(e) => setFocus(e.target.value)} className="min-w-64 flex-1" />
          <label className="flex items-center gap-1.5 text-muted-foreground">Then check the top
            <select aria-label="How many to check" value={check} onChange={(e) => setCheck(Number(e.target.value))} className="h-8 rounded-md border bg-background px-1.5 text-foreground">
              {[0, 1, 2, 3, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <Button variant="default" disabled={disabled} onClick={() => onRun(focus.trim(), check, wl)}><Compass />Find ideas</Button>
        </div>
        <span className="text-[12px] text-subtle-foreground">{wl ? "Every upload of the last 6 months from your watchlist channels" : "5 YouTube searches"} → each video scored against its channel's median → 6 ideas ranked by fit with your audience and proven demand, each with a linted package. About ${cost.toFixed(2)} and {units} of 10,000 daily quota units.</span>
      </CardBody>
    </Card>
  );
}

function FoundBlock({ f }: { f: NonNullable<Idea["found"]> }) {
  return (
    <div className="grid gap-2">
      {f.why && <p className="m-0"><span className="text-muted-foreground">Why: </span>{f.why}</p>}
      {f.risk && <p className="m-0 text-[12.5px]"><span className="text-muted-foreground">Risk: </span>{f.risk}</p>}
      {f.package && (
        <div className="grid gap-1 rounded-lg border px-3 py-2">
          <span className="flex items-center justify-between gap-2 text-[11px] font-medium text-muted-foreground">First package{f.package.lint && <Badge tone={lintTone(f.package.lint.score)}>title {f.package.lint.score}/100</Badge>}</span>
          <b className="font-semibold">{f.package.title}</b>
          <span className="text-[12.5px]"><span className="text-muted-foreground">Thumbnail:</span> {f.package.thumbnail}{f.package.thumbText ? <> · <b className="font-medium">"{f.package.thumbText}"</b></> : ""}</span>
        </div>
      )}
      {f.inspiredBy.length > 0 && (
        <div className="grid gap-0.5 text-[12.5px]">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Proof of demand</span>
          {f.inspiredBy.map((c) => (
            <a key={c.ytId} href={`https://www.youtube.com/watch?v=${c.ytId}`} target="_blank" rel="noreferrer" className="flex min-w-0 gap-2 hover:underline">
              <span className="shrink-0 font-medium tabular-nums text-success">{c.multiple ?? "?"}×</span>
              <span className="min-w-0 truncate">{c.title}</span>
              <span className="shrink-0 text-subtle-foreground">{c.channel} · {int(c.views)}</span>
            </a>
          ))}
        </div>
      )}
      <span className="text-[12px] text-subtle-foreground">Click Check for the full test: audience fit, the competition for this exact idea, and 3 linted packages.</span>
    </div>
  );
}

const age = (iso: string) => { const d = Math.round((Date.now() - Date.parse(iso)) / 864e5); return d < 60 ? `${d}d` : `${Math.round(d / 30)}mo`; };

/** Niche radar: the channels whose viewers you want (workflow/01-ideation/watchlist.json), scanned for uploads that
 *  beat their own channel's median. The scan is free (no model, ~3 quota units per channel); Find ideas with
 *  "My watchlist" turns the same outliers into ranked ideas. */
function NicheRadar({ watchlist, scan, disabled, onWatchlist, onScan }: { watchlist: WatchEntry[]; scan: WatchScan | null; disabled: boolean; onWatchlist: (w: WatchEntry[]) => void; onScan: (days: number, min: number) => void }) {
  const { toast } = useApp();
  const [days, setDays] = useStored("ideas.radarDays", 180);
  const [min, setMin] = useStored("ideas.radarMin", 3);
  const [fmt, setFmt] = useStored<"long" | "short">("ideas.radarFmt", "long");
  const [handle, setHandle] = useState("");
  const [why, setWhy] = useState("");
  const save = async (next: WatchEntry[]) => {
    try { const r = await api.watchlistSave(next); onWatchlist(r.watchlist); } catch (e) { toast((e as Error).message); }
  };
  const add = () => {
    const h = handle.trim();
    if (!h) return;
    void save([...watchlist, { handle: h, why: why.trim() || undefined }]);
    setHandle(""); setWhy("");
  };
  const info = new Map((scan?.channels ?? []).map((c) => [c.handle.toLowerCase(), c]));
  const rows = (scan?.outliers ?? []).filter((c) => (fmt === "short") === (c.durationS <= 180));
  const nLong = (scan?.outliers ?? []).filter((c) => c.durationS > 180).length;
  return (
    <Card>
      <CardHeader><Radar className="size-4 text-muted-foreground" /><CardTitle>Niche radar</CardTitle><CardSub>uploads from your watchlist channels that beat their own channel's median</CardSub></CardHeader>
      <CardBody className="text-[13px]">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-muted-foreground">Uploads from the last
            <select aria-label="Days" value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-8 rounded-md border bg-background px-1.5 text-foreground">
              {[90, 180, 365].map((n) => <option key={n} value={n}>{n} days</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-muted-foreground">at least
            <select aria-label="Minimum multiple" value={min} onChange={(e) => setMin(Number(e.target.value))} className="h-8 rounded-md border bg-background px-1.5 text-foreground">
              {[2, 3, 5].map((n) => <option key={n} value={n}>{n}×</option>)}
            </select>
            their channel's median
          </label>
          <Button disabled={disabled || !watchlist.length} onClick={() => onScan(days, min)}><Radar />Scan (free)</Button>
        </div>
        {scan
          ? <span className="text-[12px] text-subtle-foreground">Scanned {ago(scan.at)} · {scan.channels.length} channels · {scan.scanned} videos from the last {scan.days} days · {scan.outliers.length} at {scan.min}× or more · {scan.quotaUnits} quota units</span>
          : <span className="text-[12px] text-subtle-foreground">Not scanned yet. A scan reads each channel's last 50 uploads (about 3 of 10,000 daily quota units per channel, no model).</span>}
        {scan && scan.missing.length > 0 && <span className="flex items-start gap-1.5 text-[12px] text-warning"><TriangleAlert className="mt-0.5 size-3.5 shrink-0" />Skipped: {scan.missing.join(" · ")}</span>}
        {scan && scan.outliers.length > 0 && <>
          <Segmented label="Format" value={fmt} onChange={setFmt} className="justify-self-start" options={[
            { value: "long", label: `Long videos (${nLong})` }, { value: "short", label: `Shorts (${scan.outliers.length - nLong})` },
          ]} />
          {rows.length
            ? <div className="grid gap-1.5">{rows.slice(0, 30).map((c) => (
              <a key={c.ytId} href={`https://www.youtube.com/watch?v=${c.ytId}`} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-3 rounded-md px-1 py-1 hover:bg-muted">
                {c.thumb ? <img src={c.thumb} alt="" loading="lazy" className="aspect-video w-24 shrink-0 rounded object-cover max-sm:w-16" /> : <span className="aspect-video w-24 shrink-0 rounded bg-muted max-sm:w-16" />}
                <span className="w-14 shrink-0 text-right font-semibold tabular-nums text-success max-sm:w-11">{c.multiple}×</span>
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="line-clamp-2 font-medium">{c.title}</span>
                  <span className="truncate text-[12px] text-subtle-foreground">{c.channel} · {int(c.views)} views vs {int(c.median)} median · {age(c.publishedAt)} ago{c.durationS > 180 ? ` · ${Math.round(c.durationS / 60)} min` : ""}{c.formula && c.formula !== "Unclassified" ? ` · ${c.formula}` : ""}</span>
                </span>
              </a>))}</div>
            : <span className="text-muted-foreground">No {fmt === "long" ? "long videos" : "shorts"} cleared the bar.</span>}
          <span className="text-[12px] text-subtle-foreground">A high multiple means the topic or package beat that channel's normal reach. It is a clue, not a cause: timing and luck play a part. The formula is a judgement about the title's words.</span>
        </>}
        <Fold className="border-t pt-1" title={<span className="text-[13px] font-semibold">Channels ({watchlist.length})</span>}>
          <div className="grid gap-1 pb-2">
            {watchlist.map((w) => {
              const c = info.get(w.handle.toLowerCase());
              return (
                <div key={w.handle} className="flex min-w-0 items-center gap-2">
                  <a href={`https://www.youtube.com/${w.handle}`} target="_blank" rel="noreferrer" className="shrink-0 font-medium hover:underline">{w.handle}</a>
                  <span className="min-w-0 flex-1 truncate text-[12px] text-subtle-foreground">{c ? `${c.title}${c.country ? ` · ${c.country}` : ""} · ${int(c.subs)} subs` : "not scanned yet"}{w.why ? ` · ${w.why}` : ""}</span>
                  {c && c.subs < 10_000 && <Badge tone="warning" title="Under 10k subscribers: usually an impostor, check the handle">check handle</Badge>}
                  <Button variant="ghost" size="icon" aria-label={`Remove ${w.handle}`} onClick={() => void save(watchlist.filter((x) => x.handle !== w.handle))}><X /></Button>
                </div>
              );
            })}
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Input aria-label="Channel handle" placeholder="@handle" value={handle} onChange={(e) => setHandle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} className="w-44" />
              <Input aria-label="Why this channel" placeholder="Why (optional)" value={why} onChange={(e) => setWhy(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} className="min-w-40 flex-1" />
              <Button disabled={!handle.trim()} onClick={add}><Plus />Add</Button>
            </div>
            <span className="text-[12px] text-subtle-foreground">Pick channels whose viewers are the viewers you want. Saved to <code>workflow/01-ideation/watchlist.json</code>; a new handle is checked on the next scan.</span>
          </div>
        </Fold>
      </CardBody>
    </Card>
  );
}
