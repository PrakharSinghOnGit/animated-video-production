import { useEffect, useState } from "react";
import { Check, RefreshCw, Undo2, Wrench, X } from "lucide-react";
import { useApp } from "@/hooks/app";
import { api } from "@/lib/api";
import { BlockFold } from "@/components/Flow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect, Textarea } from "@/components/ui/fields";
import type { SeamRow } from "@/lib/types";

const FLAG = {
  ok: ["success", "smooth"],
  flicker: ["danger", "flicker"],
  jump: ["warning", "jump"],
  empty: ["warning", "empty screen"],
} as const;
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const SIDE = { A_end: "end of", B_start: "start of", both: "both" } as const;
/** your mark, unless the seam changed since */
const mine = (x: SeamRow) => (x.mark && !x.mark.stale ? x.mark : undefined);

/**
 * Render → Seams between acts: every cut with a short clip to watch. You mark each one fine or not fine (with a note
 * on what's wrong and which side to fix); "Fix N marked" sends each not-fine cut to a fresh author with your note,
 * then re-checks it. The frame check (flicker / jump / empty) is a free hint; the AI review is optional (Seams option).
 */
export function SeamsPanel() {
  const { d, file, run, canRun } = useApp();
  const r = d?.render.seams;
  if (!r) return <div className="text-xs text-muted-foreground">No clips yet: run <b>Seams</b> to render a short clip of every cut between acts, then watch each one and mark it fine or not fine.</div>;
  const fine = r.seams.filter((x) => mine(x)?.ok).length;
  const notFine = r.seams.filter((x) => mine(x) && !mine(x)!.ok);
  const left = r.seams.length - fine - notFine.length;
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">{r.seams.length} cuts · clips from {new Date(r.at).toLocaleString()}</span>
        <Badge tone="success">{fine} fine</Badge>
        {notFine.length > 0 && <Badge tone="danger">{notFine.length} not fine</Badge>}
        {left > 0 && <Badge>{left} to watch</Badge>}
        <Button size="sm" variant="default" className="ml-auto" disabled={!notFine.length || !canRun("render.seamfixmarked")} onClick={() => void run("render.seamfixmarked")}
          title="One fix round per cut you marked not fine (your note, the side you picked), then each is checked again">
          <Wrench />Fix {notFine.length || ""} marked{notFine.length ? ` (${notFine.map((x) => `${x.a}→${x.b}`).join(", ")})` : ""}
        </Button>
      </div>
      <div className="grid">{r.seams.map((x) => <Seam key={`${x.a}-${x.b}`} x={x} v={r.mtime} file={file} run={run} free={canRun("render.seamfix", x.a)} />)}</div>
    </div>
  );
}

function Seam({ x, v, file, run, free }: { x: SeamRow; v: number; file: (rel: string) => string; run: (key: string, act?: string, opts?: Record<string, unknown>) => Promise<void>; free: boolean }) {
  const { ws, refresh, toast } = useApp();
  const m = mine(x);
  const [note, setNote] = useState(m?.note ?? "");
  const [side, setSide] = useState<string>(m?.side ?? "both");
  useEffect(() => { setNote(m?.note ?? ""); setSide(m?.side ?? "both"); }, [m?.at]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [tone, label] = FLAG[x.flag ?? "ok"];
  const rv = x.review;
  const mark = async (ok: boolean | null) => {
    if (!ws) return;
    try { await api.seamMark(ws, `${x.a}-${x.b}`, ok === null ? null : { ok, note, side }); await refresh(); }
    catch (e) { toast((e as Error).message); }
  };
  return (
    <BlockFold defaultOpen={!m?.ok}
      title={<span className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[12px]">{x.a} → {x.b}</span><span className="text-muted-foreground">{clock(x.atS)}</span><span>{x.kind}</span>
        {m ? <Badge tone={m.ok ? "success" : "danger"}>{m.ok ? "fine" : "not fine"}</Badge> : x.mark?.stale ? <Badge tone="warning">changed since you marked it</Badge> : <Badge>not watched</Badge>}
        {x.flag && x.flag !== "ok" && <Badge tone={tone}>{label}</Badge>}
        {rv && <Badge tone={rv.score >= 8 ? "success" : rv.score >= 6 ? "warning" : "danger"}>AI {rv.score}/10</Badge>}
      </span>}>
      <div className="grid gap-2 pb-3 text-[12px]">
        <div className="text-muted-foreground">{x.how}{x.note ? <> · <span className="text-foreground">{x.note}</span></> : null}</div>
        {x.clip ? <video src={`${file(x.clip)}&v=${v}`} controls loop muted playsInline preload="metadata" className="w-full max-w-[720px] rounded border border-border bg-black" />
          : <img src={`${file(x.wide ?? x.strip)}&v=${v}`} alt={`Frames around the ${x.a} → ${x.b} cut`} className="w-full max-w-[720px] rounded border border-border" loading="lazy" />}
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant={m?.ok ? "default" : "outline"} onClick={() => void mark(true)}><Check />Fine</Button>
          <Button size="sm" variant={m && !m.ok ? "destructive" : "outline"} onClick={() => void mark(false)} title="Marks it for Fix marked (saves the note and side below)"><X />Not fine</Button>
          {x.mark && <Button size="sm" variant="ghost" onClick={() => void mark(null)}><Undo2 />Clear</Button>}
          <Button size="sm" variant="ghost" className="ml-auto" disabled={!free} onClick={() => void run("render.seamcheck", x.a)} title="Render this cut's clip again"><RefreshCw />Re-render clip</Button>
        </div>
        {!m?.ok && (
          <div className="grid gap-1.5 rounded-md border p-2">
            <Textarea aria-label={`What is wrong with the ${x.a} → ${x.b} transition`} value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => { if (m && !m.ok && note !== m.note) void mark(false); }} rows={2}
              placeholder="What's wrong (goes to the fixer): e.g. the chart slides off while the next title is already in, labels overlap at the cut" />
            <div className="flex flex-wrap items-center gap-1.5">
              <NativeSelect aria-label="Which side to fix" value={side} onChange={(e) => { setSide(e.target.value); if (m && !m.ok) void api.seamMark(ws!, `${x.a}-${x.b}`, { ok: false, note, side: e.target.value }).then(refresh); }} className="w-auto text-xs">
                <option value="both">Fix: both sides</option>
                <option value="a">Fix: end of {x.a}</option>
                <option value="b">Fix: start of {x.b}</option>
              </NativeSelect>
              <Button size="sm" variant="outline" disabled={!free} onClick={() => void run("render.seamfix", x.a, { notes: note.replace(/\s+/g, " ").trim().slice(0, 1500), side })}><Wrench />Fix just this one</Button>
            </div>
          </div>
        )}
        {rv && (
          <BlockFold title={<span className="text-muted-foreground">AI review ({rv.model ?? "critic"}): {rv.summary}</span>}>
            {rv.issues.length > 0 && <ul className="m-0 grid list-disc gap-0.5 pl-5 text-muted-foreground">
              {rv.issues.map((i, k) => <li key={k}><span className="text-foreground">{i.side === "both" ? "both sides" : `${SIDE[i.side]} ${i.side === "A_end" ? x.a : x.b}`}:</span> {i.problem}{i.fix ? <> → {i.fix}</> : null}</li>)}
            </ul>}
          </BlockFold>
        )}
        {x.clip && <BlockFold title={<span className="text-muted-foreground">frames around the cut</span>}><img src={`${file(x.wide ?? x.strip)}&v=${v}`} alt={`Frames around the ${x.a} → ${x.b} cut`} className="w-full rounded border border-border" loading="lazy" /></BlockFold>}
      </div>
    </BlockFold>
  );
}
