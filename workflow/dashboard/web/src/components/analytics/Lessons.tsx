import { useState } from "react";
import { Check, RotateCcw, Undo2, X } from "lucide-react";
import { api } from "@/lib/api";
import { useApp } from "@/hooks/app";
import { ago, cn } from "@/lib/utils";
import type { Lesson, LessonStore, Review } from "@/lib/analytics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardSub, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/fields";

type Tab = "proposed" | "active" | "history";
const CONF = { high: "success", medium: "info", low: "neutral" } as const;

/**
 * The gate between the reviewer and the prompts. Proposed lessons wait here; Approve appends one to its prompt,
 * Reject drops it, Retire rolls an active one back, Restore re-activates. Every change is logged in lessons.json (git).
 */
export function Lessons({ store, cap, targetInfo, reviews, onChange, only }: { store: LessonStore; cap: number; targetInfo: Record<string, string>; reviews: Review[]; onChange: (s: LessonStore) => void; only?: (l: Lesson) => boolean }) {
  const { toast } = useApp();
  const lessons = only ? store.lessons.filter(only) : store.lessons;
  const by = (s: Lesson["status"][]) => lessons.filter((l) => s.includes(l.status));
  const proposed = by(["proposed"]), active = by(["active"]), past = by(["rejected", "retired"]);
  const [tab, setTab] = useState<Tab>(proposed.length ? "proposed" : "active");
  const retireHints = new Map((reviews[0]?.retire ?? []).map((r) => [r.id, r.why]));

  const act = async (l: Lesson, action: "approve" | "reject" | "retire" | "restore" | "edit", rule?: string) => {
    let reason: string | undefined;
    if (action === "reject" || action === "retire") {
      const r = window.prompt(action === "reject" ? `Reject ${l.id}? Optional reason (the reviewer sees it next time):` : `Retire ${l.id} (remove it from ${l.target}.md)? Optional reason:`, "");
      if (r === null) return;
      reason = r || undefined;
    }
    try {
      const res = await api.lesson(l.id, action, { reason, rule });
      onChange(res.lessons);
      toast(action === "approve" ? `${l.id} is now part of ${l.target}.md` : action === "retire" ? `${l.id} rolled back from ${l.target}.md` : action === "restore" ? `${l.id} restored to ${l.target}.md` : action === "edit" ? `${l.id} saved` : `${l.id} rejected`);
    } catch (e) { toast((e as Error).message); }
  };

  const list = tab === "proposed" ? proposed : tab === "active" ? active : past;
  const activeBy = Object.entries(active.reduce<Record<string, number>>((a, l) => ({ ...a, [l.target]: (a[l.target] ?? 0) + 1 }), {}));
  return (
    <Card>
      <CardHeader className="flex-wrap">
        <CardTitle>Lessons</CardTitle>
        <CardSub>What the reviewer learned, waiting for you. Approved lessons are appended to the prompt they name; max {cap} per prompt. Version {store.version}.</CardSub>
        <div role="tablist" className="ml-auto flex gap-1">
          {([["proposed", `Proposed ${proposed.length}`], ["active", `Active ${active.length}`], ["history", `History ${past.length}`]] as const).map(([k, label]) => (
            <Button key={k} role="tab" aria-selected={tab === k} size="sm" variant={tab === k ? "default" : "ghost"} onClick={() => setTab(k)}>{label}</Button>
          ))}
        </div>
      </CardHeader>
      <CardBody>
        {tab === "active" && activeBy.length > 0 && <div className="flex flex-wrap gap-1.5">{activeBy.map(([t, n]) => <Badge key={t} tone={n >= cap ? "warning" : "neutral"}>{t}.md · {n}/{cap}</Badge>)}</div>}
        {!list.length && <p className="m-0 text-muted-foreground">{tab === "proposed" ? "Nothing waiting. Run the reviewer after a refresh to get proposals." : tab === "active" ? "No active lessons: the prompts are exactly as written." : "No rejected or retired lessons yet."}</p>}
        {list.map((l) => <LessonCard key={l.id} l={l} info={targetInfo[l.target]} hint={retireHints.get(l.id)} onAct={act} replaces={l.replaces ? store.lessons.find((x) => x.id === l.replaces) : undefined} />)}
        {tab === "history" && store.log.length > 0 && (
          <details className="text-[12px] text-muted-foreground"><summary className="cursor-pointer">Change log ({store.log.length})</summary>
            <ul className="m-0 mt-1.5 grid list-disc gap-0.5 pl-5">{[...store.log].reverse().slice(0, 60).map((e, i) => <li key={i}>v{e.version} · {new Date(e.at).toLocaleString()} · {e.action} {e.id}{e.note ? ` (${e.note})` : ""}</li>)}</ul>
          </details>
        )}
      </CardBody>
    </Card>
  );
}

function LessonCard({ l, info, hint, onAct, replaces }: { l: Lesson; info?: string; hint?: string; replaces?: Lesson; onAct: (l: Lesson, a: "approve" | "reject" | "retire" | "restore" | "edit", rule?: string) => void }) {
  const [rule, setRule] = useState(l.rule);
  const edited = rule.trim() !== l.rule;
  return (
    <div className={cn("grid gap-2 rounded-md border p-3", l.status === "active" && "border-success/40", (l.status === "rejected" || l.status === "retired") && "opacity-75")}>
      <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
        <b className="font-mono">{l.id}</b>
        <Badge tone="solid" title={info}>{l.target}.md</Badge>
        <Badge tone={CONF[l.confidence]}>{l.confidence} confidence</Badge>
        <Badge>{l.basis} video{l.basis === 1 ? "" : "s"}</Badge>
        {l.status !== "proposed" && <Badge tone={l.status === "active" ? "success" : "neutral"}>{l.status}</Badge>}
        <span className="ml-auto text-muted-foreground">{l.source ? `${l.source.agent} · ` : ""}{ago(l.decidedAt ?? l.createdAt)}</span>
      </div>
      {l.status === "proposed"
        ? <Textarea aria-label={`Rule for ${l.id}`} value={rule} onChange={(e) => setRule(e.target.value)} rows={2} className="text-[13.5px] font-medium" />
        : <p className="m-0 text-[13.5px] font-medium">{l.rule}</p>}
      {l.why && <p className="m-0 text-[12.5px] text-muted-foreground"><b>Why:</b> {l.why}</p>}
      {l.evidence.length > 0 && (
        <ul className="m-0 grid list-disc gap-0.5 pl-5 text-[12px] text-muted-foreground marker:text-subtle-foreground">
          {l.evidence.map((e, i) => <li key={i}><span className="text-foreground">{e.video}</span>: {e.metric} {e.value}{e.baseline ? ` vs ${e.baseline}` : ""}{e.note ? ` (${e.note})` : ""}</li>)}
        </ul>
      )}
      {l.verify && <p className="m-0 text-[12px] text-muted-foreground"><b>Verify next:</b> {l.verify}</p>}
      {replaces && <p className="m-0 text-[12px] text-warning">Replaces {replaces.id} ({replaces.status}): {replaces.rule}</p>}
      {hint && l.status === "active" && <p className="m-0 text-[12px] text-warning">Latest review suggests retiring this: {hint}</p>}
      {l.reason && <p className="m-0 text-[12px] text-muted-foreground"><b>Your note:</b> {l.reason}</p>}
      <div className="flex flex-wrap gap-1.5">
        {l.status === "proposed" && <>
          <Button size="sm" variant="default" onClick={() => onAct(l, "approve", edited ? rule : undefined)}><Check />Approve{edited ? " edited" : ""}</Button>
          {edited && <Button size="sm" variant="outline" onClick={() => onAct(l, "edit", rule)}>Save edit</Button>}
          <Button size="sm" variant="destructive" onClick={() => onAct(l, "reject")}><X />Reject</Button>
        </>}
        {l.status === "active" && <Button size="sm" variant="destructive" onClick={() => onAct(l, "retire")}><Undo2 />Retire (roll back)</Button>}
        {(l.status === "retired" || l.status === "rejected") && <Button size="sm" variant="outline" onClick={() => onAct(l, "restore")}><RotateCcw />Restore</Button>}
      </div>
    </div>
  );
}
