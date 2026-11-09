import { useState } from "react";
import { RefreshCw, Wrench } from "lucide-react";
import { useApp } from "@/hooks/app";
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
const needsWork = (x: SeamRow) => (x.flag !== undefined && x.flag !== "ok") || x.review?.verdict === "fix";

/**
 * Render → Seams between acts: each cut with a clip of the transition to watch, the frames around it, the frame check
 * and the vision review (score + which side is broken). Fix transition sends the end of A and/or the start of B to a
 * fresh author with the review's issues and your note, then checks the seam again; Re-check redoes just this seam.
 */
export function SeamsPanel() {
  const { d, file, run, canRun } = useApp();
  const r = d?.render.seams;
  if (!r) return <div className="text-xs text-muted-foreground">No seam check yet: run <b>Seams</b> (the draft and final renders run it too). Each cut gets a clip, its frames and a review.</div>;
  const bad = r.seams.filter(needsWork);
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">{r.seams.length} cuts · checked {new Date(r.at).toLocaleString()}</span>
        {bad.length ? <Badge tone="warning">{bad.length} to look at</Badge> : <Badge tone="success">every cut looks smooth</Badge>}
      </div>
      <div className="grid">{r.seams.map((x) => <Seam key={`${x.a}-${x.b}`} x={x} v={r.mtime} file={file} run={run} free={canRun("render.seamfix", x.a)} />)}</div>
    </div>
  );
}

function Seam({ x, v, file, run, free }: { x: SeamRow; v: number; file: (rel: string) => string; run: (key: string, act?: string, opts?: Record<string, unknown>) => Promise<void>; free: boolean }) {
  const [note, setNote] = useState("");
  const [side, setSide] = useState("auto");
  const [tone, label] = FLAG[x.flag ?? "ok"];
  const rv = x.review;
  return (
    <BlockFold defaultOpen={needsWork(x)}
      title={<span className="flex flex-wrap items-center gap-2"><span className="font-mono text-[12px]">{x.a} → {x.b}</span><span className="text-muted-foreground">{clock(x.atS)}</span><span>{x.kind}</span><Badge tone={tone}>{label}</Badge>{rv && <Badge tone={rv.score >= 8 ? "success" : rv.score >= 6 ? "warning" : "danger"}>{rv.score}/10</Badge>}</span>}>
      <div className="grid gap-2 pb-3 text-[12px]">
        <div className="text-muted-foreground">{x.how}{x.note ? <> · <span className="text-foreground">{x.note}</span></> : null}</div>
        {x.clip && <video src={`${file(x.clip)}&v=${v}`} controls loop muted playsInline preload="metadata" className="w-full max-w-[720px] rounded border border-border bg-black" />}
        <img src={`${file(x.wide ?? x.strip)}&v=${v}`} alt={`Frames around the ${x.a} → ${x.b} cut`} className="w-full rounded border border-border" loading="lazy" />
        {rv && (
          <div className="grid gap-1">
            <div><b>Review</b> <span className="text-muted-foreground">({rv.model ?? "critic"})</span>: {rv.summary}</div>
            {rv.issues.length > 0 && <ul className="m-0 grid list-disc gap-0.5 pl-5 text-muted-foreground">
              {rv.issues.map((i, k) => <li key={k}><span className="text-foreground">{i.side === "both" ? "both sides" : `${SIDE[i.side]} ${i.side === "A_end" ? x.a : x.b}`}:</span> {i.problem}{i.fix ? <> → {i.fix}</> : null}</li>)}
            </ul>}
          </div>
        )}
        {x.d && <div className="text-[11px] text-subtle-foreground">change per frame: before {x.d[0]} · at the cut {x.d[1]} · after {x.d[2]} (0-255)</div>}
        <Textarea aria-label={`Your note on the ${x.a} → ${x.b} transition`} value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Your note (optional, goes first): e.g. the last frame should be clear and settled, no labels half off-screen" />
        <div className="flex flex-wrap items-center gap-1.5">
          <NativeSelect aria-label="Which side to fix" value={side} onChange={(e) => setSide(e.target.value)} className="w-auto text-xs">
            <option value="auto">Fix: the side the review blamed</option>
            <option value="a">Fix: end of {x.a}</option>
            <option value="b">Fix: start of {x.b}</option>
            <option value="both">Fix: both</option>
          </NativeSelect>
          <Button size="sm" variant="default" disabled={!free} onClick={() => void run("render.seamfix", x.a, { notes: note.replace(/\s+/g, " ").trim().slice(0, 1500), side })}><Wrench />Fix transition</Button>
          <Button size="sm" variant="outline" disabled={!free} onClick={() => void run("render.seamcheck", x.a)}><RefreshCw />Re-check</Button>
        </div>
      </div>
    </BlockFold>
  );
}
