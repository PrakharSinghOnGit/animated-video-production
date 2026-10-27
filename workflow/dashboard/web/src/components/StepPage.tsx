import { StatusPill } from "@/components/Status";
import { Badge } from "@/components/ui/badge";
import { RunAll, RunAllChain } from "@/components/RunAll";
import { HighlightProvider } from "@/components/highlight";
import { STATE_LABEL, type StepState } from "@/lib/steps";
import type { St } from "@/lib/types";

/** A step as its own page: header (state, what is left, stats, fixed Run all) then the flow of its sub-steps. */
export function StepPage({ title, desc, status, state, todo, stats, runAll, children }: {
  title: string; desc: string; status: St; state: StepState; todo: string; stats?: React.ReactNode; runAll?: string; children: React.ReactNode;
}) {
  return (
    <HighlightProvider>
      <header className="border-b px-4 py-3">
        <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1 basis-80">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="m-0 text-lg font-semibold tracking-tight">{title}</h1>
              <StatusPill s={status} />
              {state !== "done" && <Badge tone={state === "next" ? "solid" : "neutral"}>{state === "next" ? "Next up" : STATE_LABEL[state]}</Badge>}
            </div>
            <p className="m-0 mt-1 text-[13px]">{todo}</p>
            <p className="m-0 mt-1 hidden max-w-4xl text-xs leading-relaxed text-muted-foreground lg:block">{desc}</p>
          </div>
          {stats && <div className="flex flex-wrap gap-x-5 gap-y-1">{stats}</div>}
          {runAll && <RunAll action={runAll} />}
        </div>
        {runAll && <div className="mt-1 px-3"><RunAllChain action={runAll} /></div>}
      </header>
      <div className="p-4 pb-10">{children}</div>
    </HighlightProvider>
  );
}
