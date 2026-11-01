import { ChevronRight, Check, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { ChainLink, Job } from "@/lib/types";

/** "runs: A -> B -> C" for a master button; while it runs the same chips show done / current / waiting, with a progress bar. */
export function MasterChain({ chain, job }: { chain: ChainLink[]; job?: Job | null }) {
  const n = job?.cmdCount ?? chain.length;
  const idx = job ? job.cmdIndex : -1;
  // a chain whose commands are not 1:1 with the job's commands (e.g. "author each act") only shows the bar
  const mapped = job ? job.cmdCount === chain.length : false;
  return (
    <div className="grid gap-1.5 px-3 pb-2" aria-label="Runs these steps">
      <div className="flex flex-wrap items-center gap-1 text-[11px]">
        <span className="mr-1 text-subtle-foreground">Runs</span>
        {chain.map((c, i) => {
          const state = !job ? "idle" : !mapped ? "idle" : i < idx ? "done" : i === idx ? "now" : "wait";
          return (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="size-3 text-subtle-foreground/70" />}
              <span className={cn("inline-flex h-5 items-center gap-1 rounded-[5px] px-1.5 ring-1 ring-inset transition-colors", state === "idle" && "bg-muted ring-border text-muted-foreground", state === "done" && "ring-success/30 bg-success/10 text-success", state === "now" && "ring-warning/40 bg-warning/10 text-warning", state === "wait" && "ring-border text-subtle-foreground")}>
                {state === "done" && <Check className="size-3" />}
                {state === "now" && <Loader2 className="size-3 animate-spin" />}
                {c.label}
                
              </span>
            </span>
          );
        })}
      </div>
      {job && (
        <div className="flex items-center gap-2">
          <Progress className="flex-1" value={((idx + (job.status === "done" ? 1 : 0.5)) / Math.max(1, n)) * 100} />
          <span className="font-mono text-[11px] text-muted-foreground">{Math.min(idx + 1, n)}/{n}</span>
        </div>
      )}
    </div>
  );
}
