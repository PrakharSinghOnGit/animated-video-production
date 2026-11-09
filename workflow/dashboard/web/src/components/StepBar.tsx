import { Check, Loader2, X } from "lucide-react";
import { STEPS, stepStates } from "@/lib/steps";
import { dur, money, cn, STATUS_LABEL } from "@/lib/utils";
import { useApp } from "@/hooks/app";
import type { Details } from "@/lib/types";

/** The step's time and cost so far, or its hint. */
export function stepMeta(k: string, d: Details): string {
  const m = d.meta?.[k];
  return m ? `${dur(m.totalMs)}${m.totalCost ? ` · ${money(m.totalCost)}` : ""}` : "";
}

export function Mark({ st, n }: { st: string; n: number }) {
  return (
    <span className={cn("flex size-[18px] shrink-0 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums ring-1 ring-inset transition-colors",
      st === "done" ? "bg-success/15 text-success ring-success/35" : st === "running" ? "bg-warning/15 text-warning ring-warning/40" : st === "failed" ? "bg-destructive/15 text-destructive ring-destructive/40" : st === "partial" || st === "stale" ? "bg-warning/8 text-warning ring-warning/35" : "text-subtle-foreground ring-border-strong")}>
      {st === "done" ? <Check className="size-2.5" strokeWidth={3} /> : st === "running" ? <Loader2 className="size-2.5 animate-spin" /> : st === "failed" ? <X className="size-2.5" strokeWidth={3} /> : n}
    </span>
  );
}

export interface StepItem { key: string; label: string; st: string; sub?: string; next?: boolean }

/** A stepper: one item per step (state mark, name, a line under it), connected left to right. The video's steps and a short's stages both use it. */
export function Stepper({ items, current, onPick, label }: { items: StepItem[]; current: string; onPick: (k: string) => void; label: string }) {
  const item = "group relative flex min-w-[112px] flex-1 basis-0 flex-col justify-center gap-0.5 px-3 py-2.5 text-left outline-none transition-colors hover:bg-accent/60 focus-visible:bg-accent";
  return (
    <nav aria-label={label} className="flex shrink-0 overflow-x-auto border-b bg-card">
      {items.map((s, i) => {
        const on = current === s.key;
        return (
          <button key={s.key} onClick={() => onPick(s.key)} aria-current={on ? "step" : undefined} title={`${s.label}: ${STATUS_LABEL[s.st] ?? s.st}`} className={item}>
            <span className="flex items-center gap-2">
              <Mark st={s.st} n={i + 1} />
              <span className={cn("truncate text-[13px] font-medium", on ? "text-foreground" : "text-muted-foreground group-hover:text-foreground")}>{s.label}</span>
              {s.next && !on && <span className="size-1.5 shrink-0 rounded-full bg-brand" aria-label="next" />}
            </span>
            {s.sub !== undefined && <span className="truncate pl-[26px] text-[11px] text-subtle-foreground">{s.sub}</span>}
            <span aria-hidden className={cn("absolute inset-x-3 bottom-0 h-[2px] rounded-full transition-colors", on ? "bg-brand" : "bg-transparent")} />
          </button>
        );
      })}
    </nav>
  );
}

/** The video's pipeline stepper: one item per step (state mark, name, time/cost). */
export function StepBar({ current, onPick }: { current: string; onPick: (k: string) => void }) {
  const { d } = useApp();
  if (!d) return null;
  const states = stepStates(d.statuses);
  return <Stepper label="Pipeline steps" current={current} onPick={onPick}
    items={STEPS.map((s) => ({ key: s.key, label: s.label, st: d.statuses[s.key] ?? "none", sub: stepMeta(s.key, d) || s.hint, next: states[s.key] === "next" }))} />;
}
