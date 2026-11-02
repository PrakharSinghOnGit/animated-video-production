import { useApp } from "@/hooks/app";
import { Flow, withKids, BlockFold } from "@/components/Flow";
import { stepSpec } from "@/lib/pipeline";
import { DataTable, Td } from "@/components/DataTable";
import { Note } from "@/components/FileLine";
import { Badge } from "@/components/ui/badge";
import type { PlanAct, PlanBeat } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { ago } from "@/lib/utils";

const sec = (ms: number) => `${(ms / 1000).toFixed(1)}`;
const unverifiedSrc = (s: string) => /unverified|narration/i.test(s);

/** One labelled line of an act's plan (skipped when empty). */
function Field({ k, v }: { k: string; v?: string | number | null }) {
  if (v === undefined || v === null || v === "") return null;
  return (
    <div className="grid gap-0.5 sm:grid-cols-[120px_1fr] sm:gap-3">
      <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-subtle-foreground">{k}</div>
      <div className="text-[13px] leading-relaxed">{v}</div>
    </div>
  );
}

function Beat({ b, i }: { b: PlanBeat; i: number }) {
  return (
    <div className="grid gap-2 border-t py-3 first:border-0">
      <div className="flex items-baseline gap-2 text-xs text-muted-foreground">
        <span className="font-mono text-foreground">Beat {i + 1}</span>
        <span className="font-mono">{sec(b.startMs)}–{sec(b.endMs)} s</span>
        {b.camera && b.camera !== "locked" && <span>· camera: {b.camera}</span>}
      </div>
      <div className="text-[13px] italic leading-relaxed">“{b.vo}”</div>
      <Field k="On screen" v={b.visual} />
      {b.hits.length > 0 && (
        <div className="grid gap-0.5 sm:grid-cols-[120px_1fr] sm:gap-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-subtle-foreground">Hits</div>
          <ul className="m-0 grid list-none gap-1 p-0 text-[13px]">
            {b.hits.map((h, k) => <li key={k}><span className="font-mono text-brand">“{h.word}”{h.occurrence > 1 ? ` #${h.occurrence}` : ""}</span> <span className="text-muted-foreground">→ {h.what}</span></li>)}
          </ul>
        </div>
      )}
      {b.data.length > 0 && (
        <div className="grid gap-0.5 sm:grid-cols-[120px_1fr] sm:gap-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-subtle-foreground">Figures</div>
          <ul className="m-0 grid list-none gap-1 p-0 text-[13px]">
            {b.data.map((x, k) => (
              <li key={k} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-mono">{x.label} = {String(x.value)}{x.unit ? ` ${x.unit}` : ""}</span>
                {unverifiedSrc(x.source) ? <Badge tone="danger">unverified</Badge> : null}
                <span className="text-xs text-muted-foreground">{x.source}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ActPlan({ a, onOpen }: { a: PlanAct; onOpen: () => void }) {
  const d = a.detail;
  const flagged = d.beats.some((b) => b.data.some((x) => unverifiedSrc(x.source)));
  return (
    <div className="rounded-md border bg-raised px-3">
      <BlockFold
        title={<span className="flex min-w-0 items-baseline gap-2"><span className="font-mono text-foreground">{a.id}</span><span className="truncate text-foreground">{a.title}</span><span className="shrink-0 font-mono">{sec(a.startMs)}–{sec(a.endMs)} s</span></span>}
        right={<span className="flex shrink-0 items-center gap-1.5">{a.chapter && <Badge>ch {a.chapter.n}</Badge>}{flagged && <Badge tone="danger">check figures</Badge>}</span>}>
        <div className="grid gap-2.5 pb-3 pt-1">
          <Field k="Idea" v={a.idea} />
          {a.chapter && <Field k="Chapter" v={`${a.chapter.n}. ${a.chapter.title}`} />}
          <Field k="Starts from" v={d.transitionIn} />
          <Field k="Layout" v={d.sheet} />
          <Field k="Signature move" v={d.signature} />
          {d.camera && d.camera !== "locked" && <Field k="Camera" v={d.camera} />}
          <Field k="Sound" v={d.sound} />
          <Field k="Pace" v={[a.bpm ? `${a.bpm} BPM` : "", d.intensity !== null ? `intensity ${d.intensity}` : ""].filter(Boolean).join(" · ")} />
          <div className="mt-1">{d.beats.map((b, i) => <Beat key={i} b={b} i={i} />)}</div>
          <button className="justify-self-start text-xs text-brand hover:underline" onClick={onOpen}>Open {a.id} in Acts →</button>
        </div>
      </BlockFold>
    </div>
  );
}

export function PlanStep() {
  const { d, go, ws, refresh, toast } = useApp();
  if (!d) return null;
  const set = async (on: boolean) => { try { await (on ? api.approvePlan(ws!) : api.unapprovePlan(ws!)); await refresh(); } catch (e) { toast((e as Error).message); } };
  const p = d.plan;
  const spec = stepSpec("plan", d);
  const treatment = Object.entries(p.treatment ?? {});
  const kids: Record<string, React.ReactNode> = {
    plan: p.logline ? <div className="grid gap-1"><div><b>Logline </b><span className="text-muted-foreground">{p.logline}</span></div>{p.style && <div className="text-xs text-muted-foreground">House style: <b className="text-foreground">{p.style}</b></div>}</div> : undefined,
    review: (
      <>
        {p.unverified.length > 0 && (
          <Note tone="danger"><b>{p.unverified.length} on-screen figures come only from the narration. Fact-check before publishing:</b>
            <ul className="m-0 mt-1.5 list-disc pl-5">{p.unverified.map((u) => <li key={u} className="font-mono text-xs">{u}</li>)}</ul></Note>
        )}
        <DataTable head={[{ label: "Act" }, { label: "Title" }, { label: "Time", right: true }, { label: "Length", right: true }, { label: "Chapter" }, { label: "Beats", right: true }]}>
          {p.acts.map((a) => (
            <tr key={a.id}>
              <Td className="font-mono">{a.id}</Td>
              <Td>{a.title}</Td><Td right className="whitespace-nowrap">{sec(a.startMs)}–{sec(a.endMs)} s</Td>
              <Td right>{((a.endMs - a.startMs) / 1000).toFixed(0)} s</Td>
              <Td>{a.chapter ? `${a.chapter.n}. ${a.chapter.title}` : ""}</Td><Td right>{a.beats}</Td>
            </tr>
          ))}
          {p.acts.length === 0 && <tr><Td colSpan={6} className="text-muted-foreground">No plan yet.</Td></tr>}
        </DataTable>
        {treatment.length > 0 && (
          <BlockFold title="Director's treatment (references, arc, opening, ending)">
            <div className="grid gap-2.5 pb-3">{treatment.map(([k, v]) => <Field key={k} k={k} v={v} />)}</div>
          </BlockFold>
        )}
        {p.acts.length > 0 && <div className="text-xs text-muted-foreground">Open an act to read its full plan: what each beat says and shows, the words things land on, and every figure with its source.</div>}
        <div className="grid gap-2">{p.acts.map((a) => <ActPlan key={a.id} a={a} onOpen={() => go({ act: a.id, step: "acts" })} />)}</div>
      </>),
  };
  kids.approve = p.acts.length ? <span className="text-xs text-muted-foreground">{p.approval?.valid ? `You approved this plan ${ago(Date.parse(p.approval.at))}.` : "Approving takes the plan as it is: validation and sync warnings no longer block authoring."}</span> : undefined;
  const asides = {
    approve: p.acts.length ? (p.approval?.valid
      ? <Button size="sm" onClick={() => set(false)}>Remove approval</Button>
      : <Button size="sm" variant="default" onClick={() => set(true)}>Approve plan</Button>) : undefined,
  };
  return <Flow loops={spec.loops} blocks={withKids(spec.blocks, kids, asides)} />;
}
