import { ArrowRight, Clapperboard } from "lucide-react";
import { useApp } from "@/hooks/app";
import { STEPS, stepStates, videoStatus } from "@/lib/steps";
import { dur, money } from "@/lib/utils";
import { StatusDot } from "@/components/Status";
import { Progress9 } from "@/components/LeftPanel";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader, StatCard } from "@/components/ui/layout";

/** Every video, the step it is on, progress, time and cost. A row opens the video where it left off. */
export function OverviewPage() {
  const { list, go, limits } = useApp();
  const totalMs = list.reduce((a, w) => a + w.totals.ms, 0), totalCost = list.reduce((a, w) => a + w.totals.costUsd, 0);
  const running = list.filter((w) => w.running);
  const fiveH = limits?.five_hour?.used_percentage;
  return (
    <div className="mx-auto grid max-w-[1400px] gap-6 px-6 pb-12 pt-6 max-sm:px-4">
      <PageHeader title="Overview" sub="Every video and where it stands. Open one to pick up at its next step." />
      <div className="wg-stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Videos" value={list.length} hint={running.length ? `${running.length} working now` : "none running"} />
        <StatCard label="Recorded time" value={dur(totalMs)} hint="across all runs" />
        <StatCard label="Model cost" value={money(totalCost)} hint="pipeline runs" />
        <StatCard label="5-hour limit" value={fiveH != null ? `${Math.round(fiveH)}%` : "—"} hint={fiveH != null ? "used" : "no reading yet"} />
      </div>

      {list.length === 0 ? (
        <EmptyState icon={<Clapperboard />} title="No videos yet">Use the + next to Videos in the left panel to start one.</EmptyState>
      ) : (
        <div className="overflow-hidden rounded-[10px] border bg-card shadow-sm">
          <div className="hidden grid-cols-[minmax(220px,1.4fr)_minmax(180px,1fr)_minmax(150px,0.8fr)_90px_80px_28px] gap-4 border-b px-5 py-2.5 text-[11px] font-medium text-muted-foreground lg:grid">
            <span>Video</span><span>Progress</span><span>Next</span><span className="text-right">Time</span><span className="text-right">Cost</span><span />
          </div>
          <div className="wg-stagger">
            {list.map((w) => {
              const states = stepStates(w.statuses);
              const cur = STEPS.find((s) => states[s.key] === "next" || states[s.key] === "running");
              const keys = [...STEPS.map((s) => s.key as string), "publish", "shorts"], doneN = keys.filter((k) => w.statuses[k] === "done").length;
              return (
                <button key={w.id} onClick={() => go({ view: "ws", ws: w.id, sec: cur ? "video" : null, step: cur?.key ?? null, act: null, short: null })}
                  className="group grid w-full grid-cols-[1fr_auto_auto] gap-x-4 gap-y-2.5 border-b px-5 py-3.5 text-left max-sm:px-4 outline-none transition-colors last:border-b-0 hover:bg-accent/50 focus-visible:bg-accent/60 lg:grid-cols-[minmax(220px,1.4fr)_minmax(180px,1fr)_minmax(150px,0.8fr)_90px_80px_28px] lg:items-center">
                  <span className="col-span-3 min-w-0 lg:col-span-1">
                    <span className="block truncate text-[13.5px] font-medium">{w.title ?? "No plan yet"}</span>
                    <span className="block truncate font-mono text-[11px] text-subtle-foreground">{w.id}</span>
                  </span>
                  <span className="col-span-3 grid gap-1.5 lg:col-span-1">
                    <Progress9 statuses={w.statuses} className="h-1.5" />
                    <span className="text-[11px] text-subtle-foreground">{doneN} of {keys.length} steps done</span>
                  </span>
                  <span className="flex min-w-0 items-center gap-2 text-[13px]">
                    {w.running ? <Badge tone="warning"><StatusDot s="running" />{w.running.label}</Badge>
                      : cur ? <><span className="size-1.5 shrink-0 rounded-full bg-brand" /><span className="truncate">{cur.label}</span></>
                      : <Badge tone={videoStatus(w.statuses) === "done" ? "success" : "neutral"}>Video done</Badge>}
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground lg:text-right">{dur(w.totals.ms)}</span>
                  <span className="text-xs tabular-nums lg:text-right">{money(w.totals.costUsd)}</span>
                  <ArrowRight className="hidden size-4 text-subtle-foreground opacity-0 transition-[opacity,transform] group-hover:translate-x-0.5 group-hover:opacity-100 lg:block" />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
