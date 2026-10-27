import { useApp } from "@/hooks/app";
import { STEPS, stepStates } from "@/lib/steps";
import { dur, money, cn, STATUS_LABEL } from "@/lib/utils";
import { StatusDot } from "@/components/Status";
import { StatTile } from "@/components/StatTile";
import { Badge } from "@/components/ui/badge";

/** Every video, the step it is on, progress dots, time and cost. */
export function OverviewPage() {
  const { list, go, limits } = useApp();
  const totalMs = list.reduce((a, w) => a + w.totals.ms, 0), totalCost = list.reduce((a, w) => a + w.totals.costUsd, 0);
  return (
    <div className="p-4 pb-10">
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        <div className="min-w-0 flex-1 basis-60"><h1 className="m-0 text-lg font-semibold tracking-tight">Overview</h1><p className="m-0 mt-1 text-xs text-muted-foreground">Every video and the step it is on. Open one to continue where it left off.</p></div>
        <StatTile align="left" value={list.length} label="videos" />
        <StatTile align="left" value={dur(totalMs)} label="recorded time" />
        <StatTile align="left" value={money(totalCost)} label="Claude cost" />
        {limits?.five_hour && <StatTile align="left" value={`${Math.round(limits.five_hour.used_percentage)}%`} label="5 h limit used" />}
      </div>
      <div className="mt-4 overflow-hidden rounded-lg border">
        <div className="hidden grid-cols-[minmax(170px,1.2fr)_minmax(220px,2fr)_150px_84px_72px] gap-3 border-b bg-card px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground lg:grid">
          <span>Video</span><span>Progress</span><span>On step</span><span className="text-right">Time</span><span className="text-right">Cost</span>
        </div>
        {list.map((w) => {
          const states = stepStates(w.statuses);
          const cur = STEPS.find((s) => states[s.key] === "next" || states[s.key] === "running");
          const done = !cur;
          return (
            <button key={w.id} onClick={() => go({ view: "ws", ws: w.id, step: cur?.key ?? "render", act: null })}
              className="grid w-full gap-x-3 gap-y-2 border-b bg-background px-3.5 py-3 text-left last:border-b-0 hover:bg-accent lg:grid-cols-[minmax(170px,1.2fr)_minmax(220px,2fr)_150px_84px_72px] lg:items-center">
              <span className="min-w-0"><span className="block truncate font-mono text-xs">{w.id}</span><span className="block truncate text-[13px] text-muted-foreground">{w.title ?? "No plan yet"}</span></span>
              <span className="flex flex-wrap gap-x-3 gap-y-1">
                {STEPS.map((s) => (
                  <span key={s.key} className={cn("flex items-center gap-1.5 text-[11px]", states[s.key] === "next" || states[s.key] === "running" ? "font-semibold text-foreground" : "text-muted-foreground")} title={`${s.label}: ${STATUS_LABEL[w.statuses[s.key] ?? "none"]}`}>
                    <StatusDot s={w.statuses[s.key]} />{s.label}
                  </span>
                ))}
              </span>
              <span className="flex items-center gap-2 text-[13px]">
                {w.running ? <Badge tone="warning"><StatusDot s="running" />{w.running.label}</Badge> : done ? <Badge tone="success">All steps done</Badge> : <><Badge tone="solid">Next</Badge>{cur!.label}</>}
              </span>
              <span className="text-xs text-muted-foreground lg:text-right">{dur(w.totals.ms)}</span>
              <span className="text-xs lg:text-right">{money(w.totals.costUsd)}</span>
            </button>
          );
        })}
        {list.length === 0 && <div className="p-6 text-center text-muted-foreground">No videos yet. Add one in the left panel.</div>}
      </div>
    </div>
  );
}
