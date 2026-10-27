import { Check } from "lucide-react";
import { useApp } from "@/hooks/app";
import { gotoStep, STATE_LABEL, STEPS, stepStates } from "@/lib/steps";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

/** Left-to-right pipeline: each step with its state; click scrolls the page to that step. */
export function StepBar() {
  const { d, go } = useApp();
  const states = stepStates(d?.statuses);
  const done = STEPS.filter((s) => states[s.key] === "done").length;
  return (
    <nav aria-label="Pipeline steps" className="shrink-0 border-b bg-card">
      <div className="flex overflow-x-auto">
        {STEPS.map((s, i) => {
          const st = states[s.key];
          const hot = st === "next" || st === "running";
          return (
            <button key={s.key} onClick={() => { go({ step: s.key }); gotoStep(s.key); }}
              className={cn("relative flex min-h-12 min-w-[104px] flex-1 flex-col items-start justify-center gap-0.5 border-r px-3 py-1.5 text-left last:border-r-0 hover:bg-accent", hot && "bg-brand/10")}>
              <span className={cn("flex items-center gap-1.5 text-[11px]", hot ? "font-semibold text-brand" : st === "done" ? "text-success" : "text-muted-foreground")}>
                {st === "done" ? <Check className="size-3" strokeWidth={3} /> : <span className={cn("inline-block size-2 rounded-full border-[1.5px]", hot ? "border-brand bg-brand" : "border-muted-foreground/60", st === "running" && "pulse")} />}
                {i + 1} · {STATE_LABEL[st]}
              </span>
              <span className="text-[13px] font-semibold">{s.label}</span>
              {hot && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-brand" />}
            </button>
          );
        })}
      </div>
      <Progress className="h-0.5 rounded-none" tone="success" value={(done / STEPS.length) * 100} />
    </nav>
  );
}
