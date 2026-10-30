import { useState } from "react";
import { BarChart3, Cpu, LayoutDashboard, PanelLeftClose, PanelLeftOpen, Plus, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/fields";
import { Tip } from "@/components/ui/tooltip";
import { StatusDot } from "@/components/Status";
import { useApp } from "@/hooks/app";
import { api } from "@/lib/api";
import { cn, dur, money, shortId } from "@/lib/utils";
import type { View } from "@/hooks/useRoute";

const STEP_KEYS = ["script", "voice", "align", "plan", "acts", "sound", "render", "publish", "shorts"];
const NAV: { v: View; label: string; icon: typeof Cpu }[] = [{ v: "overview", label: "Overview", icon: LayoutDashboard }, { v: "usage", label: "Claude usage", icon: BarChart3 }, { v: "machine", label: "Machine", icon: Cpu }];

const Head = ({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) => (
  <div className="flex items-center justify-between px-3 pb-1 pt-3.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><span>{children}</span>{right}</div>
);

/** Nav, workspace list, new video, Settings pinned at the bottom. `rail` = collapsed icon rail. */
export function LeftPanel({ rail, onPick, onExpand, onCollapse }: { rail?: boolean; onPick?: () => void; onExpand?: () => void; onCollapse?: () => void }) {
  const { route, go, ws, list, toast, reloadList } = useApp();
  const [id, setId] = useState("");
  const [bad, setBad] = useState(false);
  const pick = (p: Parameters<typeof go>[0]) => { go(p); onPick?.(); };

  const create = async () => {
    const v = id.trim();
    if (!/^VID\d+_[A-Za-z0-9_]+$/.test(v)) { setBad(true); toast("Use VID<number>_<Name>, e.g. VID03_Debt_Spiral"); return; }
    setBad(false);
    try {
      await api.createWorkspace(v);
      toast(`Creating ${v}…`); setId("");
      setTimeout(async () => { await reloadList(); go({ view: "ws", ws: v, sec: "video", step: "script", act: null, short: null }); }, 2500);
    } catch (e) { toast((e as Error).message); }
  };

  const navBtn = (v: View, label: string, Icon: typeof Cpu) => {
    const on = route.view === v;
    const b = (
      <button key={v} onClick={() => pick({ view: v })} aria-current={on} aria-label={label}
        className={cn("flex items-center gap-2.5 text-left text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground", rail ? "size-9 justify-center self-center rounded-md" : "min-h-9 w-full border-l-2 border-transparent px-3 max-md:min-h-11", on && "bg-accent text-foreground", on && !rail && "border-l-brand")}>
        <Icon className="size-4 shrink-0" />{!rail && label}
      </button>
    );
    return rail ? <Tip key={v} label={label} side="right">{b}</Tip> : b;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {onCollapse && (
        <div className={cn("flex shrink-0 p-1", rail ? "justify-center" : "justify-end")}>
          <Tip label={rail ? "Expand panel" : "Collapse panel"} side="right">
            <Button variant="ghost" size="icon" className="size-8" onClick={rail ? onExpand : onCollapse} aria-label={rail ? "Expand left panel" : "Collapse left panel"}>{rail ? <PanelLeftOpen /> : <PanelLeftClose />}</Button>
          </Tip>
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className={cn("flex flex-col", rail && "gap-1")}>{NAV.map((n) => navBtn(n.v, n.label, n.icon))}</div>
        {!rail && <Head right={<span className="font-normal">{list.length}</span>}>Workspace</Head>}
        <div className={cn(rail && "mt-2 flex flex-col items-center gap-1 border-t pt-2")}>
          {list.map((w) => {
            const on = w.id === ws && route.view === "ws";
            if (rail) {
              return (
                <Tip key={w.id} label={`${w.id}${w.title ? ` · ${w.title}` : ""}`} side="right">
                  <button onClick={() => pick({ view: "ws", ws: w.id, sec: null, act: null, step: null, short: null })} aria-label={w.id} className={cn("relative flex size-9 items-center justify-center rounded-md font-mono text-[11px] hover:bg-accent", on && "bg-accent")}>
                    {shortId(w.id).replace("VID", "")}{w.running && <StatusDot s="running" className="absolute right-1 top-1" />}
                  </button>
                </Tip>
              );
            }
            return (
              <button key={w.id} onClick={() => pick({ view: "ws", ws: w.id, sec: null, act: null, step: null, short: null })} aria-current={on}
                className={cn("grid min-h-14 w-full gap-1 border-l-2 border-transparent px-3 py-2 text-left text-muted-foreground hover:bg-accent hover:text-foreground", on && "border-l-brand bg-accent text-foreground")}>
                <span className="truncate font-mono text-xs text-foreground">{w.id}</span>
                {w.title && <span className="truncate text-xs">{w.title}</span>}
                <span className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span className="flex gap-[3px]">{STEP_KEYS.map((k) => <StatusDot key={k} s={w.statuses[k]} />)}</span>
                  <span className="min-w-0 truncate">{w.running ? <span className="text-warning">{w.running.label}</span> : `${dur(w.totals.ms)} · ${money(w.totals.costUsd)}`}</span>
                </span>
              </button>
            );
          })}
        </div>
        {rail ? (
          <div className="mt-2 flex justify-center"><Tip label="New video" side="right"><Button variant="ghost" size="icon" onClick={onExpand} aria-label="New video"><Plus /></Button></Tip></div>
        ) : (
          <div className="grid gap-1.5 px-3 py-3">
            <div className="flex gap-1.5">
              <Input value={id} onChange={(e) => setId(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} placeholder="VID03_Short_Name" spellCheck={false} autoComplete="off" aria-label="New video id" aria-invalid={bad} className={cn("min-w-0 flex-1", bad && "border-destructive")} />
              <Button onClick={create}>Add</Button>
            </div>
            <div className="text-[11px] text-muted-foreground">Letters, digits, underscores after <code>VIDn_</code>.</div>
          </div>
        )}
      </div>
      <div className={cn("shrink-0 border-t py-1", rail && "flex justify-center")}>{navBtn("settings", "Settings", Settings)}</div>
    </div>
  );
}
