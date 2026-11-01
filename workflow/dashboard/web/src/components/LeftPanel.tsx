import { useState } from "react";
import { BarChart3, Cpu, LayoutDashboard, PanelLeftClose, PanelLeftOpen, Plus, Settings, TrendingUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/fields";
import { Tip } from "@/components/ui/tooltip";
import { StatusDot } from "@/components/Status";
import { useApp } from "@/hooks/app";
import { api } from "@/lib/api";
import { cn, dur, money, shortId, STATUS_LABEL } from "@/lib/utils";
import type { View } from "@/hooks/useRoute";

const STEP_KEYS = ["script", "voice", "align", "plan", "acts", "sound", "render", "publish", "shorts"];
const NAV: { v: View; label: string; icon: typeof Cpu }[] = [
  { v: "overview", label: "Overview", icon: LayoutDashboard }, { v: "analytics", label: "Analytics", icon: TrendingUp },
  { v: "usage", label: "Usage", icon: BarChart3 }, { v: "machine", label: "Machine", icon: Cpu },
];
const SEG: Record<string, string> = { done: "bg-success", running: "bg-warning pulse", partial: "bg-warning/60", stale: "bg-warning/60", failed: "bg-destructive", none: "bg-border-strong" };

/** Nine thin segments, one per pipeline step: where a video stands at a glance. */
export function Progress9({ statuses, className }: { statuses: Record<string, string>; className?: string }) {
  return (
    <span className={cn("flex h-1 gap-[2px]", className)} aria-label={`${STEP_KEYS.filter((k) => statuses[k] === "done").length} of ${STEP_KEYS.length} steps done`}>
      {STEP_KEYS.map((k) => <span key={k} title={`${k}: ${STATUS_LABEL[statuses[k] ?? "none"]}`} className={cn("h-full flex-1 rounded-full", SEG[statuses[k] ?? "none"] ?? SEG.none)} />)}
    </span>
  );
}

/** Nav, workspace list, new video, Settings pinned at the bottom. `rail` = collapsed icon rail. */
export function LeftPanel({ rail, onPick, onExpand, onCollapse }: { rail?: boolean; onPick?: () => void; onExpand?: () => void; onCollapse?: () => void }) {
  const { route, go, ws, list, toast, reloadList } = useApp();
  const [id, setId] = useState("");
  const [adding, setAdding] = useState(false);
  const [bad, setBad] = useState(false);
  const pick = (p: Parameters<typeof go>[0]) => { go(p); onPick?.(); };

  const create = async () => {
    const v = id.trim();
    if (!/^VID\d+_[A-Za-z0-9_]+$/.test(v)) { setBad(true); toast("Use VID<number>_<Name>, e.g. VID04_Debt_Spiral"); return; }
    setBad(false);
    try {
      await api.createWorkspace(v);
      toast(`Creating ${v}…`); setId(""); setAdding(false);
      setTimeout(async () => { await reloadList(); go({ view: "ws", ws: v, sec: "video", step: "script", act: null, short: null }); }, 2500);
    } catch (e) { toast((e as Error).message); }
  };

  const navBtn = (v: View, label: string, Icon: typeof Cpu) => {
    const on = route.view === v;
    const b = (
      <button key={v} onClick={() => pick({ view: v, yt: null })} aria-current={on ? "page" : undefined} aria-label={label}
        className={cn("group flex items-center gap-2.5 rounded-md text-left text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60",
          rail ? "size-9 justify-center self-center" : "h-8 w-full px-2.5 max-md:h-11",
          on ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground")}>
        <Icon className={cn("size-4 shrink-0", on ? "text-brand" : "text-subtle-foreground group-hover:text-muted-foreground")} />{!rail && label}
      </button>
    );
    return rail ? <Tip key={v} label={label} side="right">{b}</Tip> : b;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className={cn("flex flex-col gap-0.5 p-2", rail && "items-center gap-1")}>{NAV.map((n) => navBtn(n.v, n.label, n.icon))}</div>

        {!rail && (
          <div className="flex h-8 items-center justify-between px-4 pt-3">
            <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-subtle-foreground">Videos <span className="ml-1 tabular-nums">{list.length}</span></span>
            <Tip label={adding ? "Cancel" : "New video"} side="right">
              <Button variant="ghost" size="icon" className="-mr-1.5 size-6 max-md:size-9" onClick={() => setAdding(!adding)} aria-label={adding ? "Cancel new video" : "New video"}>{adding ? <X className="size-3.5" /> : <Plus className="size-3.5" />}</Button>
            </Tip>
          </div>
        )}
        {!rail && adding && (
          <div className="wg-enter grid gap-1.5 px-3 pb-2 pt-1">
            <Input autoFocus value={id} onChange={(e) => { setId(e.target.value); setBad(false); }} onKeyDown={(e) => { if (e.key === "Enter") void create(); if (e.key === "Escape") setAdding(false); }}
              placeholder="VID04_Short_Name" spellCheck={false} autoComplete="off" aria-label="New video id" aria-invalid={bad} className={cn("font-mono text-xs", bad && "border-destructive")} />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-subtle-foreground">Press Enter to create</span>
              <Button size="sm" variant="default" onClick={create} disabled={!id.trim()}>Create</Button>
            </div>
          </div>
        )}

        <div className={cn("flex flex-col gap-0.5 px-2 pb-2", rail && "mt-2 items-center gap-1 border-t pt-2")}>
          {list.map((w) => {
            const on = w.id === ws && route.view === "ws";
            const open = () => pick({ view: "ws", ws: w.id, sec: null, act: null, step: null, short: null });
            if (rail) {
              return (
                <Tip key={w.id} label={`${w.id}${w.title ? ` · ${w.title}` : ""}`} side="right">
                  <button onClick={open} aria-label={w.id} className={cn("relative flex size-9 items-center justify-center rounded-md font-mono text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground", on && "bg-accent text-foreground")}>
                    {shortId(w.id).replace("VID", "")}{w.running && <StatusDot s="running" className="absolute right-1 top-1" />}
                  </button>
                </Tip>
              );
            }
            return (
              <button key={w.id} onClick={open} aria-current={on ? "page" : undefined}
                className={cn("group grid w-full min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5 rounded-md px-2.5 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60", on ? "bg-accent" : "hover:bg-accent/60")}>
                <span className="flex items-baseline justify-between gap-2">
                  <span className={cn("min-w-0 truncate text-[13px] font-medium", on ? "text-foreground" : "text-foreground/90")}>{w.title ?? w.id.replace(/^VID\d+_/, "").replace(/_/g, " ")}</span>
                  <span className="shrink-0 font-mono text-[10.5px] text-subtle-foreground">{shortId(w.id)}</span>
                </span>
                <Progress9 statuses={w.statuses} />
                <span className="flex items-center justify-between gap-2 text-[11px] text-subtle-foreground">
                  {w.running ? <span className="flex min-w-0 items-center gap-1.5 text-warning"><StatusDot s="running" /><span className="truncate">{w.running.label}</span></span> : <span className="tabular-nums">{dur(w.totals.ms)}</span>}
                  <span className="tabular-nums">{money(w.totals.costUsd)}</span>
                </span>
              </button>
            );
          })}
        </div>
        {rail && <div className="mt-1 flex justify-center"><Tip label="New video" side="right"><Button variant="ghost" size="icon" onClick={() => { onExpand?.(); setAdding(true); }} aria-label="New video"><Plus /></Button></Tip></div>}
      </div>
      <div className={cn("flex shrink-0 items-center gap-1 border-t p-2", rail && "flex-col")}>
        <div className="min-w-0 flex-1">{navBtn("settings", "Settings", Settings)}</div>
        {onCollapse && (
          <Tip label={rail ? "Expand panel" : "Collapse panel"} side="right">
            <Button variant="ghost" size="icon" className="size-8" onClick={rail ? onExpand : onCollapse} aria-label={rail ? "Expand left panel" : "Collapse left panel"}>{rail ? <PanelLeftOpen /> : <PanelLeftClose />}</Button>
          </Tip>
        )}
      </div>
    </div>
  );
}
