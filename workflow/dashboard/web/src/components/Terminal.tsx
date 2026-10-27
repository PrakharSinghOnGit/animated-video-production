import { useEffect, useMemo, useRef } from "react";
import { ChevronDown, ChevronUp, Square, Terminal as TerminalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/fields";
import { StatusDot } from "@/components/Status";
import { JobLogView } from "@/components/JobLogView";
import { useApp } from "@/hooks/app";
import { useStored } from "@/lib/storage";
import { cn, dur } from "@/lib/utils";

const STEPS_WITH_LOG = ["script", "voice", "align", "plan", "acts", "sound", "render"];
const MIN = 120;

/** Plain terminal at the bottom of the center panel: drag the top edge to resize, collapse to a bar, one tab per job. On a phone it is a bottom drawer. */
export function Terminal({ phone }: { phone: boolean }) {
  const { d, ws, busy, logTab, showLog, logRequest, stop } = useApp();
  const [open, setOpen] = useStored<boolean>("log.open", false);
  const [h, setH] = useStored<number>("log.h", 260);
  const drag = useRef<{ y: number; h: number } | null>(null);

  // a started job (or a click on a job elsewhere) opens the panel
  useEffect(() => { if (logRequest) setOpen(true); }, [logRequest, setOpen]);

  const jobs = useMemo(() => (d?.jobs ?? []).slice(-8), [d?.jobs]);
  const active = logTab ?? busy?.id ?? jobs[jobs.length - 1]?.id ?? null;
  const job = d?.jobs.find((j) => j.id === active) ?? null;
  const maxH = () => Math.round(window.innerHeight * (phone ? 0.75 : 0.7));
  const height = Math.max(MIN, Math.min(h, maxH()));

  return (
    <section aria-label="Terminal" className="relative z-30 flex shrink-0 flex-col border-t bg-console" style={open ? { height } : undefined}>
      {open && (
        <div role="separator" aria-orientation="horizontal" aria-label="Resize log panel" aria-valuenow={height} tabIndex={0}
          className="absolute inset-x-0 -top-1.5 z-10 h-3 cursor-row-resize touch-none after:absolute after:inset-x-0 after:top-1 after:h-0.5 after:bg-transparent hover:after:bg-brand focus-visible:after:bg-brand"
          onPointerDown={(e) => { drag.current = { y: e.clientY, h: height }; e.currentTarget.setPointerCapture(e.pointerId); }}
          onPointerMove={(e) => { if (drag.current) setH(Math.max(MIN, Math.min(maxH(), drag.current.h + (drag.current.y - e.clientY)))); }}
          onPointerUp={() => { drag.current = null; }}
          onKeyDown={(e) => { if (e.key === "ArrowUp") setH(Math.min(maxH(), height + 24)); if (e.key === "ArrowDown") setH(Math.max(MIN, height - 24)); }}
        />
      )}
      <div className="flex h-11 shrink-0 items-center gap-1 border-b pl-1 pr-1.5">
        <button onClick={() => setOpen(!open)} className="flex h-full items-center gap-1.5 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground" aria-expanded={open}>
          <TerminalIcon className="size-3.5" /> Terminal {open ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
        </button>
        <div role="tablist" className="flex min-w-0 flex-1 items-stretch self-stretch overflow-x-auto">
          {jobs.map((j) => (
            <button key={j.id} role="tab" aria-selected={j.id === active} onClick={() => { showLog(j.id); setOpen(true); }}
              className={cn("flex max-w-[200px] shrink-0 items-center gap-1.5 border-b-2 border-transparent px-2.5 text-xs text-muted-foreground hover:text-foreground", j.id === active && "border-brand text-foreground")}>
              <StatusDot s={j.status === "running" ? "running" : j.status === "done" ? "done" : "failed"} />
              <span className="truncate">{j.label}</span>
            </button>
          ))}
          {jobs.length === 0 && <span className="self-center px-2 text-xs text-muted-foreground">No runs yet for this video</span>}
        </div>
        {open && ws && (
          <NativeSelect aria-label="Older log of a step" className="!h-8 w-28 text-xs max-md:hidden" value="" onChange={(e) => { if (e.target.value) { showLog(`log:${e.target.value}`); } }}>
            <option value="">Older log…</option>
            {STEPS_WITH_LOG.map((k) => <option key={k} value={k}>{k}</option>)}
          </NativeSelect>
        )}
        {job && <span className="hidden whitespace-nowrap text-xs text-muted-foreground sm:inline">{job.cmdCount > 1 ? `${job.cmdIndex + 1}/${job.cmdCount} · ` : ""}{job.status === "running" ? "running" : job.status} {dur(job.ms)}</span>}
        {busy && <Button size="sm" variant="destructive" onClick={stop}><Square className="fill-current" />Stop</Button>}
      </div>
      {open && (
        <>
          {job && <div className="truncate border-b px-3 py-1 font-mono text-[11px] text-muted-foreground" title={job.cmd}>$ {job.cmd}</div>}
          {ws && active ? <JobLogView key={`${ws}:${active}`} ws={ws} tab={active} /> : <div className="p-3 font-mono text-xs text-muted-foreground">$ run a step to see its output here</div>}
        </>
      )}
    </section>
  );
}
