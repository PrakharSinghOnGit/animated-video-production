import { useApp } from "@/hooks/app";
import { BlockFold } from "@/components/Flow";
import { Badge } from "@/components/ui/badge";
import type { SeamRow } from "@/lib/types";

const FLAG = {
  ok: ["success", "smooth"],
  flicker: ["danger", "flicker"],
  jump: ["warning", "jump"],
  empty: ["warning", "empty screen"],
} as const;
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/**
 * Render → Seams between acts: how each cut is handled (who owns it, which transition) and the four frames around it.
 * Flagged seams open by default; the note says what the check saw, so it can go straight into an act's notes.
 */
export function SeamsPanel() {
  const { d, file } = useApp();
  const r = d?.render.seams;
  if (!r) return <div className="text-xs text-muted-foreground">No seam plan yet: run <b>Seams</b> (the draft and final renders run it too).</div>;
  const bad = r.seams.filter((x) => x.flag && x.flag !== "ok");
  const row = (x: SeamRow) => {
    const [tone, label] = FLAG[x.flag ?? "ok"];
    return (
      <BlockFold key={`${x.a}-${x.b}`} defaultOpen={x.flag !== undefined && x.flag !== "ok"}
        title={<span className="flex flex-wrap items-center gap-2"><span className="font-mono text-[12px]">{x.a} → {x.b}</span><span className="text-muted-foreground">{clock(x.atS)}</span><span>{x.kind}</span><Badge tone={tone}>{label}</Badge></span>}>
        <div className="grid gap-1.5 pb-2 text-[12px]">
          <div className="text-muted-foreground">{x.how}{x.note ? <> · <span className="text-foreground">{x.note}</span></> : null}</div>
          <img src={`${file(x.strip)}&v=${r.mtime}`} alt={`Frames around the ${x.a} → ${x.b} cut`} className="w-full rounded border border-border" loading="lazy" />
          {x.d && <div className="text-[11px] text-subtle-foreground">change per frame: before {x.d[0]} · at the cut {x.d[1]} · after {x.d[2]} (0-255)</div>}
        </div>
      </BlockFold>
    );
  };
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">{r.seams.length} cuts · checked {new Date(r.at).toLocaleString()}</span>
        {bad.length ? <Badge tone="warning">{bad.length} to look at</Badge> : <Badge tone="success">every cut is smooth</Badge>}
      </div>
      <div className="grid">{r.seams.map(row)}</div>
    </div>
  );
}
