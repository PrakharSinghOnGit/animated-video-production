import { BarChart3, Menu, Moon, Square, SquareArrowOutUpRight, Sun, Clapperboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tip } from "@/components/ui/tooltip";
import { StatusDot } from "@/components/Status";
import { useApp } from "@/hooks/app";
import { useTheme } from "@/hooks/useTheme";
import { api } from "@/lib/api";
import { STEPS } from "@/lib/steps";
import { cn } from "@/lib/utils";

const PAGE: Record<string, string> = { overview: "Overview", usage: "Claude usage", machine: "Machine", settings: "Settings" };

/** Thin menu bar: brand, breadcrumb, state pill, Remotion Studio for the open video, theme. No machine stats. */
export function TopBar({ phone, showStats, onMenu, onStats }: { phone: boolean; showStats: boolean; onMenu: () => void; onStats: () => void }) {
  const { route, ws, d, runningAnywhere, activity, showLog, go, studio, toast, reloadList } = useApp();
  const [theme, toggle] = useTheme();
  const job = runningAnywhere[0];
  const last = activity.find((j) => j.status !== "running");
  const failed = !job && last?.status === "failed" && Date.now() - (last.endedAt ?? 0) < 30 * 60000;
  const state = job ? "running" : failed ? "failed" : "none";
  const text = job ? `Working: ${job.label}${job.cmdCount > 1 ? ` · ${job.cmdIndex + 1}/${job.cmdCount}` : ""}` : failed ? `Error: ${last!.label}` : "Idle";
  const full = job ? `${job.ws}: ${job.label}` : failed ? `${last!.ws}: ${last!.label} failed` : "Nothing running";
  const target = job ?? (failed ? last : null);

  const stepLabel = route.step === "runs" ? "Runs" : STEPS.find((s) => s.key === route.step)?.label;
  const crumbs = route.view === "ws" ? [d?.id ?? ws ?? "", stepLabel ?? ""].filter(Boolean) : [PAGE[route.view]];
  const mine = studio?.running && studio.ws === ws;

  return (
    <header className="flex h-10 shrink-0 items-center gap-2 border-b bg-card px-2">
      {phone && <Button variant="ghost" size="icon" onClick={onMenu} aria-label="Open navigation"><Menu /></Button>}
      <img src="/brand/Logo.png" alt="" className="size-6 rounded-[4px]" />
      <b className="hidden text-[13px] font-semibold tracking-tight sm:inline">The Wealth Gap</b>
      <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-[13px] text-muted-foreground">
        <span className="text-border max-sm:hidden">/</span>
        {crumbs.map((c, i) => (
          <span key={i} className={cn("truncate", i === crumbs.length - 1 && "text-foreground", i === 0 && route.view === "ws" && "font-mono text-xs")}>
            {i > 0 && <span className="mr-1.5 text-border">›</span>}{c}
          </span>
        ))}
      </nav>
      <Tip label={full}>
        <button disabled={!target} onClick={() => { if (target) { go({ view: "ws", ws: target.ws }); showLog(target.id); } }}
          className={cn("flex h-7 w-[104px] shrink-0 items-center gap-1.5 overflow-hidden rounded-full border px-2.5 text-xs sm:w-[250px] disabled:cursor-default", state === "failed" && "border-destructive/50", state === "running" && "border-warning/50")} aria-label={full}>
          <StatusDot s={state} />
          <span className={cn("min-w-0 flex-1 truncate text-left", state === "none" ? "text-muted-foreground" : "text-foreground")}>{text}</span>
        </button>
      </Tip>
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
      <Button variant="ghost" size="icon" onClick={toggle} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>{theme === "dark" ? <Sun /> : <Moon />}</Button>
      {showStats && <Button variant="ghost" size="icon" onClick={onStats} aria-label="Open stats"><BarChart3 /></Button>}
    </header>
  );
}
