import { useState } from "react";
import { Bot, Hourglass, Loader2, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/fields";
import { Segmented } from "@/components/ui/layout";
import { InfoTip } from "@/components/ui/tooltip";
import { Countdown } from "@/components/LimitsMeter";
import { initialValue, toOpts } from "@/components/OptionField";
import { useApp } from "@/hooks/app";
import { api } from "@/lib/api";
import { store } from "@/lib/storage";
import { ago, cn } from "@/lib/utils";

/** The steps autopilot can run (server/autopilot.ts AUTOPILOT_ACTIONS): each runs with the options saved on its card. */
const ACTIONS = ["script.write", "script.format", "script.apply", "voice.run", "align.all", "plan.run", "acts.all", "acts.reviewAll"];

/**
 * Autopilot for this video, under the step bar: off = one line and a button; on = what it is doing, a countdown while
 * the act batch sleeps through a usage reset, and Stop. It moves the video from the idea to drawn acts by itself and
 * stops at your approvals; notifications tell you when it needs you.
 */
export function AutopilotBar() {
  const { d, ws, schema, refresh, toast } = useApp();
  const [open, setOpen] = useState(false);
  const [until, setUntil] = useState<"acts" | "review">(() => store.get("autopilot.until", "acts"));
  const [planGate, setPlanGate] = useState<boolean>(() => store.get("autopilot.planGate", false));
  const [busy, setBusy] = useState(false);
  if (!d || !ws || d.kind !== "video") return null;
  const a = d.autopilot, on = !!a?.on, wait = d.usageWait;

  const start = async () => {
    // the options last set on each step's card, exactly as its own Run button would send them
    const opts = Object.fromEntries(ACTIONS.filter((k) => schema[k]).map((k) => {
      const defs = schema[k].opts ?? [], saved = store.get<Record<string, unknown>>(`opt.${k}`, {});
      return [k, toOpts(defs, Object.fromEntries(defs.map((o) => [o.key, initialValue(o, saved)])))];
    }));
    store.set("autopilot.until", until); store.set("autopilot.planGate", planGate);
    setBusy(true);
    try { await api.autopilot(ws, { on: true, until, planGate, opts }); setOpen(false); await refresh(); toast("Autopilot on: you get a notification when it needs you"); }
    catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };
  const stop = async () => {
    setBusy(true);
    try { await api.autopilot(ws, { on: false }); await refresh(); } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };

  const info = <InfoTip label="Autopilot">Runs the steps one after another by itself: script from your idea, then (after you approve the script) split, voice, align, plan and every act. Each step uses the options you last set on its card. Acts wait through Claude usage resets: an act starts only when what one act uses still fits in the 5-hour window, otherwise it sleeps until the reset and goes on. You get a notification (Mac and phone, Settings → Notifications) when it needs you, when it waits, and when it is done. Stopping one of its jobs switches it off. Keep the Mac plugged in with the lid open overnight.</InfoTip>;

  if (on && a) {
    const waiting = !!a.waiting, sleeping = !!wait && !!a.current;
    const meta = `on since ${ago(a.startedAt)} · until ${a.until === "review" ? "previews + review" : "acts drawn"}${a.planGate ? " · stops for plan approval" : ""}`;
    return (
      <div title={meta} className={cn("flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b px-4 py-2 text-[12.5px]", waiting ? "bg-warning/8" : "bg-brand/6")}>
        <span className="flex items-center gap-1.5 font-medium">{sleeping ? <Hourglass className="size-3.5 text-warning" /> : waiting ? <Bot className="size-3.5 text-warning" /> : <Loader2 className="size-3.5 animate-spin text-brand" />}Autopilot</span>
        {sleeping && wait
          ? <span className="min-w-0 flex-1 text-muted-foreground">waiting for the usage reset ({wait.pct}% used, an act needs ~{wait.need}%) · <Countdown resetsAt={wait.until / 1000} /> · {wait.left.length} act{wait.left.length === 1 ? "" : "s"} left</span>
          : <span className={cn("min-w-0 flex-1", waiting ? "text-foreground" : "text-muted-foreground")}>{a.now}</span>}
        <span className="hidden text-[11px] text-subtle-foreground 2xl:inline">{meta}</span>
        {info}
        <Button size="sm" variant="outline" disabled={busy} onClick={stop}><Square />Stop</Button>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-1.5 text-[12.5px]">
      <span className="flex items-center gap-1.5 text-muted-foreground"><Bot className="size-3.5" />Autopilot</span>
      {!open
        ? <span className="min-w-0 flex-1 truncate text-[11.5px] text-subtle-foreground">{a?.endReason ? `last run ${ago(a.endedAt ?? a.startedAt)}: ${a.endReason}` : "off: runs the steps up to the drawn acts by itself, through usage resets"}</span>
        : <span className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
            <Segmented label="Run until" value={until} onChange={setUntil} options={[{ value: "acts", label: "Acts drawn" }, { value: "review", label: "+ previews & review" }]} />
            <label className="flex items-center gap-1.5 text-muted-foreground"><Checkbox checked={planGate} onCheckedChange={(v) => setPlanGate(v === true)} />Stop for plan approval</label>
          </span>}
      {info}
      {open
        ? <><Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button size="sm" disabled={busy} onClick={start}><Play />Start</Button></>
        : <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Turn on…</Button>}
    </div>
  );
}
