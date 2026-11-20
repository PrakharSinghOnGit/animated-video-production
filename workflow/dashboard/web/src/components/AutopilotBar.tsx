import { useState } from "react";
import { Bot, Check, Hourglass, Loader2, Play, RotateCcw, Settings2, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/layout";
import { InfoTip } from "@/components/ui/tooltip";
import { Countdown } from "@/components/LimitsMeter";
import { initialValue, toOpts } from "@/components/OptionField";
import { useApp } from "@/hooks/app";
import { api } from "@/lib/api";
import { store } from "@/lib/storage";
import type { AutopilotMode, AutopilotStep } from "@/lib/types";
import { ago, cn } from "@/lib/utils";

const MODE_OPTIONS: { value: AutopilotMode; label: string }[] = [
  { value: "auto", label: "Auto" }, { value: "review", label: "Review" }, { value: "me", label: "Me" }, { value: "off", label: "Off" },
];
const modeHelp = (st: AutopilotStep, m: AutopilotMode) =>
  m === "auto" ? (st.approval && (st.key === "script" || st.key === "shortScripts") ? "runs it and approves it for you" : "runs it and goes on")
  : m === "review" ? (st.approval ? "runs it, then waits for your approval on its page" : "runs it, then waits for Continue here")
  : m === "me" ? "never starts it: waits until you have done it"
  : "not part of this run";

/**
 * Autopilot for this video, under the step bar. Off = one line and a button; Turn on opens one row per step with its
 * mode (Auto / Review / Me / Off). On = what it is doing, Continue when it waits for your look at a step, a countdown
 * while the act batch sleeps through a usage reset, Steps (change the modes while it runs) and Stop.
 */
export function AutopilotBar() {
  const { d, ws, schema, refresh, toast } = useApp();
  const [open, setOpen] = useState(false);
  const [modes, setModes] = useState<Record<string, AutopilotMode> | null>(null);
  const [busy, setBusy] = useState(false);
  if (!d || !ws || d.kind !== "video" || !d.autopilotSteps) return null;
  const steps = d.autopilotSteps;
  const a = d.autopilot, on = !!a?.on, wait = d.usageWait;
  const defaults = Object.fromEntries(steps.map((s) => [s.key, s.def])) as Record<string, AutopilotMode>;
  // a running autopilot: its modes; otherwise the modes you last started one with (any video), else the defaults
  const cur = modes ?? (on && a?.modes ? { ...defaults, ...a.modes } : { ...defaults, ...store.get<Record<string, AutopilotMode>>("autopilot.modes", {}) });

  // the options last set on each step's card, exactly as its own Run button would send them
  const collectOpts = () => Object.fromEntries([...new Set(steps.flatMap((s) => s.actions))].filter((k) => schema[k]).map((k) => {
    const defs = schema[k].opts ?? [], saved = store.get<Record<string, unknown>>(`opt.${k}`, {});
    return [k, toOpts(defs, Object.fromEntries(defs.map((o) => [o.key, initialValue(o, saved)])))];
  }));
  const send = async (b: Parameters<typeof api.autopilot>[1], done?: string) => {
    setBusy(true);
    try { await api.autopilot(ws, b); setOpen(false); setModes(null); await refresh(); if (done) toast(done); }
    catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };
  const save = () => { store.set("autopilot.modes", cur); return send({ on: true, update: on, modes: cur, opts: collectOpts() }, on ? "Autopilot steps changed" : "Autopilot on: you get a notification when it needs you"); };
  const close = () => { setOpen(false); setModes(null); };

  const info = <InfoTip label="Autopilot">Runs the steps one after another by itself, each the way you pick: <b>Auto</b> runs it and goes on (the script and short scripts are approved for you), <b>Review</b> runs it and waits for your OK (its approval where it has one, else Continue here), <b>Me</b> never starts it and waits until you have done it, <b>Off</b> leaves it out (a step that needs it runs only if it is already done). An OK holds for that version: redo the step and it asks again. Each step uses the options you last set on its card. Acts wait through Claude usage resets. You get a notification (Mac and phone, Settings → Notifications) when it needs you, when it waits, and when it is done. Stopping one of its jobs switches it off. Keep the Mac plugged in with the lid open overnight.</InfoTip>;

  const panel = open && (
    <div className="max-h-[60vh] shrink-0 overflow-y-auto border-b bg-card/40 px-4 py-2">
      <div className="mx-auto max-w-[760px] divide-y">
        {steps.map((st) => {
          const m = cur[st.key] ?? st.def;
          const offNeeds = st.needs.filter((n) => (cur[n] ?? "off") === "off").map((n) => steps.find((x) => x.key === n)?.label ?? n);
          const dim = m === "off" || offNeeds.length > 0;
          return (
            <div key={st.key} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-1.5">
              <div className={cn("min-w-0", dim && "opacity-60")}>
                <div className="text-[12.5px] font-medium">{st.label}</div>
                <div className="text-[11px] text-subtle-foreground">{modeHelp(st, m)}{m !== "off" && offNeeds.length ? ` · only if ${offNeeds.join(", ")} is already done` : ""}</div>
              </div>
              <Segmented label={`${st.label} mode`} value={m} onChange={(v) => setModes({ ...cur, [st.key]: v })} options={MODE_OPTIONS} />
            </div>
          );
        })}
      </div>
      <div className="mx-auto flex max-w-[760px] flex-wrap items-center justify-end gap-2 pt-2">
        <Button size="sm" variant="ghost" className="mr-auto" onClick={() => setModes(defaults)}><RotateCcw />Defaults</Button>
        <Button size="sm" variant="ghost" onClick={close}>Cancel</Button>
        <Button size="sm" disabled={busy} onClick={save}>{on ? <><Check />Save</> : <><Play />Start</>}</Button>
      </div>
    </div>
  );

  if (on && a) {
    const waiting = !!a.waiting, sleeping = !!wait && !!a.current;
    const reviewStep = a.review ? steps.find((s) => s.key === a.review) : null;
    const meta = `on since ${ago(a.startedAt)} · ${steps.filter((s) => (a.modes?.[s.key] ?? "off") !== "off").map((s) => `${s.label} ${a.modes[s.key]}`).join(" · ")}`;
    return (
      <>
        <div title={meta} className={cn("flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b px-4 py-2 text-[12.5px]", waiting ? "bg-warning/8" : "bg-brand/6")}>
          <span className="flex items-center gap-1.5 font-medium">{sleeping ? <Hourglass className="size-3.5 text-warning" /> : waiting ? <Bot className="size-3.5 text-warning" /> : <Loader2 className="size-3.5 animate-spin text-brand" />}Autopilot</span>
          {sleeping && wait
            ? <span className="min-w-0 flex-1 text-muted-foreground">waiting for the usage reset ({wait.pct}% used, an act needs ~{wait.need}%) · <Countdown resetsAt={wait.until / 1000} /> · {wait.left.length} act{wait.left.length === 1 ? "" : "s"} left</span>
            : <span className={cn("min-w-0 flex-1", waiting ? "text-foreground" : "text-muted-foreground")}>{a.now}</span>}
          {info}
          {reviewStep && <Button size="sm" disabled={busy} onClick={() => send({ continue: reviewStep.key })}><Check />Continue after {reviewStep.label}</Button>}
          <Button size="sm" variant="ghost" onClick={() => (open ? close() : setOpen(true))}><Settings2 />Steps…</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => send({ on: false })}><Square />Stop</Button>
        </div>
        {panel}
      </>
    );
  }

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-1.5 text-[12.5px]">
        <span className="flex items-center gap-1.5 text-muted-foreground"><Bot className="size-3.5" />Autopilot</span>
        <span className="min-w-0 flex-1 truncate text-[11.5px] text-subtle-foreground">{a?.endReason ? `last run ${ago(a.endedAt ?? a.startedAt)}: ${a.endReason}` : "off: runs the steps you pick by itself, stopping where you want to look"}</span>
        {info}
        {open ? <Button size="sm" variant="ghost" onClick={close}>Cancel</Button> : <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Turn on…</Button>}
      </div>
      {panel}
    </>
  );
}
