import { STATE_LABEL, STEPS, stepStates } from "@/lib/steps";
import { dur, money, cn, STATUS_LABEL } from "@/lib/utils";
import { StatusDot } from "@/components/Status";
import { useApp } from "@/hooks/app";
import type { Details } from "@/lib/types";

/** The pipeline step bar from the original dashboard: step buttons left to right, each with status and a line of detail. */
export function stepMeta(k: string, d: Details): string {
  const m = d.meta?.[k];
  return m ? `${dur(m.totalMs)}${m.totalCost ? ` · ${money(m.totalCost)}` : ""}` : "";
}

export function StepBar({ current, onPick }: { current: string; onPick: (k: string) => void }) {
  const { d } = useApp();
  if (!d) return null;
  const states = stepStates(d.statuses);
  return (
    <nav aria-label="Pipeline steps" className="flex shrink-0 overflow-x-auto border-b bg-card">
      {STEPS.map((s, i) => {
        const st = d.statuses[s.key] ?? "none", state = states[s.key], on = current === s.key;
        return (
          <button key={s.key} onClick={() => onPick(s.key)} aria-current={on ? "step" : undefined}
            className={cn("flex min-h-[58px] min-w-[92px] flex-1 basis-0 flex-col items-start gap-0.5 border-b-2 border-r border-b-transparent px-2.5 py-2 text-left text-muted-foreground hover:bg-accent hover:text-foreground", on && "border-b-brand bg-background text-foreground")}>
            <span className="flex items-center gap-1.5 whitespace-nowrap text-[11px] text-muted-foreground">
              <StatusDot s={st} />{i + 1} · {STATUS_LABEL[st]}
            </span>
            <span className="flex items-center gap-1.5 text-[13px] font-semibold">{s.label}{state === "next" && <span className="rounded bg-brand px-1 text-[10px] font-semibold uppercase leading-4 text-background">{STATE_LABEL.next}</span>}</span>
            <span className="w-full truncate text-[11px] text-muted-foreground">{stepMeta(s.key, d) || s.hint}</span>
          </button>
        );
      })}
      <button onClick={() => onPick("runs")} aria-current={current === "runs" ? "step" : undefined}
        className={cn("flex min-h-[58px] min-w-[92px] flex-1 basis-0 flex-col items-start gap-0.5 border-b-2 border-b-transparent px-2.5 py-2 text-left text-muted-foreground hover:bg-accent hover:text-foreground", current === "runs" && "border-b-brand bg-background text-foreground")}>
        <span className="text-[11px] text-muted-foreground">{STEPS.length + 1} · History</span>
        <span className="text-[13px] font-semibold">Runs</span>
        <span className="text-[11px] text-muted-foreground">{dur(d.totals.ms)} · {money(d.totals.costUsd)}</span>
      </button>
    </nav>
  );
}
