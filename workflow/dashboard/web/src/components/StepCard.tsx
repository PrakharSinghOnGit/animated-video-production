import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatusPill } from "@/components/Status";
import { cn } from "@/lib/utils";
import { STATE_LABEL, type StepState } from "@/lib/steps";
import type { St } from "@/lib/types";

const STATE_TONE = { done: "success", running: "warning", next: "solid", todo: "warning", blocked: "neutral" } as const;

/** One pipeline step as a section: number, state (done / next / blocked / todo), what is left to do, then its actions and outputs. */
export function StepCard({ id, index, title, desc, status, state, todo, stats, open, onToggle, children }: {
  id: string; index: number; title: string; desc: string; status: St; state: StepState; todo: string; stats?: React.ReactNode; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  const next = state === "next" || state === "running";
  return (
    <section
      id={`step-${id}`}
      data-state={state}
      className={cn("scroll-mt-3 rounded-xl border bg-card transition-colors", next && "border-brand/70 ring-1 ring-brand/40", state === "blocked" && "opacity-80")}
    >
      <header className="flex flex-wrap items-start gap-x-3 gap-y-2 p-3.5 md:p-4">
        <button onClick={onToggle} aria-expanded={open} aria-label={`${open ? "Collapse" : "Expand"} ${title}`} className="flex min-w-0 flex-1 basis-60 items-start gap-3 text-left">
          <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold", next ? "border-brand bg-brand text-background" : state === "done" ? "border-success/50 text-success" : "text-muted-foreground")}>{index}</span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <h2 className="m-0 text-[17px] font-semibold tracking-tight">{title}</h2>
              {state !== "done" && <Badge tone={STATE_TONE[state]}>{state === "next" ? "Next up" : STATE_LABEL[state]}</Badge>}
              <StatusPill s={status} />
            </span>
            <span className={cn("mt-1 block text-[13px]", next ? "text-foreground" : "text-muted-foreground")}>{todo}</span>
          </span>
          <ChevronDown className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
        {stats && <div className="flex flex-wrap gap-x-4 gap-y-1 max-sm:w-full">{stats}</div>}
      </header>
      {open && (
        <div className="grid gap-3.5 border-t p-3.5 md:p-4">
          <p className="m-0 max-w-3xl text-xs leading-relaxed text-muted-foreground">{desc}</p>
          {children}
        </div>
      )}
    </section>
  );
}
