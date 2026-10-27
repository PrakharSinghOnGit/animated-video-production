import { useLayoutEffect, useRef, useState } from "react";
import { Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Fold } from "@/components/ui/collapsible";
import { RunButton } from "@/components/RunButton";
import { StatusDot } from "@/components/Status";
import { ActionCard } from "@/components/ActionCard";
import { useHighlight } from "@/components/highlight";
import { useApp } from "@/hooks/app";
import { useRunSaved } from "@/hooks/useRunSaved";
import { costOf, lastRun, type BlockStatus } from "@/lib/flow";
import { useMedia } from "@/lib/storage";
import { ago, cn, dur, money } from "@/lib/utils";

export interface BlockDef {
  id: string;
  title: string;
  desc?: string;
  /** schema action key whose Run button this block carries */
  action?: string;
  act?: string;
  /** job label the dashboard records for this action ("Write script", "Author A01") */
  label?: string;
  done: boolean;
  /** mtime of the block's output: a failed run older than it is not shown as failed */
  outAt?: number;
  costRe?: RegExp | null;
  /** extra note shown under the title (e.g. what is missing) */
  note?: string;
  hint?: string;
  children?: React.ReactNode;
  /** options of the action (collapsed) */
  options?: boolean;
}
export interface LoopDef { from: string; to: string; label: string; ran: number }

const STATUS_TXT: Record<BlockStatus, string> = { done: "Done", running: "Running", failed: "Failed", todo: "To do" };
const TONE = { done: "success", running: "warning", failed: "danger", todo: "neutral" } as const;

function useStatus(b: BlockDef): { status: BlockStatus; last: ReturnType<typeof lastRun>; cost: ReturnType<typeof costOf> } {
  const { d, busy } = useApp();
  const last = d && b.label ? lastRun(d, b.label) : null;
  const running = !!b.label && busy?.label === b.label;
  const failed = !!last && last.status !== "done" && (!b.outAt || last.end > b.outAt);
  const status: BlockStatus = running ? "running" : failed ? "failed" : b.done ? "done" : "todo";
  return { status, last, cost: d ? costOf(d, b.costRe ?? null) : null };
}

function Block({ b, index }: { b: BlockDef; index: number }) {
  const { schema, busy } = useApp();
  const { hot } = useHighlight();
  const runSaved = useRunSaved();
  const { status, last, cost } = useStatus(b);
  const a = b.action ? schema[b.action] : undefined;
  const lit = !!b.action && hot.has(b.action);
  return (
    <div data-block={b.id} data-status={status} className={cn("rounded-lg border bg-card transition-shadow", status === "running" && "border-warning/60", status === "failed" && "border-destructive/50", lit && "border-brand ring-2 ring-brand/50")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3.5 py-2.5">
        <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold", status === "done" ? "border-success/50 text-success" : status === "running" ? "border-warning bg-warning/15 text-warning" : status === "failed" ? "border-destructive/60 text-destructive" : "text-muted-foreground")}>{index + 1}</span>
        <div className="min-w-0 flex-1 basis-48">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="m-0 text-[14px] font-semibold tracking-tight">{b.title}</h3>
            <Badge tone={TONE[status]}><StatusDot s={status === "todo" ? "none" : status} />{STATUS_TXT[status]}</Badge>
            {a && (a.paid ? <Badge tone="warning">Paid · {a.paid}</Badge> : <Badge tone="success">Free</Badge>)}
            {a?.chain && <Badge tone="neutral"><Layers className="size-3" />Chain</Badge>}
          </div>
          {(b.desc || a?.help) && <p className="m-0 mt-0.5 text-xs text-muted-foreground">{b.desc ?? a?.help}</p>}
        </div>
        <div className="flex items-center gap-3 text-[11.5px] text-muted-foreground max-sm:order-3 max-sm:w-full">
          {last ? <span>last run {ago(last.end)} · {dur(last.ms)}</span> : <span>never run here</span>}
          {cost && cost.cost > 0 && <span className="text-foreground/80">{money(cost.cost)}</span>}
        </div>
        {b.action && <RunButton primary={!a?.paid} running={status === "running"} disabled={!!busy} onClick={() => runSaved(b.action!, b.act)} />}
      </div>
      {b.note && <div className="px-3.5 pb-2 text-xs text-warning">{b.note}</div>}
      {b.action && a && a.opts.length > 0 && b.options !== false && <div className="border-t"><ActionCard bare id={b.action} act={b.act} hint={b.hint} /></div>}
      {b.children && <div className="grid gap-3 border-t p-3.5">{b.children}</div>}
    </div>
  );
}

/**
 * Sub-steps as blocks top to bottom with SVG connectors in a left gutter: a down arrow between consecutive blocks and
 * loop-back arrows going up for review gates that can send work back. A loop is drawn solid in the brand colour when
 * the job history shows it ran (ran > 0), dashed and muted otherwise.
 */
export function Flow({ blocks, loops = [] }: { blocks: BlockDef[]; loops?: LoopDef[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Record<string, { top: number; h: number }>>({});
  const [height, setHeight] = useState(0);
  const loopSlots = loops.length;
  const narrow = useMedia("(max-width: 639px)");
  const slot = narrow ? 9 : 16;
  const G = (narrow ? 22 : 34) + loopSlots * slot;

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const next: Record<string, { top: number; h: number }> = {};
      el.querySelectorAll<HTMLElement>(":scope > div > [data-block]").forEach((n) => { next[n.dataset.block!] = { top: (n.parentElement as HTMLElement).offsetTop, h: n.offsetHeight }; });
      setPos((p) => (JSON.stringify(p) === JSON.stringify(next) ? p : next));
      setHeight(el.offsetHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    el.querySelectorAll("[data-block]").forEach((n) => ro.observe(n));
    return () => ro.disconnect();
  }, [blocks.length, loopSlots]);

  const ids = blocks.map((b) => b.id);
  const ax = G - (narrow ? 9 : 14);
  return (
    <div ref={box} className="relative grid gap-6" style={{ paddingLeft: G }}>
      <svg aria-hidden className="pointer-events-none absolute left-0 top-0 overflow-visible" width={G} height={height || 1}>
        <defs>
          {[["m", "var(--muted-foreground)"], ["b", "var(--brand)"]].map(([k, c]) => (
            <marker key={k} id={`wg-arrow-${k}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 z" fill={c} /></marker>
          ))}
        </defs>
        {ids.slice(0, -1).map((id, i) => {
          const a = pos[id], b = pos[ids[i + 1]];
          if (!a || !b) return null;
          return <line key={id} x1={ax} y1={a.top + a.h} x2={ax} y2={b.top - 1} stroke="var(--muted-foreground)" strokeOpacity={0.7} strokeWidth={1.5} markerEnd="url(#wg-arrow-m)" />;
        })}
        {loops.map((l, k) => {
          const f = pos[l.from], t = pos[l.to];
          if (!f || !t) return null;
          const x = 6 + k * slot, y1 = f.top + 22, y2 = t.top + 22, on = l.ran > 0, c = on ? "var(--brand)" : "var(--muted-foreground)";
          return (
            <g key={l.from + l.to} opacity={on ? 1 : 0.6}>
              <title>{`${l.label}${on ? ` · ran ${l.ran}×` : " · has not run"}`}</title>
              <path d={`M ${G + 1} ${y1} H ${x + 6} a 6 6 0 0 1 -6 -6 V ${y2 + 6} a 6 6 0 0 1 6 -6 H ${G - 2}`} fill="none" stroke={c} strokeWidth={on ? 2 : 1.5} strokeDasharray={on ? undefined : "4 3"} markerEnd={`url(#wg-arrow-${on ? "b" : "m"})`} />
              <text transform={`translate(${x - 3} ${(y1 + y2) / 2}) rotate(-90)`} textAnchor="middle" fontSize="10" fill={c} className="max-sm:hidden">{l.label}{on ? ` ×${l.ran}` : ""}</text>
            </g>
          );
        })}
      </svg>
      {blocks.map((b, i) => <div key={b.id}><Block b={b} index={i} /></div>)}
    </div>
  );
}

/** Folded extra detail inside a block (long lists, per-section players). */
export { Fold as BlockFold };
