import { AudioLines, BarChart3, ChevronRight, List, Menu, Workflow, Moon, Square, SquareArrowOutUpRight, Sun, Clapperboard } from "lucide-react";
import { Segmented } from "@/components/ui/layout";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tip } from "@/components/ui/tooltip";
import { StatusDot } from "@/components/Status";
import { useApp } from "@/hooks/app";
import { useTheme } from "@/hooks/useTheme";
import { api } from "@/lib/api";
import { STEPS } from "@/lib/steps";
import { cn } from "@/lib/utils";

const PAGE: Record<string, string> = { overview: "Overview", usage: "Usage", machine: "Machine", settings: "Settings", analytics: "Analytics" };

/** Thin menu bar: brand, breadcrumb, state pill, Remotion Studio for the open video, theme. No machine stats. */
export function TopBar({ phone, showStats, onMenu, onStats }: { phone: boolean; showStats: boolean; onMenu: () => void; onStats: () => void }) {
  const { route, ws, d, runningAnywhere, activity, showLog, go, studio, toast, reloadList, mode, setMode } = useApp();
  const [theme, toggle] = useTheme();
  const job = runningAnywhere[0];
  const last = activity.find((j) => j.status !== "running");
  const failed = !job && last?.status === "failed" && Date.now() - (last.endedAt ?? 0) < 30 * 60000;
  const state = job ? "running" : failed ? "failed" : "none";
  const text = job ? `Working: ${job.label}${job.cmdCount > 1 ? ` · ${job.cmdIndex + 1}/${job.cmdCount}` : ""}` : failed ? `Error: ${last!.label}` : "Idle";
  const full = job ? `${job.ws}: ${job.label}` : failed ? `${last!.ws}: ${last!.label} failed` : "Nothing running";
  const target = job ?? (failed ? last : null);

  const SEC = { video: "Video", shorts: "Shorts", packaging: "Packaging" } as const;
  const stepLabel = route.sec === "video" ? (route.step === "runs" ? "Runs" : STEPS.find((s) => s.key === route.step)?.label) : route.sec === "shorts" ? route.short : undefined;
  const crumbs = route.view === "ws" ? [d?.id ?? ws ?? "", route.sec ? SEC[route.sec] : "Overview", stepLabel ?? ""].filter(Boolean) : [PAGE[route.view]];
  const mine = studio?.running && studio.ws === ws;

  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b bg-card px-2.5">
      {phone && <Button variant="ghost" size="icon" onClick={onMenu} aria-label="Open navigation"><Menu /></Button>}
      <button onClick={() => go({ view: "overview", yt: null })} className="flex shrink-0 items-center gap-2 rounded-md px-1 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/60" aria-label="The Wealth Gap: overview">
        <img src="/brand/Logo.png" alt="" className="size-6 rounded-[5px] ring-1 ring-border" />
        <span className="hidden text-[13px] font-semibold tracking-[-0.01em] sm:inline">The Wealth Gap</span>
      </button>
      <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1 truncate text-[13px] text-muted-foreground">
        {crumbs.map((c, i) => (
          <span key={i} className="flex min-w-0 items-center gap-1">
            <ChevronRight className="size-3.5 shrink-0 text-subtle-foreground/70 max-sm:hidden" />
            {i === 0 && route.view === "ws" && crumbs.length > 1
              ? <button onClick={() => go({ sec: null, step: null, act: null, short: null })} className="truncate rounded px-1 font-mono text-xs hover:bg-accent hover:text-foreground">{c}</button>
              : <span className={cn("truncate px-1", i === crumbs.length - 1 && "font-medium text-foreground", i === 0 && route.view === "ws" && "font-mono text-xs")}>{c}</span>}
          </span>
        ))}
      </nav>
      {route.view === "ws" && (
        <Segmented label="Workspace view" value={mode} onChange={setMode} className="h-7"
          options={[{ value: "list", label: phone ? "" : "Steps", icon: <List /> }, { value: "nodes", label: phone ? "" : "Graph", icon: <Workflow /> }]} />
      )}
      <Tip label={full}>
        <button disabled={!target} onClick={() => { if (target) { go({ view: "ws", ws: target.ws, sec: null, step: null, short: null }); showLog(target.id); } }}
          className={cn("flex h-7 w-[104px] shrink-0 items-center gap-2 overflow-hidden rounded-md border bg-background px-2.5 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 enabled:hover:bg-accent disabled:cursor-default", state === "none" ? "sm:w-auto" : "sm:w-[260px]", state === "failed" && "border-destructive/40 bg-destructive/5", state === "running" && "border-warning/40 bg-warning/5")} aria-label={full}>
          <StatusDot s={state} />
          <span className={cn("min-w-0 flex-1 truncate text-left", state === "none" ? "text-muted-foreground" : "text-foreground")}>{text}</span>
        </button>
      </Tip>
      <span aria-hidden className="mx-0.5 h-5 w-px bg-border max-sm:hidden" />
      {mine ? (
        <>
          {studio!.url
            ? <Tip label="Open Remotion Studio"><Button variant="ghost" size="icon" asChild><a href={studio!.url} target="_blank" rel="noopener" aria-label="Open Remotion Studio"><SquareArrowOutUpRight /></a></Button></Tip>
            : <span className="px-1 text-xs text-muted-foreground">Studio…</span>}
          <Tip label="Stop Remotion Studio"><Button variant="ghost" size="icon" aria-label="Stop Remotion Studio" onClick={() => api.stopStudio().then(() => setTimeout(reloadList, 800)).catch((e) => toast(e.message))}><Square className="fill-current text-destructive" /></Button></Tip>
        </>
      ) : (
        <Tip label={ws ? `Open ${ws} in Remotion Studio` : "Select a video first"}>
          <Button variant="ghost" size={phone ? "icon" : "sm"} disabled={!ws || route.view === "settings"} aria-label="Open in Remotion Studio"
            onClick={() => ws && api.startStudio(ws).then(() => { toast("Starting Remotion Studio…"); setTimeout(reloadList, 1500); }).catch((e) => toast(e.message))}>
            <Clapperboard />{!phone && "Studio"}
          </Button>
        </Tip>
      )}
      <DawButton phone={phone} />
      <Button variant="ghost" size="icon" onClick={toggle} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>{theme === "dark" ? <Sun /> : <Moon />}</Button>
      {showStats && <Button variant="ghost" size="icon" onClick={onStats} aria-label="Open stats"><BarChart3 /></Button>}
    </header>
  );
}

/** Starts the local openDAW (like Remotion Studio) and opens it with this video's project; its Export > "To video pipeline" sends the mix back. */
function DawButton({ phone }: { phone: boolean }) {
  const { ws, route, d, toast } = useApp();
  const [busy, setBusy] = useState(false);
  const bundle = d?.sound.daw.bundle;
  const open = async () => {
    if (!ws) return;
    if (!bundle) { toast("Build the openDAW project first (Sound step)"); return; }
    const win = window.open("about:blank", "_blank"); // opened now so the browser does not block it after the wait
    setBusy(true);
    try {
      let s = await api.startDaw();
      for (let i = 0; i < 90 && !s.ready; i++) {
        if (s.exited !== null) throw new Error(`openDAW stopped: ${s.tail.split("\n").slice(-3).join(" ")}`);
        await new Promise((r) => setTimeout(r, 1000));
        s = await api.daw();
      }
      if (!s.ready || !s.url) throw new Error("openDAW did not start in 90 s");
      const base = `${location.origin}/api/ws/${encodeURIComponent(ws)}/daw`;
      const v = d?.sound.daw.build?.builtAt ?? bundle.mtime;
      const q = new URLSearchParams({ bundle: `${base}/project.odb?v=${v}`, export: `${base}/mix` });
      if (win) win.location.href = `${s.url}/?${q}`; else window.open(`${s.url}/?${q}`, "_blank");
    } catch (e) {
      win?.close();
      toast((e as Error).message);
    } finally { setBusy(false); }
  };
  return (
    <Tip label={ws ? "Open this video's sound in openDAW (retime, gain, add music)" : "Select a video first"}>
      <Button variant="ghost" size={phone ? "icon" : "sm"} disabled={!ws || route.view === "settings" || busy} aria-label="Open in openDAW" onClick={open}>
        <AudioLines />{!phone && (busy ? "openDAW…" : "openDAW")}
      </Button>
    </Tip>
  );
}
