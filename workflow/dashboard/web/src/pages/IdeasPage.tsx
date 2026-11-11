import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Check, CircleHelp, Lightbulb, Pencil, Plus, Rocket, Search, Trash2, Undo2, X } from "lucide-react";
import { api } from "@/lib/api";
import { useApp } from "@/hooks/app";
import { useStored } from "@/lib/storage";
import { ago, cn, money } from "@/lib/utils";
import { fmtTime, int, type Idea, type IdeasData } from "@/lib/analytics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/fields";
import { EmptyState, PageHeader, Segmented } from "@/components/ui/layout";
import { Fold } from "@/components/ui/collapsible";
import { Markdown } from "@/components/ui/markdown";
import { DataTable, Td } from "@/components/DataTable";
import { JobLog } from "@/components/analytics/JobLog";

type Filter = "open" | "started" | "dropped" | "all";
const VERDICT = { make: "success", rework: "warning", drop: "danger" } as const;
const DEMAND = { high: "success", medium: "info", low: "warning", unclear: "neutral" } as const;
/** "Why Prices Keep Rising" → "Why_Prices_Keep_Rising" (first 5 words) */
const nameFrom = (t: string) => t.replace(/[^A-Za-z0-9 ]+/g, " ").trim().split(/\s+/).slice(0, 5).join("_");

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
  const research = async (i: Idea) => {
    try { const r = await api.ideaResearch(i.id); setJob({ id: r.job.id, label: r.job.label }); } catch (e) { toast((e as Error).message); }
  };
  const start = async (i: Idea, name: string) => {
    try { const r = await api.ideaStart(i.id, name); setJob({ id: r.job.id, label: r.job.label, ws: r.ws }); } catch (e) { toast((e as Error).message); }
  };
  const onEnd = async () => {
    await load();
    if (job?.ws) { await reloadList(); toast(`${job.ws} created with the idea in its script step`); }
  };

  if (!data) return <div className="p-6 text-muted-foreground">Loading ideas…</div>;
  const ideas = [...data.store.ideas].reverse();
  const shown = ideas.filter((i) => filter === "all" || (filter === "open" ? i.status === "new" || i.status === "researched" : i.status === filter));
  const busy = !!data.running;

  return (
    <div className="mx-auto grid max-w-[1400px] gap-5 px-6 pb-12 pt-6 max-sm:px-4">
      <PageHeader
        title="Ideas"
        info={<>Check an idea before it becomes a project. <b>Check</b> searches YouTube twice (~200 of 10,000 daily quota units) for recent videos on the topic and their outlier ratio (views ÷ that channel's average), then {data.model} judges it against the audience brief and your channel's numbers and drafts 3 packages (~$0.10). <b>Start project</b> creates the video with the idea, angle and packages in its script step.</>}
        sub={<>{data.store.ideas.length} ideas · checks by {data.model} · search words by {data.queryModel}</>}
      />
      {job && <JobLog job={job.id} label={job.label} onEnd={() => void onEnd()} onClose={() => setJob(null)} />}
      {!data.hasKey && <Card><CardBody className="text-[13px] text-warning">Add <code>YOUTUBE_API_KEY</code> to <code>.env</code> to check ideas (the same read-only key as Comments).</CardBody></Card>}

      <div className="grid items-start gap-3.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <AddIdea onAdded={(store, idea, check) => { setStore(store); if (check) void research(idea); }} canCheck={data.hasKey && !busy} />
        <Card>
          <Fold className="px-4" title={<span className="flex items-center gap-2 text-[13px] font-semibold"><CircleHelp className="size-4 text-muted-foreground" />Audience brief: what every idea is checked against</span>}>
            <div className="max-h-[420px] overflow-y-auto pb-4 text-[13px]"><Markdown>{data.audience || "workflow/01-ideation/AUDIENCE.md is missing."}</Markdown></div>
          </Fold>
          <div className="border-t px-4 py-2 text-[12px] text-muted-foreground">Edit <code>workflow/01-ideation/AUDIENCE.md</code> as you learn who watches.</div>
        </Card>
      </div>

      <Segmented label="Show" value={filter} onChange={setFilter} className="justify-self-start" options={[
        { value: "open", label: `Open (${ideas.filter((i) => i.status === "new" || i.status === "researched").length})` },
        { value: "started", label: "Started" }, { value: "dropped", label: "Dropped" }, { value: "all", label: "All" },
      ]} />
      {shown.length
        ? <div className="grid gap-3">{shown.map((i) => <IdeaCard key={i.id} idea={i} busy={busy} canCheck={data.hasKey} onStore={setStore} onResearch={() => research(i)} onStart={(n) => start(i, n)} openWs={(ws) => go({ view: "ws", ws, sec: null, step: null, act: null, short: null })} />)}</div>
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
  idea: Idea; busy: boolean; canCheck: boolean; onStore: (s: IdeasData["store"]) => void; onResearch: () => void; onStart: (name: string) => void; openWs: (ws: string) => void;
}) {
  const { toast } = useApp();
  const r = idea.research, v = r?.verdict;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: idea.title, note: idea.note, keywords: idea.keywords });
  const [starting, setStarting] = useState(false);
  const [name, setName] = useState(nameFrom(idea.title));
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
            {!r && <Badge>not checked</Badge>}
          </div>
        </div>

        {v && <p className="m-0">{v.summary}</p>}
        {r?.error && <p className="m-0 text-warning">{r.error}</p>}
        {v && <div className="rounded-lg border bg-muted/30 px-3 py-2"><span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Sharpest angle</span><p className="m-0 mt-0.5">{v.angle}</p></div>}

        {v && v.packages.length > 0 && (
          <div className="grid gap-2 md:grid-cols-3">
            {v.packages.map((p, k) => (
              <div key={k} className="grid content-start gap-1 rounded-lg border px-3 py-2">
                <span className="text-[11px] font-medium text-muted-foreground">Package {"ABC"[k]}</span>
                <b className="font-semibold">{p.title}</b>
                <span className="text-[12.5px]"><span className="text-muted-foreground">Thumbnail:</span> {p.thumbnail}</span>
                <span className="text-[12px] text-subtle-foreground">{p.why}</span>
              </div>
            ))}
          </div>
        )}

        {v && (
          <Fold title={<span className="text-[12.5px] font-medium">Details: audience test, demand, overlap, risks, {r!.competitors.length} competing videos</span>} className="rounded-lg border px-3">
            <div className="grid gap-4 pb-3">
              <div className="grid gap-4 lg:grid-cols-2">
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
              <div className="grid gap-4 lg:grid-cols-2">
                {v.risks.length > 0 && <div><div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Risks</div><ul className="m-0 grid list-disc gap-1 pl-5 marker:text-subtle-foreground">{v.risks.map((x, k) => <li key={k}>{x}</li>)}</ul></div>}
                {v.sources.length > 0 && <div><div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Claims to source</div><ul className="m-0 grid list-disc gap-1 pl-5 marker:text-subtle-foreground">{v.sources.map((x, k) => <li key={k}>{x}</li>)}</ul></div>}
              </div>
              <div>
                <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Competing videos, last 2 years (searched: {r!.queries.map((q) => `"${q}"`).join(", ")})</div>
                <div className="overflow-hidden rounded-lg border">
                  <DataTable maxH="420px" head={[{ label: "Video" }, { label: "Channel" }, { label: "Age" }, { label: "Length", right: true }, { label: "Views", right: true }, { label: "Channel avg", right: true }, { label: "Outlier", right: true }]}>
                    {r!.competitors.map((c) => (
                      <tr key={c.ytId}>
                        <Td className="min-w-64"><a href={`https://www.youtube.com/watch?v=${c.ytId}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:underline">{c.thumb && <img src={c.thumb} alt="" loading="lazy" className="h-9 w-16 shrink-0 rounded object-cover max-sm:hidden" />}<span className="line-clamp-2">{c.title}</span></a></Td>
                        <Td className="text-muted-foreground">{c.channel}<div className="text-[11px] text-subtle-foreground">{int(c.channelSubs)} subs</div></Td>
                        <Td className="whitespace-nowrap text-muted-foreground">{ago(c.publishedAt)}</Td>
                        <Td right className="tabular-nums">{c.durationS <= 180 ? <Badge>short</Badge> : fmtTime(c.durationS)}</Td>
                        <Td right className="tabular-nums">{int(c.views)}</Td>
                        <Td right className="tabular-nums text-muted-foreground">{int(c.channelAvgViews)}</Td>
                        <Td right className={cn("tabular-nums font-medium", c.ratio >= 3 ? "text-success" : c.ratio < 1 ? "text-muted-foreground" : "")}>{c.ratio}×</Td>
                      </tr>
                    ))}
                  </DataTable>
                </div>
              </div>
            </div>
          </Fold>
        )}

        {starting && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
            <span className="text-muted-foreground">New video</span>
            <code className="text-subtle-foreground">VID…_</code>
            <Input aria-label="Project name" value={name} onChange={(e) => setName(e.target.value)} className="w-64 max-w-full font-mono text-xs" />
            <Button size="sm" variant="default" disabled={busy || !/^[A-Za-z0-9_]+$/.test(name)} onClick={() => { setStarting(false); onStart(name); }}><Rocket />Create</Button>
            <Button size="sm" variant="ghost" onClick={() => setStarting(false)}><X />Cancel</Button>
          </div>
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
              : !dropped && !starting && <Button size="sm" variant="default" disabled={busy} onClick={() => setStarting(true)}><Rocket />Start project</Button>}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
