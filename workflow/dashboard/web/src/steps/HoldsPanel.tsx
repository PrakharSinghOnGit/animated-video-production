import { useEffect, useMemo, useState } from "react";
import { Inbox, Plus, X } from "lucide-react";
import { useApp } from "@/hooks/app";
import { useRunWith } from "@/hooks/useRunSaved";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { HoldItem, HoldPoints } from "@/lib/types";
import { BlockFold } from "@/components/Flow";
import { DataTable, Td } from "@/components/DataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, NativeSelect } from "@/components/ui/fields";

const STATUS = {
  applied: ["success", "in the voice"],
  waiting: ["warning", "waiting: Apply pauses"],
  failed: ["danger", "not applied"],
  off: ["neutral", "off"],
} as const;
const sec = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const newId = () => Math.random().toString(36).slice(2, 10);

/**
 * Align → Pauses for the picture. A pause can only go where a speaker would stop (a sentence or phrase end, or around a
 * joining word) AND where the take is silent (no breath, no word tail): those places are the "+" marks in the text.
 * Directors and act authors ask for pauses too ("Collect"); you decide which are on and how long they are.
 */
export function HoldsPanel() {
  const { d, ws, refresh, toast, canRun } = useApp();
  const runWith = useRunWith();
  const h = d?.align.holds;
  const [list, setList] = useState<HoldItem[]>(h?.holds ?? []);
  const [dirty, setDirty] = useState(0);
  const [pts, setPts] = useState<HoldPoints | null>(null);
  const [act, setAct] = useState("all");
  useEffect(() => { if (!dirty) setList(h?.holds ?? []); }, [h?.holds, dirty]);
  useEffect(() => {
    if (!dirty || !ws) return;
    const t = setTimeout(async () => { try { await api.saveHolds(ws, list); setDirty(0); await refresh(); } catch (e) { toast((e as Error).message); } }, 500);
    return () => clearTimeout(t);
  }, [dirty, list, ws, refresh, toast]);
  // the picker's text and points (refetched after each scan)
  useEffect(() => { if (ws && h?.scannedAt) api.holdPoints(ws).then(setPts).catch(() => setPts(null)); }, [ws, h?.scannedAt]);

  const acts = d?.acts ?? [];
  const actOf = (startS: number) => acts.find((a) => startS * 1000 >= a.start - 300 && startS * 1000 < a.end - 300)?.id ?? "";
  const groups = useMemo(() => {
    const g = new Map<string, NonNullable<HoldPoints>["sections"]>();
    for (const s of pts?.sections ?? []) { const a = actOf(s.startS) || "—"; g.set(a, [...(g.get(a) ?? []), s]); }
    return [...g.entries()];
  }, [pts, acts]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d || !ws || !h) return null;

  const update = (n: HoldItem[]) => { setList(n); setDirty((x) => x + 1); };
  const at = (section: string, after: number | "end") => list.find((x) => x.section === section && x.after === after);
  const toggleAt = (section: string, after: number | "end", word: string, next: string | undefined, startS: number) => {
    const ex = at(section, after);
    if (ex) update(list.filter((x) => x !== ex));
    else update([...list, { id: newId(), section, after, word, next, ms: 800, on: true, by: "you", act: actOf(startS) || undefined, status: "waiting" }]);
  };
  const on = list.filter((x) => x.on), waiting = list.some((x) => x.on && x.status !== "applied") || h.dirty || !!dirty;
  const shown = act === "all" ? groups : groups.filter(([a]) => a === act);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">{on.length} pause{on.length === 1 ? "" : "s"} on · {sec(on.reduce((n, x) => n + x.ms, 0))} in total · {sec(h.addedMs)} in the voice now</span>
        {waiting ? <Badge tone="warning">changes waiting: run Apply pauses</Badge> : on.length > 0 && <Badge tone="success">voice matches this list</Badge>}
        {h.planShift && h.planShift.changed && !h.planShift.baseSame && <Badge tone="danger">the voice itself changed too: plan times not moved (re-plan or approve)</Badge>}
        {h.pending > 0 && (
          <Button size="sm" variant="secondary" disabled={!canRun("align.holdsImport")} onClick={() => void runWith("align.holdsImport")}>
            <Inbox />Collect {h.pending} request{h.pending > 1 ? "s" : ""} from the plan and authors
          </Button>
        )}
      </div>

      {list.length > 0 && (
        <DataTable head={[{ label: "On" }, { label: "Where" }, { label: "Pause" }, { label: "Asked by" }, { label: "Status" }, { label: "" }]}>
          {list.map((x, i) => {
            const [tone, label] = STATUS[x.on ? (x.status ?? "waiting") : "off"];
            return (
              <tr key={x.id} className={cn(!x.on && "text-muted-foreground")}>
                <Td><Checkbox checked={x.on} onCheckedChange={(v) => update(list.map((y, j) => (j === i ? { ...y, on: v === true, status: "waiting" } : y)))} aria-label="Pause on" /></Td>
                <Td className="min-w-[220px]">
                  <span className="font-mono text-[11px] text-subtle-foreground">{x.act ?? ""} </span>
                  {x.after === "end" ? <>after “<b>{x.word}</b>” <span className="text-subtle-foreground">(end of a script block)</span></> : <>“…<b>{x.word}</b>” ‖ “{x.next}…”</>}
                  {x.note && <div className="text-[11px] text-subtle-foreground">{x.note}</div>}
                </Td>
                <Td>
                  <span className="flex items-center gap-1.5">
                    <Input type="number" className="!h-7 w-20" min={0.1} max={4} step={0.1} value={(x.ms / 1000).toFixed(1)} aria-label="Pause length in seconds"
                      onChange={(e) => { const v = Math.round(Math.min(4, Math.max(0.1, parseFloat(e.target.value) || 0.1)) * 1000); update(list.map((y, j) => (j === i ? { ...y, ms: v, status: "waiting" } : y))); }} />
                    <span className="text-xs text-muted-foreground">s</span>
                  </span>
                </Td>
                <Td className="max-w-[260px] text-[12px]">{x.by}{x.why && <div className="text-[11px] text-muted-foreground">{x.why}</div>}</Td>
                <Td><Badge tone={tone}>{label}</Badge>{x.status === "failed" && x.failWhy && <div className="max-w-[220px] text-[11px] text-destructive">{x.failWhy}</div>}</Td>
                <Td><Button size="sm" variant="ghost" aria-label="Remove pause" onClick={() => update(list.filter((_, j) => j !== i))}><X /></Button></Td>
              </tr>
            );
          })}
        </DataTable>
      )}

      <BlockFold defaultOpen={list.length === 0} title="Add a pause: pick a place in the narration">
        <div className="grid gap-2.5 pb-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-muted-foreground">
            <span><span className="mr-1 inline-flex size-4 items-center justify-center rounded-full border border-success/50 text-success"><Plus className="size-2.5" /></span>a pause can go here (phrase end, silent take)</span>
            <span><span className="mr-1 inline-block size-1.5 rounded-full bg-muted-foreground/40 align-middle" />phrase end, but a breath or sound is there: a cut would be heard</span>
            <span className="ml-auto flex items-center gap-1.5">Act
              <NativeSelect className="!h-7 w-28 text-xs" value={act} onChange={(e) => setAct(e.target.value)}>
                <option value="all">all</option>{groups.map(([a]) => <option key={a} value={a}>{a}</option>)}
              </NativeSelect>
            </span>
          </div>
          {!pts?.sections.length && <div className="text-xs text-muted-foreground">No pause points yet: run <b>Find pause points</b> (part of Align all).
            <Button size="sm" variant="ghost" disabled={!canRun("align.holdsScan")} onClick={() => void runWith("align.holdsScan")}>Find pause points</Button></div>}
          {shown.map(([a, secs]) => (
            <div key={a} className="grid gap-1">
              <div className="text-xs font-semibold">{a}{acts.find((x) => x.id === a) ? ` · ${acts.find((x) => x.id === a)!.title}` : ""}</div>
              <p className="m-0 text-[13px] leading-[2.1]">
                {secs.map((s, si) => (
                  <span key={s.id}>
                    {s.words.map((w, i) => {
                      const p = s.points.find((q) => q.after === i), held = at(s.id, i);
                      return (
                        <span key={i}>
                          {w}
                          {p && (p.clean || held ? (
                            <button type="button" onClick={() => toggleAt(s.id, i, p.word, p.next, s.startS)} title={held ? "Remove this pause" : `Add a pause here (${p.why})`}
                              className={cn("mx-0.5 inline-flex h-4 items-center justify-center rounded-full border align-middle text-[10px] leading-none", held ? "border-brand bg-brand px-1.5 font-semibold text-brand-foreground" : "w-4 border-success/50 text-success hover:bg-success/15")}>
                              {held ? `+${sec(held.ms)}` : <Plus className="size-2.5" />}
                            </button>
                          ) : <span title="A breath or sound sits here: a cut would be heard" className="mx-0.5 inline-block size-1.5 rounded-full bg-muted-foreground/40 align-middle" />)}{" "}
                        </span>
                      );
                    })}
                    {si < secs.length - 1 || a !== groups[groups.length - 1]?.[0] ? (() => {
                      const held = at(s.id, "end");
                      return (
                        <button type="button" onClick={() => toggleAt(s.id, "end", s.words[s.words.length - 1] ?? "", undefined, s.startS)} title={held ? "Remove this pause" : "Add a pause after this script block"}
                          className={cn("mx-0.5 inline-flex h-4 items-center justify-center rounded-full border align-middle text-[10px] leading-none", held ? "border-brand bg-brand px-1.5 font-semibold text-brand-foreground" : "w-4 border-success/50 text-success hover:bg-success/15")}>
                          {held ? `+${sec(held.ms)}` : <Plus className="size-2.5" />}
                        </button>
                      );
                    })() : null}{" "}
                  </span>
                ))}
              </p>
            </div>
          ))}
        </div>
      </BlockFold>
      <span className="text-[11px] text-subtle-foreground">Apply pauses re-merges the voice with them, re-runs transcribe, master and captions, then moves the plan's act and beat times so each pause belongs to the act before it. Acts time their hits from words, so they keep working; render their frames again to use the room.</span>
    </div>
  );
}
