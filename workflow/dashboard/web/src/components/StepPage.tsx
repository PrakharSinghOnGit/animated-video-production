import { StatusPill } from "@/components/Status";
import { Badge } from "@/components/ui/badge";
import { InfoTip } from "@/components/ui/tooltip";
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
      <header className="border-b bg-card/40 px-6 pb-4 pt-5 max-sm:px-4">
        <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
          <div className="min-w-0 flex-1 basis-80">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="m-0 text-[20px] font-semibold leading-tight tracking-[-0.02em]">{title}</h1>
              {desc && <InfoTip label={`About ${title}`}>{desc}</InfoTip>}
              <StatusPill s={status} />
              {state === "next" && <Badge tone="solid">Next up</Badge>}
              {state !== "done" && state !== "next" && status === "none" && <Badge>{STATE_LABEL[state]}</Badge>}
            </div>
            <p className="m-0 mt-1.5 max-w-3xl text-[13px] text-muted-foreground">{todo}</p>
          </div>
          {stats && <div className="flex flex-wrap items-center gap-x-6 gap-y-2 self-center">{stats}</div>}
          {runAll && <RunAll action={runAll} />}
        </div>
        {runAll && <div className="mt-3"><RunAllChain action={runAll} /></div>}
      </header>
      <div className="wg-enter px-6 pb-12 pt-5 max-sm:px-4">{children}</div>
    </HighlightProvider>
  );
}
