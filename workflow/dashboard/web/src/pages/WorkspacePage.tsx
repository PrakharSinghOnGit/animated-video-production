import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/hooks/app";
import { GOTO, STEPS, stepStates, todoText } from "@/lib/steps";
import { dur, money } from "@/lib/utils";
import type { Details, StepKey } from "@/lib/types";
import { HighlightProvider } from "@/components/highlight";
import { StepCard } from "@/components/StepCard";
import { StatTile } from "@/components/StatTile";
import { ScriptStep } from "@/steps/ScriptStep";
import { VoiceStep } from "@/steps/VoiceStep";
import { AlignStep } from "@/steps/AlignStep";
import { PlanStep } from "@/steps/PlanStep";
import { ActsStep } from "@/steps/ActsStep";
import { SoundStep } from "@/steps/SoundStep";
import { RenderStep } from "@/steps/RenderStep";
import { HistoryStep } from "@/steps/HistoryStep";
import { Card } from "@/components/ui/card";
import { Fold } from "@/components/ui/collapsible";

const VIEWS: Record<StepKey, React.ComponentType> = { script: ScriptStep, voice: VoiceStep, align: AlignStep, plan: PlanStep, acts: ActsStep, sound: SoundStep, render: RenderStep };

const DESC: Record<StepKey, string> = {
  script: "Write your idea in plain text. Use [square brackets] for instructions to the writer. Claude turns it into a spoken, chunked script with a scored hook and on-screen hints, using the yt-script method. You review and edit it, then approve it; nothing is voiced before that.",
  voice: "Local Chatterbox voice clone. Each section is generated in several takes and the take that best matches the script (speech recognition) is kept.",
  align: "Word-level timings from the voiceover, then mastering (EQ, de-ess, compression, −14 LUFS), the captions the planner uses, and the .srt for YouTube.",
  plan: "The director (Claude) splits the narration into acts of 40–90 s: beats, the hits that must land on spoken words, BPM, and the data shown on screen with its source. It also reads the script's on-screen hints.",
  acts: "Each act is drawn in code by Claude in the plan's house style. Watch the preview, ask a reviewer (you choose the agent and what it is given: the timed voiceover, the plan, the script, the code), collect notes, then send them to the act's author.",
  sound: "Foley events come from each act's code. The music bed is rendered as a separate stem for your editor; the mix is voice + foley only unless you include music.",
  render: "Assemble every act into the video, render a draft or the final 1080p H.264, then run QC (placeholders, loudness, duration). Final renders use the GPU canvas.",
};

function stats(k: StepKey, d: Details): React.ReactNode {
  const m = d.meta[k];
  const own: Record<StepKey, [string, string] | null> = {
    script: [d.script.words ? String(d.script.words) : "—", "spoken words"],
    voice: [d.voice.sectionCount ? String(d.voice.sectionCount) : "—", "sections"],
    align: [d.align.durationMs ? dur(d.align.durationMs) : "—", "narration"],
    plan: [d.plan.acts.length ? String(d.plan.acts.length) : "—", "acts"],
    acts: [`${d.acts.filter((a) => a.scene).length}/${d.acts.length}`, "drawn"],
    sound: [d.sound.events != null ? String(d.sound.events) : "—", "foley events"],
    render: null,
  };
  return (
    <>
      {own[k] && <StatTile value={own[k]![0]} label={own[k]![1]} />}
      {m && <StatTile value={dur(m.totalMs)} label={`${m.runs} runs`} />}
      {m && m.totalCost > 0 && <StatTile value={money(m.totalCost)} label="Claude cost" />}
    </>
  );
}

/** All steps stacked in pipeline order. The step bar scrolls here; the next step to do is outlined. */
export function WorkspacePage() {
  const { d, route } = useApp();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const states = useMemo(() => stepStates(d?.statuses), [d?.statuses]);

  // a step-bar click (or "open act") asks to show a step: open it and scroll there
  useEffect(() => {
    const show = (k: string) => {
      setOpen((o) => ({ ...o, [k]: true }));
      setTimeout(() => document.getElementById(`step-${k}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    };
    const on = (e: Event) => show((e as CustomEvent<string>).detail);
    window.addEventListener(GOTO, on);
    if (route.step) show(route.step);
    return () => window.removeEventListener(GOTO, on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!d) return <div className="p-6 text-muted-foreground">Loading…</div>;
  const isOpen = (k: string, dflt: boolean) => open[k] ?? dflt;
  const toggle = (k: string, dflt: boolean) => setOpen((o) => ({ ...o, [k]: !(o[k] ?? dflt) }));

  return (
    <HighlightProvider>
      <div className="mx-auto grid max-w-[1100px] gap-3.5 p-3 pb-24 md:p-4 md:pb-24">
        {STEPS.map((s, i) => {
          const View = VIEWS[s.key];
          const state = states[s.key];
          const dflt = state !== "done";
          return (
            <StepCard key={s.key} id={s.key} index={i + 1} title={s.label} desc={DESC[s.key]} status={d.statuses[s.key] ?? "none"} state={state} todo={todoText(s.key, d.statuses[s.key] ?? "none", d)}
              stats={stats(s.key, d)} open={isOpen(s.key, dflt)} onToggle={() => toggle(s.key, dflt)}>
              <View />
            </StepCard>
          );
        })}
        <Card>
          <div className="px-3.5">
            <Fold title={<span className="text-[15px] font-semibold text-foreground">History · {dur(d.totals.ms)} · {money(d.totals.costUsd)}</span>} open={isOpen("runs", false)} onOpenChange={(o) => setOpen((x) => ({ ...x, runs: o }))}>
              <div className="grid gap-3.5 pb-3.5"><p className="m-0 text-xs text-muted-foreground">Every run started from the dashboard (duration, CPU, memory and GPU use), and every step the pipeline recorded (model and Claude cost).</p><HistoryStep /></div>
            </Fold>
          </div>
        </Card>
      </div>
    </HighlightProvider>
  );
}
