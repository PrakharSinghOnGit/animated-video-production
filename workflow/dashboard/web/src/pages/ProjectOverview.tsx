import { useEffect, useState } from "react";
import { ArrowRight, ExternalLink, Film, Link2, MonitorPlay, Pencil, Sparkles, Unlink, X } from "lucide-react";
import { LinkShort } from "@/pages/PublishedOverview";
import { Input } from "@/components/ui/fields";
import { useApp } from "@/hooks/app";
import { usePoll } from "@/hooks/usePoll";
import { useRunSaved } from "@/hooks/useRunSaved";
import { api } from "@/lib/api";
import { STEPS, stepStates, videoStatus } from "@/lib/steps";
import type { Overview, StepKey } from "@/lib/types";
import { ago, dur, mb, money, STATUS_LABEL } from "@/lib/utils";
import type { Section } from "@/hooks/useRoute";
import { ActionCard } from "@/components/ActionCard";
import { Downloads } from "@/components/Downloads";
import { DataTable, Td } from "@/components/DataTable";
import { Note, Prose } from "@/components/FileLine";
import { ActionGrid, SubHead } from "@/components/Layout";
import { RunButton } from "@/components/RunButton";
import { Markdown } from "@/components/ui/markdown";
import { PageHeader, StatCard } from "@/components/ui/layout";
import { StatusPill } from "@/components/Status";
import { Badge } from "@/components/ui/badge";
import { HistoryStep } from "@/steps/HistoryStep";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardSub, CardTitle } from "@/components/ui/card";
import { Fold } from "@/components/ui/collapsible";

const firstLine = (t: string) => t.split("\n").map((l) => l.replace(/^#+\s*/, "").trim()).find(Boolean) ?? "";

/** The landing page of a video project: details, the state of its three sections, downloads, checks and housekeeping. */
export function ProjectOverview() {
  const { d, ws, go, busy, list, reloadList } = useApp();
  const runSaved = useRunSaved();
  const [ov, setOv] = useState<Overview | null>(null);
  const [renaming, setRenaming] = useState(false);
  useEffect(() => { setOv(null); setRenaming(false); }, [ws]);
  usePoll(async () => { if (!ws) return; try { const r = await api.overview(ws); setOv((p) => (JSON.stringify(p) === JSON.stringify(r) ? p : r)); } catch { /* keep the last one */ } }, 6000, !!ws);
  if (!d || !ws) return <div className="p-6 text-muted-foreground">Loading…</div>;

  const st = d.statuses, states = stepStates(st);
  const next = STEPS.find((s) => states[s.key] === "next" || states[s.key] === "running");
  const meta = (keys: StepKey[]) => keys.reduce((a, k) => { const m = d.meta[k]; return { ms: a.ms + (m?.totalMs ?? 0), cost: a.cost + (m?.totalCost ?? 0) }; }, { ms: 0, cost: 0 });
  const items = d.shorts.items, exported = items.filter((s) => s.progress.exported).length;
  const pub = d.publish, nThumbs = pub.thumbs.filter((t) => t.file).length;
  const idea = d.script.idea.trim();
  const finalV = d.render.videos.find((v) => v.path.endsWith("final.mp4")), draftV = d.render.videos.find((v) => v.path.endsWith("draft.mp4"));
  const staleLong = Math.max(finalV?.mtime ?? 0, d.sound.files.find((f) => f.path.endsWith("mix.wav"))?.mtime ?? 0);
  const freed = d.shorts.compact.reduce((a, c) => a + c.bytes, 0);
  // a shorts project (SH…): no long video or packaging, the brief stands in for the idea
  const only = d.kind === "shorts";
  const untitled = /^(VID|SH)\d+_Untitled$/.test(ws);
  // published: lessons and the analytics cite it by id, so it keeps its name
  const published = !!list.find((w) => w.id === ws)?.published;
  const allSections: { sec: Section; title: string; status: string; line: string; dots: { k: string; label: string; s: string }[]; ms: number; cost: number; open: string }[] = [
    { sec: "video", title: "Video", status: videoStatus(st), line: next ? `Next: ${next.label}` : "All steps done", dots: STEPS.map((s) => ({ k: s.key, label: s.label, s: st[s.key] ?? "none" })), ...(({ ms, cost }) => ({ ms, cost }))(meta(STEPS.map((s) => s.key))), open: "Open the video steps" },
    { sec: "shorts", title: "Shorts", status: st.shorts ?? "none", line: items.length ? `${exported}/${items.length} exported` : "No shorts yet", dots: items.map((s) => ({ k: s.id, label: s.id, s: s.progress.exported ? "done" : s.progress.script || s.progress.approved ? "partial" : "none" })), ...(({ ms, cost }) => ({ ms, cost }))(meta(["shorts"])), open: "Open the shorts" },
    { sec: "packaging", title: "Packaging", status: st.publish ?? "none", line: `${nThumbs}/3 thumbnails${pub.metadata ? " · titles written" : ""}${pub.approval?.valid ? " · approved" : ""}`, dots: ["A", "B", "C"].map((v) => ({ k: v, label: v, s: pub.thumbs.find((t) => t.id === v)?.file ? "done" : "none" })), ...(({ ms, cost }) => ({ ms, cost }))(meta(["publish"])), open: "Open packaging" },
  ];
  const sections = only ? allSections.filter((s) => s.sec === "shorts") : allSections;

  return (
    <div className="mx-auto grid max-w-[1400px] gap-7 px-6 pb-12 pt-6 max-sm:px-4">
      <PageHeader
        eyebrow={<span className="font-mono normal-case tracking-normal">{d.id}{d.style ? ` · ${d.style}` : ""}</span>}
        title={d.title ?? (firstLine(idea) || "Untitled project")}
        sub={!idea ? (only ? "No brief yet: write it in Shorts." : "No idea written yet: start with the Script step.") : only ? "Shorts project: shorts only, written from the brief." : undefined}
        actions={<>
          {!untitled && !renaming && !published && <Button variant="ghost" onClick={() => setRenaming(true)} title="Rename the project folder (the number stays)"><Pencil />Rename</Button>}
          {only ? <Button variant="default" onClick={() => go({ sec: "shorts", step: null, act: null, short: null })}>Open shorts<ArrowRight /></Button>
            : next ? <Button variant="default" onClick={() => go({ sec: "video", step: next.key, act: null, short: null })}>Continue: {next.label}<ArrowRight /></Button> : undefined}
        </>}
      />
      {(untitled || renaming) && <RenameProject ws={ws} untitled={untitled} canAuto={!!idea || d.statuses.script === "done" || !!d.title} disabled={!!busy} onClose={() => setRenaming(false)} />}
      {idea && (
        <Fold title={only ? "Brief" : "Idea"} className="-mt-3 max-w-4xl">
          <div className="rounded-lg border bg-card px-4 py-3"><Markdown>{idea}</Markdown></div>
        </Fold>
      )}
      <div className="wg-stagger grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {!only && <StatCard label="Narration" value={d.align.durationMs ? dur(d.align.durationMs) : "—"} />}
        {!only && <StatCard label="Acts" value={d.acts.length ? String(d.acts.length) : "—"} />}
        <StatCard label="Shorts exported" value={items.length ? `${exported}/${items.length}` : "—"} />
        <StatCard label="Recorded time" value={dur(d.totals.ms)} />
        <StatCard label="Model cost" value={money(d.totals.costUsd)} />
        <StatCard label="On disk" value={ov ? mb(ov.bytes.total) : "…"} />
      </div>

      <section aria-label="Sections" className={only ? "grid max-w-md gap-3" : "grid gap-3 md:grid-cols-3"}>
        {sections.map((s) => (
          <button key={s.sec} onClick={() => go({ sec: s.sec, step: null, act: null, short: null })}
            className="group flex flex-col gap-3 rounded-[10px] border bg-card p-4 text-left shadow-sm outline-none transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring/60">
            <div className="flex items-center gap-2"><span className="text-[14px] font-semibold tracking-[-0.01em]">{s.title}</span><span className="flex-1" /><StatusPill s={s.status} /></div>
            <div className="text-[13px] text-muted-foreground">{s.line}</div>
            <span className="flex h-1 gap-[2px]">{s.dots.map((x) => <span key={x.k} title={`${x.label}: ${STATUS_LABEL[x.s] ?? x.s}`} className={`h-full flex-1 rounded-full ${x.s === "done" ? "bg-success" : x.s === "running" ? "bg-warning" : x.s === "partial" || x.s === "stale" ? "bg-warning/60" : x.s === "failed" ? "bg-destructive" : "bg-border-strong"}`} />)}</span>
            <div className="mt-auto flex items-center justify-between text-[11.5px] text-subtle-foreground">
              <span className="tabular-nums">{s.ms ? dur(s.ms) : "no runs"}{s.cost ? ` · ${money(s.cost)}` : ""}</span>
              <span className="flex items-center gap-1 font-medium text-muted-foreground group-hover:text-foreground">Open<ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" /></span>
            </div>
          </button>
        ))}
      </section>

      {only && !published && items.length > 0 && <LinkShorts ws={ws} items={items.map((s) => ({ id: s.id, title: s.entry.title ?? null }))} links={list.find((w) => w.id === ws)?.shortLinks ?? {}} onDone={async () => { await reloadList(); }} />}
      {!only && !list.find((w) => w.id === ws)?.published && <LinkUpload ws={ws} onDone={async () => { await reloadList(); go({ sec: null, step: null, act: null, short: null }); }} />}

      <section aria-label="Downloads" className="grid gap-3">
        <SubHead>Downloads</SubHead>
        {!only && <Card>
          <CardHeader><CardTitle>Long video</CardTitle><CardSub>{finalV ? `final ${ago(finalV.mtime)}` : draftV ? `draft ${ago(draftV.mtime)} (no final yet)` : "not rendered yet"}</CardSub></CardHeader>
          <CardBody><Downloads info={ov?.deliver.video} staleAfter={staleLong} /></CardBody>
        </Card>}
        {items.map((s) => (
          <Card key={s.id}>
            <Fold className="px-3.5" title={<span className="flex min-w-0 items-center gap-2"><b className="font-mono text-[13px] text-foreground">{s.id}</b><span className="truncate text-foreground">{s.entry.title ?? "(untitled)"}</span><span className="text-muted-foreground">{ov?.deliver.shorts[s.id] ? `${ov.deliver.shorts[s.id]!.items.length} files` : "not built yet"}</span></span>}>
              <div className="pb-3.5"><Downloads short={s.id} info={ov?.deliver.shorts[s.id]} staleAfter={Math.max(s.files.final?.mtime ?? 0, s.files.mix?.mtime ?? 0)} /></div>
            </Fold>
          </Card>
        ))}
        {items.length === 0 && <div className="text-xs text-muted-foreground">Shorts get their own downloads here once they exist.</div>}
      </section>

      <section aria-label="Checks and housekeeping" className="grid gap-3">
        <SubHead>Checks &amp; housekeeping</SubHead>
        <div className="grid items-start gap-3 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>QC</CardTitle><CardSub>{d.render.qc ? `report ${ago(d.render.qc.mtime)}` : "no report yet"}</CardSub></CardHeader>
            <CardBody>
              {!only && <ActionGrid className="sm:grid-cols-1"><ActionCard id="render.qc" /></ActionGrid>}
              {!only && d.render.qc && <Fold title="Long-video QC report" className="rounded-lg border px-3"><div className="pb-3"><Prose>{d.render.qc.text}</Prose></div></Fold>}
              {items.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center gap-2.5 text-[12.5px]">
                  <b className="font-mono">{s.id}</b>
                  <Badge tone={s.progress.qc ? "success" : s.qc ? "warning" : "neutral"}>{s.progress.qc ? "QC passed" : s.qc ? "QC not passed" : "no QC yet"}</Badge>
                  <RunButton label="QC" running={busy?.label === `QC ${s.id}`} disabled={!!busy || !s.files.final && !s.files.draft} onClick={() => runSaved("shorts.qc", s.id)} />
                  {s.qc && <Fold title={`report ${ago(s.qc.mtime)}`} className="min-w-0 basis-full"><div className="pb-2"><Prose>{s.qc.text}</Prose></div></Fold>}
                </div>
              ))}
            </CardBody>
          </Card>
          <Card>
            <CardHeader><CardTitle>Housekeeping</CardTitle><CardSub>{ov ? `${mb(ov.bytes.total)} on disk` : "measuring…"}{freed ? ` · ${mb(freed)} freed so far` : ""}</CardSub></CardHeader>
            <CardBody>
              {ov && Object.keys(ov.bytes.shorts).length > 0 && <div className="text-xs text-muted-foreground">{Object.entries(ov.bytes.shorts).map(([k, v]) => `${k} ${mb(v)}`).join(" · ")} (inside the total)</div>}
              <ActionGrid className="sm:grid-cols-1">
                <ActionCard id="history.compact" hint="Dry run unless “DELETE FOR REAL” is ticked: the log then lists what would be deleted and the space it frees. Deleted files cannot be restored." />
              </ActionGrid>
              {d.shorts.compact.length > 0 && (
                <div className="overflow-hidden rounded-lg border">
                  <DataTable head={[{ label: "When" }, { label: "Freed", right: true }, { label: "Level" }, { label: "What" }]}>
                    {[...d.shorts.compact].reverse().map((c, i) => (
                      <tr key={i}>
                        <Td className="whitespace-nowrap text-muted-foreground">{new Date(c.at).toLocaleString()}</Td>
                        <Td right>{mb(c.bytes)}</Td>
                        <Td>{[c.deep && "deep", c.daw && "daw", c.final && "final"].filter(Boolean).join(", ") || "default"}</Td>
                        <Td className="text-muted-foreground">{c.items.map((x) => `${x.why} (${x.n})`).join(", ")}</Td>
                      </tr>
                    ))}
                  </DataTable>
                </div>
              )}
              {!d.shorts.compact.length && <Note>Nothing compacted yet. The first real compaction is listed here with the space it freed.</Note>}
            </CardBody>
          </Card>
        </div>
      </section>
      <section aria-label="Runs" className="grid gap-3">
        <SubHead>Runs</SubHead>
        <p className="m-0 -mt-2 text-xs text-muted-foreground">Every run of this video from the dashboard (duration, CPU, memory, GPU) and every pipeline step (model and cost) · {dur(d.totals.ms)} · {money(d.totals.costUsd)}</p>
        <HistoryStep />
      </section>
    </div>
  );
}

/** Once the video is on YouTube: paste its link and the project becomes a published video (its overview shows the
 *  upload's numbers instead of the pipeline; the pipeline stays under Production and the section tabs). */
function LinkUpload({ ws, onDone }: { ws: string; onDone: () => void }) {
  const { toast } = useApp();
  const [id, setId] = useState("");
  const link = async () => {
    try { const r = await api.analyticsLink(ws, id); toast(`${ws} linked to ${r.id}: it now opens on its upload`); setId(""); onDone(); } catch (e) { toast((e as Error).message); }
  };
  return (
    <Card>
      <CardHeader><MonitorPlay className="size-4 text-muted-foreground" /><CardTitle>Uploaded it?</CardTitle><CardSub>Paste the YouTube link: the project moves to Published and opens on its numbers</CardSub></CardHeader>
      <CardBody>
        <div className="flex flex-wrap items-center gap-2">
          <Input aria-label="YouTube URL or video id" placeholder="https://youtu.be/… or the video id" value={id} onChange={(e) => setId(e.target.value)} onKeyDown={(e) => e.key === "Enter" && id.trim() && void link()} className="min-w-56 flex-1" />
          <Button variant="default" disabled={!id.trim()} onClick={link}><Link2 />Link upload</Button>
        </div>
      </CardBody>
    </Card>
  );
}

/** A shorts project is done when its shorts are on YouTube: link each one; once all are linked the project moves to
 *  Published and opens on its shorts' numbers. */
function LinkShorts({ ws, items, links, onDone }: { ws: string; items: { id: string; title: string | null }[]; links: Record<string, string | null>; onDone: () => void }) {
  const { toast } = useApp();
  const n = items.filter((s) => links[s.id]).length;
  const unlink = async (s: string) => {
    try { await api.analyticsLink(ws, null, s); onDone(); } catch (e) { toast((e as Error).message); }
  };
  return (
    <Card>
      <CardHeader><MonitorPlay className="size-4 text-muted-foreground" /><CardTitle>Uploaded them?</CardTitle><CardSub>Paste each short's YouTube link ({n}/{items.length} linked): once all are linked the project moves to Published and opens on their numbers</CardSub></CardHeader>
      <CardBody className="gap-2.5 text-[13px]">
        {items.map((s) => (
          <div key={s.id} className="grid gap-1">
            <div className="flex min-w-0 items-center gap-2"><Film className="size-3.5 shrink-0 text-muted-foreground" /><b className="font-mono">{s.id}</b><span className="min-w-0 truncate">{s.title ?? "(untitled)"}</span></div>
            {links[s.id]
              ? <span className="flex flex-wrap items-center gap-1 pl-5.5">
                  <Badge tone="success">linked</Badge>
                  <Button size="sm" variant="ghost" asChild><a href={`https://www.youtube.com/shorts/${links[s.id]}`} target="_blank" rel="noreferrer"><ExternalLink />YouTube</a></Button>
                  <Button size="sm" variant="ghost" onClick={() => unlink(s.id)}><Unlink />Unlink</Button>
                </span>
              : <span className="pl-5.5"><LinkShort ws={ws} short={s.id} onDone={onDone} /></span>}
          </div>
        ))}
      </CardBody>
    </Card>
  );
}

/** Untitled projects get their name from the naming model when a job finishes (idea, script or plan written); this
 *  names it now, or sets a name by hand. The number stays: VID07_Untitled → VID07_<Name>. */
function RenameProject({ ws, untitled, canAuto, disabled, onClose }: { ws: string; untitled: boolean; canAuto: boolean; disabled: boolean; onClose: () => void }) {
  const { go, toast, reloadList } = useApp();
  const [name, setName] = useState(untitled ? "" : ws.replace(/^(VID|SH)\d+_/, ""));
  const [working, setWorking] = useState(false);
  const rename = async (n?: string) => {
    setWorking(true);
    try { const r = await api.wsRename(ws, n); await reloadList(); go({ ws: r.id }); toast(`Renamed to ${r.id}`); onClose(); }
    catch (e) { toast((e as Error).message); }
    finally { setWorking(false); }
  };
  const prefix = ws.match(/^(VID|SH)\d+_/)?.[0] ?? "";
  const valid = /^[A-Za-z0-9_ ]+$/.test(name.trim());
  return (
    <Card className="-mt-3 max-w-4xl">
      <CardBody className="gap-2 text-[13px]">
        {untitled && <span className="text-muted-foreground">Untitled. It's named from its {canAuto ? "idea" : "idea or script"} automatically when the next step finishes{canAuto ? ", or name it now" : ": write the idea in the Script step first"}.</span>}
        <div className="flex flex-wrap items-center gap-1.5">
          <code className="text-subtle-foreground">{prefix}</code>
          <Input aria-label="Project name" placeholder="Sticky_Prices" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && valid && void rename(name.trim())} className="h-8 w-56 max-w-full font-mono text-xs" />
          <Button size="sm" variant="default" disabled={disabled || working || !valid} onClick={() => rename(name.trim())}>{untitled ? "Set name" : "Rename"}</Button>
          {canAuto && <Button size="sm" disabled={disabled || working} onClick={() => rename()} title="A cheap model (role projectName) reads the idea and script and picks a 2–4 word name"><Sparkles />{working ? "Naming…" : "Name it for me"}</Button>}
          {!untitled && <Button size="sm" variant="ghost" onClick={onClose}><X />Cancel</Button>}
        </div>
        {disabled && <span className="text-[12px] text-subtle-foreground">A job is running; rename after it ends.</span>}
      </CardBody>
    </Card>
  );
}
