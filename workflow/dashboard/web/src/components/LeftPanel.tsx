import { useState } from "react";
import { BarChart3, Cpu, LayoutList, PanelLeftClose, PanelLeftOpen, Plus, Square, SquareArrowOutUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/fields";
import { Tip } from "@/components/ui/tooltip";
import { StatusDot } from "@/components/Status";
import { useApp } from "@/hooks/app";
import { api } from "@/lib/api";
import { cn, dur, money, shortId } from "@/lib/utils";
import type { View } from "@/hooks/useRoute";

const STEP_KEYS = ["script", "voice", "align", "plan", "acts", "sound", "render"];
const VIEWS: { v: View; label: string; icon: typeof Cpu }[] = [{ v: "ws", label: "Workspace", icon: LayoutList }, { v: "usage", label: "Claude usage", icon: BarChart3 }, { v: "machine", label: "Machine", icon: Cpu }];

const Head = ({ children }: { children: React.ReactNode }) => <div className="px-3 pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</div>;

/** Views, videos, new video, Remotion Studio. `rail` = collapsed icon rail (desktop). */
export function LeftPanel({ rail, onPick, onExpand }: { rail?: boolean; onPick?: () => void; onExpand?: () => void }) {
  const { route, go, ws, list, studio, toast, reloadList } = useApp();
  const [id, setId] = useState("");
  const [bad, setBad] = useState(false);

  const create = async () => {
    const v = id.trim();
    if (!/^VID\d+_[A-Za-z0-9_]+$/.test(v)) { setBad(true); toast("Use VID<number>_<Name>, e.g. VID03_Debt_Spiral"); return; }
    setBad(false);
    try {
      await api.createWorkspace(v);
      toast(`Creating ${v}…`); setId("");
      setTimeout(async () => { await reloadList(); go({ view: "ws", ws: v, step: "script", act: null }); }, 2500);
    } catch (e) { toast((e as Error).message); }
  };
  const pick = (p: Parameters<typeof go>[0]) => { go(p); onPick?.(); };

  const studioMine = studio?.running;
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {!rail && <Head>Views</Head>}
      <div className={cn(rail && "flex flex-col items-center gap-1 pt-2")}>
        {VIEWS.map(({ v, label, icon: Icon }) => {
          const on = route.view === v;
          const b = (
            <button key={v} onClick={() => pick({ view: v })} aria-current={on} aria-label={label}
              className={cn("flex items-center gap-2.5 text-left text-muted-foreground hover:bg-accent hover:text-foreground", rail ? "size-10 justify-center rounded-md" : "min-h-10 w-full border-l-2 border-transparent px-3", on && "bg-accent text-foreground", on && !rail && "border-l-brand")}>
              <Icon className="size-4" />{!rail && label}
            </button>
          );
          return rail ? <Tip key={v} label={label} side="right">{b}</Tip> : b;
        })}
      </div>
      {!rail && <Head>Videos <span className="font-normal">{list.length}</span></Head>}
      <div className={cn(rail && "mt-2 flex flex-col items-center gap-1 border-t pt-2")}>
        {list.map((w) => {
          const on = w.id === ws && route.view === "ws";
          if (rail) {
            return (
              <Tip key={w.id} label={`${w.id}${w.title ? ` · ${w.title}` : ""}`} side="right">
                <button onClick={() => pick({ view: "ws", ws: w.id, act: null })} aria-label={w.id} className={cn("relative flex size-10 items-center justify-center rounded-md font-mono text-[11px] hover:bg-accent", on && "bg-accent")}>
                  {shortId(w.id).replace("VID", "")}
                  {w.running && <StatusDot s="running" className="absolute right-1 top-1" />}
                </button>
              </Tip>
            );
          }
          return (
            <button key={w.id} onClick={() => pick({ view: "ws", ws: w.id, act: null })} aria-current={on}
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
        <div className="mt-2 flex justify-center border-t pt-2"><Tip label="New video: expand the panel" side="right"><Button variant="ghost" size="icon" onClick={onExpand} aria-label="New video"><Plus /></Button></Tip></div>
      ) : (
        <>
          <Head>New video</Head>
          <div className="grid gap-1.5 px-3 pb-3">
            <Input value={id} onChange={(e) => setId(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} placeholder="VID03_Short_Name" spellCheck={false} autoComplete="off" aria-invalid={bad} className={cn(bad && "border-destructive")} />
            <Button onClick={create}>Create workspace</Button>
            <div className="text-[11.5px] text-muted-foreground">Letters, digits and underscores after <code>VIDn_</code>.</div>
          </div>
          <Head>Remotion Studio</Head>
          <div className="mb-4 grid gap-1.5 px-3">
            {studioMine ? (
              <>
                <div className="text-xs text-muted-foreground">Running for <span className="font-mono text-foreground">{studio!.ws}</span></div>
                <div className="flex gap-2">
                  {studio!.url ? <Button size="sm" asChild><a href={studio!.url} target="_blank" rel="noopener"><SquareArrowOutUpRight />Open</a></Button> : <span className="self-center text-xs text-muted-foreground">starting…</span>}
                  <Button size="sm" variant="destructive" onClick={() => api.stopStudio().then(() => setTimeout(reloadList, 800)).catch((e) => toast(e.message))}><Square />Stop</Button>
                </div>
              </>
            ) : (
              <Button disabled={!ws} onClick={() => ws && api.startStudio(ws).then(() => { toast("Starting Remotion Studio…"); setTimeout(reloadList, 1500); }).catch((e) => toast(e.message))}>Open in Remotion Studio</Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function LeftCollapseButton({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <div className={cn("flex shrink-0 border-b p-1", collapsed ? "justify-center" : "justify-end")}>
      <Tip label={collapsed ? "Expand panel" : "Collapse panel"} side="right">
        <Button variant="ghost" size="icon" onClick={onToggle} aria-label={collapsed ? "Expand left panel" : "Collapse left panel"}>{collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</Button>
      </Tip>
    </div>
  );
}
