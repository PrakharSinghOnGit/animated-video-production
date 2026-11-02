import { useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronDown, Layers, Loader2, X } from "lucide-react";
import { InfoTip } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Fold } from "@/components/ui/collapsible";
import { RunButton } from "@/components/RunButton";
import { ActionCard } from "@/components/ActionCard";
import { useHighlight } from "@/components/highlight";
import { useApp } from "@/hooks/app";
import { useRunSaved } from "@/hooks/useRunSaved";
import { costOf, lastRun, type BlockStatus } from "@/lib/flow";
import { blockStatus, type BlockSpec, type LoopDef } from "@/lib/pipeline";
import { useMedia, useStored } from "@/lib/storage";
import { ago, cn, dur, money } from "@/lib/utils";

export type { LoopDef };
export interface BlockDef extends BlockSpec { children?: React.ReactNode; aside?: React.ReactNode }
/** Attach each block's content (by block id) to the shared spec; `asides` go to the right of the block's title (gate buttons). */
export const withKids = (blocks: BlockSpec[], kids: Record<string, React.ReactNode>, asides: Record<string, React.ReactNode> = {}): BlockDef[] =>
  blocks.map((b) => ({ ...b, children: kids[b.id], aside: asides[b.id] }));


function useStatus(b: BlockSpec): { status: BlockStatus; last: ReturnType<typeof lastRun>; cost: ReturnType<typeof costOf> } {
  const { d } = useApp();
  const last = d && b.label ? lastRun(d, b.label) : null;
  return { status: blockStatus(d, b), last, cost: d ? costOf(d, b.costRe ?? null) : null };
}

function StepMark({ status, index }: { status: BlockStatus; index: number }) {
  return (
    <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums ring-1 ring-inset",
      status === "done" ? "bg-success/12 text-success ring-success/30" : status === "running" ? "bg-warning/12 text-warning ring-warning/40" : status === "failed" ? "bg-destructive/12 text-destructive ring-destructive/35" : "bg-raised text-muted-foreground ring-border-strong")}>
      {status === "done" ? <Check className="size-3.5" strokeWidth={2.5} /> : status === "running" ? <Loader2 className="size-3.5 animate-spin" /> : status === "failed" ? <X className="size-3.5" strokeWidth={2.5} /> : index + 1}
    </span>
  );
}

function Block({ b, index }: { b: BlockDef; index: number }) {
  const { schema, canRun, ws } = useApp();
  const { hot } = useHighlight();
  const runSaved = useRunSaved();
  const { status, last, cost } = useStatus(b);
  const a = b.action ? schema[b.action] : undefined;
  const lit = !!b.action && hot.has(b.action);
  const hasOpts = !!(b.action && a && a.opts.length > 0 && b.options !== false);
  const hasBody = hasOpts || !!b.children;
  const [open, setOpen] = useStored<boolean>(`block.${ws}.${b.id}${b.act ? `.${b.act}` : ""}`, true);
  const info = b.desc ?? a?.help;
  return (
    <div data-block={b.id} data-status={status}
      className={cn("rounded-[10px] border bg-card shadow-sm transition-[border-color,box-shadow] duration-200", status === "running" && "border-warning/50", status === "failed" && "border-destructive/45", lit && "border-brand/70 ring-[3px] ring-brand/15")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 max-sm:px-3">
        <StepMark status={status} index={index} />
        <div className="min-w-0 flex-1 basis-48">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            {hasBody
              ? <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="group -ml-1 flex items-center gap-1 rounded px-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/60">
                  <h3 className="m-0 text-[13.5px] font-semibold tracking-[-0.01em]">{b.title}</h3>
                  <ChevronDown className={cn("size-3.5 text-subtle-foreground transition-transform duration-200 group-hover:text-foreground", !open && "-rotate-90")} />
                </button>
              : <h3 className="m-0 text-[13.5px] font-semibold tracking-[-0.01em]">{b.title}</h3>}
            {info && <InfoTip>{info}</InfoTip>}
            {status === "failed" && <Badge tone="danger">Failed</Badge>}
            {a?.paid && <Badge tone="neutral" title="Calls Claude">{a.paid}</Badge>}
            {a?.chain && <Badge tone="neutral"><Layers className="size-3" />Chain</Badge>}
          </div>
          {(last || (cost && cost.cost > 0)) && (
            <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11.5px] text-subtle-foreground">
              {last && <span>Ran {ago(last.end)} · {dur(last.ms)}</span>}
              {cost && cost.cost > 0 && <span>{money(cost.cost)} spent</span>}
            </div>
          )}
        </div>
        {b.aside && <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{b.aside}</div>}
        {b.action && <RunButton running={status === "running"} disabled={!canRun(b.action, b.act)} onClick={() => runSaved(b.action!, b.act)} />}
      </div>
      {b.note && <div className="-mt-1 px-4 pb-3 pl-[52px] text-xs text-warning">{b.note}</div>}
      {hasBody && open && (
        <div className="wg-enter">
          {hasOpts && <div className="border-t px-1"><ActionCard bare id={b.action!} act={b.act} hint={b.hint} /></div>}
          {b.children && <div className="grid gap-3 border-t p-4 max-sm:p-2.5">{b.children}</div>}
        </div>
      )}
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
    <div ref={box} className="relative grid gap-5" style={{ paddingLeft: G }}>
      <svg aria-hidden className="pointer-events-none absolute left-0 top-0 overflow-visible" width={G} height={height || 1}>
        <defs>
          {[["m", "var(--border-strong)"], ["b", "var(--brand)"]].map(([k, c]) => (
            <marker key={k} id={`wg-arrow-${k}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 z" fill={c} /></marker>
          ))}
        </defs>
        {ids.slice(0, -1).map((id, i) => {
          const a = pos[id], b = pos[ids[i + 1]];
          if (!a || !b) return null;
          return <line key={id} x1={ax} y1={a.top + a.h} x2={ax} y2={b.top - 1} stroke="var(--border-strong)" strokeWidth={1.5} markerEnd="url(#wg-arrow-m)" />;
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
