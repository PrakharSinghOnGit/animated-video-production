import { useState } from "react";
import { BarChart3, Cpu, LayoutDashboard, Lightbulb, MessageSquare, PanelLeftClose, PanelLeftOpen, Plus, Settings, TrendingUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/fields";
import { Tip } from "@/components/ui/tooltip";
import { StatusDot } from "@/components/Status";
import { useApp } from "@/hooks/app";
import { api } from "@/lib/api";
import { cn, dur, money, shortId, STATUS_LABEL } from "@/lib/utils";
import type { View } from "@/hooks/useRoute";
import type { Published } from "@/lib/types";

const STEP_KEYS = ["script", "voice", "align", "plan", "acts", "sound", "render", "publish", "shorts"];
const NAV: { v: View; label: string; icon: typeof Cpu }[] = [
  { v: "overview", label: "Overview", icon: LayoutDashboard }, { v: "ideas", label: "Ideas", icon: Lightbulb }, { v: "analytics", label: "Analytics", icon: TrendingUp }, { v: "comments", label: "Comments", icon: MessageSquare },
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

/** A shorts project's bar, like a video's: one segment per stage (script approved … exported), done when every short has
 *  done it, half-lit when some have. Hover a segment for the count. */
function ShortsBar({ stages }: { stages: { key: string; label: string; done: number; total: number }[] }) {
  const total = stages[0]?.total ?? 0;
  return (
    <span className="flex h-1 gap-[2px]" aria-label={total ? `${stages.at(-1)?.done ?? 0} of ${total} shorts exported` : "no shorts yet"}>
      {stages.map((s) => {
        const st = s.total && s.done === s.total ? "done" : s.done ? "partial" : "none";
        return <span key={s.key} title={total ? `${s.label}: ${s.done}/${s.total} shorts` : `${s.label}: no shorts yet`} className={cn("h-full flex-1 rounded-full", SEG[st])} />;
      })}
    </span>
  );
}

/** A published video's line in the list: the upload's views, CTR and average viewed (from the last analytics refresh). */
function PublishedLine({ p }: { p: Published }) {
  // the snapshot keeps CTR as a fraction and average viewed as a percentage
  const pct = (x: number | null, scale: number, d: number) => (x == null ? "—" : `${(x * scale).toFixed(d)}%`);
  return (
    <span className="flex items-center gap-2.5 whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">
      <span><b className="font-semibold text-foreground/90">{p.views == null ? "—" : p.views.toLocaleString()}</b> views</span>
      <span title="Click-through rate">CTR {pct(p.ctr, 100, 1)}</span>
      <span title="Average percentage viewed">{pct(p.avgPct, 1, 0)} viewed</span>
      {p.shorts.some((s) => s.ytId) && <span className="ml-auto" title="Shorts linked to their uploads">{p.shorts.filter((s) => s.ytId).length} short{p.shorts.filter((s) => s.ytId).length === 1 ? "" : "s"}</span>}
    </span>
  );
}

const PROJECT_ID = /^(VID|SH)\d+_[A-Za-z0-9_]+$/;

/** Nav, workspace list, new project (a video or a shorts project), Settings pinned at the bottom. `rail` = collapsed icon rail. */
export function LeftPanel({ rail, onPick, onExpand, onCollapse }: { rail?: boolean; onPick?: () => void; onExpand?: () => void; onCollapse?: () => void }) {
  const { route, go, ws, list, toast, reloadList } = useApp();
  const [id, setId] = useState("");
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<"video" | "shorts">("video");
  const [bad, setBad] = useState(false);
  // a bare name gets the next free number of its kind: "Fed_Cut" → SH03_Fed_Cut; a full id is taken as typed
  const prefix = kind === "shorts" ? "SH" : "VID";
  const raw = id.trim().replace(/\s+/g, "_");
  const nextN = String(Math.max(0, ...list.map((w) => Number(w.id.match(new RegExp(`^${prefix}(\\d+)_`))?.[1] ?? 0))) + 1).padStart(2, "0");
  const finalId = /^(VID|SH)\d+_/i.test(raw) ? raw : raw ? `${prefix}${nextN}_${raw}` : "";
  const pick = (p: Parameters<typeof go>[0]) => { go(p); onPick?.(); };

  // no name: the next number, untitled; it is named from its idea or script automatically
  const create = async () => {
    if (raw && !PROJECT_ID.test(finalId)) { setBad(true); toast("Use letters, digits and underscores, e.g. Debt_Spiral"); return; }
    setBad(false);
    try {
      const { id: v } = await api.createWorkspace(raw ? finalId : null, kind);
      const shorts = v.startsWith("SH");
      toast(`Creating ${v}…`); setId(""); setAdding(false);
      setTimeout(async () => { await reloadList(); go(shorts ? { view: "ws", ws: v, sec: "shorts", step: null, act: null, short: null } : { view: "ws", ws: v, sec: "video", step: "script", act: null, short: null }); }, shorts ? 1200 : 2500);
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

  // published videos (linked to their upload) move to their own group, newest upload first
  const inProgress = list.filter((w) => !w.published);
  const published = list.filter((w) => w.published).sort((a, b) => (b.published!.publishedAt ?? "").localeCompare(a.published!.publishedAt ?? ""));
  const row = (w: (typeof list)[number]) => {
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
  <span className={cn("min-w-0 truncate text-[13px] font-medium", on ? "text-foreground" : "text-foreground/90")}>{w.published?.title ?? w.title ?? w.id.replace(/^(VID|SH)\d+_/, "").replace(/_/g, " ")}</span>
  <span className="shrink-0 font-mono text-[10.5px] text-subtle-foreground">{shortId(w.id)}</span>
        </span>
        {w.published ? <PublishedLine p={w.published} /> : w.kind === "shorts" ? <ShortsBar stages={w.shorts} /> : <Progress9 statuses={w.statuses} />}
        {!w.published && <span className="flex items-center justify-between gap-2 text-[11px] text-subtle-foreground">
  {w.running ? <span className="flex min-w-0 items-center gap-1.5 text-warning"><StatusDot s="running" /><span className="truncate">{w.running.label}</span></span> : <span className="tabular-nums">{w.kind === "shorts" ? `${w.shorts[0]?.total ?? 0} short${(w.shorts[0]?.total ?? 0) === 1 ? "" : "s"} · ` : ""}{dur(w.totals.ms)}</span>}
  <span className="tabular-nums">{money(w.totals.costUsd)}</span>
        </span>}
      </button>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className={cn("flex flex-col gap-0.5 p-2", rail && "items-center gap-1")}>{NAV.map((n) => navBtn(n.v, n.label, n.icon))}</div>

        {!rail && (
          <div className="flex h-8 items-center justify-between px-4 pt-3">
            <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-subtle-foreground">In progress <span className="ml-1 tabular-nums">{inProgress.length}</span></span>
            <Tip label={adding ? "Cancel" : "New project"} side="right">
              <Button variant="ghost" size="icon" className="-mr-1.5 size-6 max-md:size-9" onClick={() => setAdding(!adding)} aria-label={adding ? "Cancel new project" : "New project"}>{adding ? <X className="size-3.5" /> : <Plus className="size-3.5" />}</Button>
            </Tip>
          </div>
        )}
        {!rail && adding && (
          <div className="wg-enter grid gap-1.5 px-3 pb-2 pt-1">
            <div role="radiogroup" aria-label="Project type" className="grid grid-cols-2 gap-0.5 rounded-md border bg-muted/40 p-0.5">
              {(["video", "shorts"] as const).map((k) => (
                <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => { setKind(k); setBad(false); }}
                  className={cn("h-7 rounded text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 max-md:h-9", kind === k ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                  {k === "video" ? "Video" : "Shorts"}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-subtle-foreground">{kind === "video" ? "A long video (shorts can be cut from it later)." : "Shorts only, from your brief: news, a market move, one short or a series."}</span>
            <Input autoFocus value={id} onChange={(e) => { setId(e.target.value); setBad(false); }} onKeyDown={(e) => { if (e.key === "Enter") void create(); if (e.key === "Escape") setAdding(false); }}
              placeholder="Name (optional)" spellCheck={false} autoComplete="off" aria-label={kind === "video" ? "New video name" : "New shorts project name"} aria-invalid={bad} className={cn("font-mono text-xs", bad && "border-destructive")} />
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate font-mono text-[11px] text-subtle-foreground">{finalId || "No name: it's named from the idea"}</span>
              <Button size="sm" variant="default" onClick={create}>Create</Button>
            </div>
          </div>
        )}

        <div className={cn("flex flex-col gap-0.5 px-2 pb-2", rail && "mt-2 items-center gap-1 border-t pt-2")}>
          {inProgress.map(row)}
        </div>
        {published.length > 0 && <>
          {!rail && <div className="flex h-8 items-center px-4 pt-2"><span className="text-[11px] font-medium uppercase tracking-[0.08em] text-subtle-foreground">Published <span className="ml-1 tabular-nums">{published.length}</span></span></div>}
          <div className={cn("flex flex-col gap-0.5 px-2 pb-2", rail && "mt-1 items-center gap-1 border-t pt-2")}>{published.map(row)}</div>
        </>}
        {rail && <div className="mt-1 flex justify-center"><Tip label="New project" side="right"><Button variant="ghost" size="icon" onClick={() => { onExpand?.(); setAdding(true); }} aria-label="New project"><Plus /></Button></Tip></div>}
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
