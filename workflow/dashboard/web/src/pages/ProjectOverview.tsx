import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
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
import { StatTile } from "@/components/StatTile";
import { StatusDot, StatusPill } from "@/components/Status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardSub, CardTitle } from "@/components/ui/card";
import { Fold } from "@/components/ui/collapsible";

const firstLine = (t: string) => t.split("\n").map((l) => l.replace(/^#+\s*/, "").trim()).find(Boolean) ?? "";

/** The landing page of a video project: details, the state of its three sections, downloads, checks and housekeeping. */
export function ProjectOverview() {
  const { d, ws, go, busy } = useApp();
  const runSaved = useRunSaved();
  const [ov, setOv] = useState<Overview | null>(null);
  useEffect(() => setOv(null), [ws]);
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
  const sections: { sec: Section; title: string; status: string; line: string; dots: { k: string; label: string; s: string }[]; ms: number; cost: number; open: string }[] = [
    { sec: "video", title: "Video", status: videoStatus(st), line: next ? `Next: ${next.label}` : "All steps done", dots: STEPS.map((s) => ({ k: s.key, label: s.label, s: st[s.key] ?? "none" })), ...(({ ms, cost }) => ({ ms, cost }))(meta(STEPS.map((s) => s.key))), open: "Open the video steps" },
    { sec: "shorts", title: "Shorts", status: st.shorts ?? "none", line: items.length ? `${exported}/${items.length} exported` : "No shorts yet", dots: items.map((s) => ({ k: s.id, label: s.id, s: s.progress.exported ? "done" : s.progress.script || s.progress.approved ? "partial" : "none" })), ...(({ ms, cost }) => ({ ms, cost }))(meta(["shorts"])), open: "Open the shorts" },
    { sec: "packaging", title: "Packaging", status: st.publish ?? "none", line: `${nThumbs}/3 thumbnails${pub.metadata ? " · titles written" : ""}${pub.approval?.valid ? " · approved" : ""}`, dots: ["A", "B", "C"].map((v) => ({ k: v, label: v, s: pub.thumbs.find((t) => t.id === v)?.file ? "done" : "none" })), ...(({ ms, cost }) => ({ ms, cost }))(meta(["publish"])), open: "Open packaging" },
  ];

  return (
    <div className="grid gap-5 p-4 pb-10">
      <header className="flex flex-wrap items-start gap-x-8 gap-y-3">
        <div className="min-w-0 flex-1 basis-80">
          <div className="font-mono text-xs text-muted-foreground">{d.id}{d.style ? ` · ${d.style}` : ""}</div>
          <h1 className="m-0 mt-0.5 text-lg font-semibold tracking-tight">{d.title ?? (firstLine(idea) || "Untitled project")}</h1>
          {idea && <p className="m-0 mt-1.5 line-clamp-3 max-w-3xl whitespace-pre-line text-[13px] text-muted-foreground" title={idea}>{idea.slice(0, 500)}</p>}
          {!idea && <p className="m-0 mt-1.5 text-[13px] text-muted-foreground">No idea written yet: start in the Video section, step Script.</p>}
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <StatTile align="left" value={d.align.durationMs ? dur(d.align.durationMs) : "—"} label="narration" />
          <StatTile align="left" value={d.acts.length ? String(d.acts.length) : "—"} label="acts" />
          <StatTile align="left" value={items.length ? `${exported}/${items.length}` : "—"} label="shorts exported" />
          <StatTile align="left" value={dur(d.totals.ms)} label="recorded time" />
          <StatTile align="left" value={money(d.totals.costUsd)} label="Claude cost" />
          <StatTile align="left" value={ov ? mb(ov.bytes.total) : "…"} label="on disk" />
        </div>
      </header>

      <section aria-label="Sections" className="grid gap-3 md:grid-cols-3">
        {sections.map((s) => (
          <Card key={s.sec} className="flex flex-col">
            <CardHeader><CardTitle className="text-sm">{s.title}</CardTitle><span className="flex-1" /><StatusPill s={s.status} /></CardHeader>
            <CardBody className="flex-1 content-start">
              <div className="text-[13px]">{s.line}</div>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {s.dots.map((x) => <span key={x.k} className="flex items-center gap-1.5 text-[11px] text-muted-foreground" title={`${x.label}: ${STATUS_LABEL[x.s] ?? x.s}`}><StatusDot s={x.s} />{x.label}</span>)}
              </div>
              <div className="text-[11.5px] text-muted-foreground">{s.ms ? dur(s.ms) : "no runs"}{s.cost ? ` · ${money(s.cost)}` : ""}</div>
              <Button className="mt-auto w-fit" onClick={() => go({ sec: s.sec, step: null, act: null, short: null })}>{s.open}<ArrowRight /></Button>
            </CardBody>
          </Card>
        ))}
      </section>

      <section aria-label="Downloads" className="grid gap-3">
        <SubHead>Downloads</SubHead>
        <Card>
          <CardHeader><CardTitle>Long video</CardTitle><CardSub>{finalV ? `final ${ago(finalV.mtime)}` : draftV ? `draft ${ago(draftV.mtime)} (no final yet)` : "not rendered yet"}</CardSub></CardHeader>
          <CardBody><Downloads info={ov?.deliver.video} staleAfter={staleLong} /></CardBody>
        </Card>
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
              <ActionGrid className="sm:grid-cols-1"><ActionCard id="render.qc" /></ActionGrid>
              {d.render.qc && <Fold title="Long-video QC report" className="rounded-lg border px-3"><div className="pb-3"><Prose>{d.render.qc.text}</Prose></div></Fold>}
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
    </div>
  );
}
