import { Menu, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tip } from "@/components/ui/tooltip";
import { StatusDot } from "@/components/Status";
import { useApp } from "@/hooks/app";
import { useTheme } from "@/hooks/useTheme";

/** Brand, current video, the running process (fixed width, truncated), theme. No CPU/GPU here: that lives in the right panel. */
export function TopBar({ onMenu, phone }: { onMenu: () => void; phone: boolean }) {
  const { d, ws, runningAnywhere, showLog, go } = useApp();
  const [theme, toggle] = useTheme();
  const job = runningAnywhere[0];
  const name = job ? `${job.label}${job.cmdCount > 1 ? ` · ${job.cmdIndex + 1}/${job.cmdCount}` : ""}` : "Idle";
  const full = job ? `${job.ws}: ${job.label} (${job.cmdIndex + 1}/${job.cmdCount})` : "No process running";
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-card px-2 md:gap-3 md:px-3">
      {phone && <Button variant="ghost" size="icon" onClick={onMenu} aria-label="Open videos and views"><Menu /></Button>}
      <img src="/brand/Logo.png" alt="" className="size-7 rounded" />
      <div className="hidden leading-tight sm:block"><b className="text-sm tracking-tight">The Wealth Gap</b><div className="text-xs text-muted-foreground">Production</div></div>
      <div className="min-w-0 flex-1 truncate text-muted-foreground">
        {ws && <><span className="font-mono text-foreground">{d?.id ?? ws}</span>{d?.title && <span className="max-md:hidden"> · {d.title}</span>}{d?.style && <span className="text-xs max-lg:hidden"> · style {d.style}</span>}</>}
      </div>
      {/* fixed width: the name never resizes the bar */}
      <Tip label={full}>
        <button
          disabled={!job}
          onClick={() => { if (job) { go({ view: "ws", ws: job.ws }); showLog(job.id); } }}
          className="flex h-8 w-[112px] shrink-0 items-center gap-2 overflow-hidden rounded-full border px-2.5 text-xs sm:w-[220px] disabled:cursor-default"
          aria-label={full}
        >
          <StatusDot s={job ? "running" : "none"} />
          <span className={job ? "min-w-0 flex-1 truncate text-left text-foreground" : "min-w-0 flex-1 truncate text-left text-muted-foreground"}>{name}</span>
        </button>
      </Tip>
      <Button variant="ghost" size="icon" onClick={toggle} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>{theme === "dark" ? <Sun /> : <Moon />}</Button>
    </header>
  );
}
