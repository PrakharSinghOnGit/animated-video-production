import { lazy, Suspense, useMemo } from "react";
import { useApp } from "@/hooks/app";
import { STEPS, stepStates, todoText } from "@/lib/steps";
import { dur, money } from "@/lib/utils";
import type { Details, StepKey } from "@/lib/types";

type VideoKey = Exclude<StepKey, "publish" | "shorts">;
import { StepBar } from "@/components/StepBar";
import { StepPage } from "@/components/StepPage";
import { StatTile } from "@/components/StatTile";
import { ScriptStep } from "@/steps/ScriptStep";
import { VoiceStep } from "@/steps/VoiceStep";
import { AlignStep } from "@/steps/AlignStep";
import { PlanStep } from "@/steps/PlanStep";
import { ActsStep } from "@/steps/ActsStep";
import { SoundStep } from "@/steps/SoundStep";
import { RenderStep } from "@/steps/RenderStep";
import { HistoryStep } from "@/steps/HistoryStep";
import { SectionTabs } from "@/components/SectionTabs";
import { ProjectOverview } from "@/pages/ProjectOverview";
import { ShortsPage } from "@/pages/ShortsPage";
import { PackagingPage } from "@/pages/PackagingPage";

const NodeView = lazy(() => import("@/components/NodeView"));

const VIEWS: Record<VideoKey, React.ComponentType> = { script: ScriptStep, voice: VoiceStep, align: AlignStep, plan: PlanStep, acts: ActsStep, sound: SoundStep, render: RenderStep };

/** The step's one "Run all": the master chain where the schema has one, else the step's main action. */
const RUN_ALL: Record<VideoKey, string> = { script: "script.write", voice: "voice.run", align: "align.all", plan: "plan.run", acts: "acts.all", sound: "sound.all", render: "render.all" };

const DESC: Record<VideoKey, string> = {
  script: "Write your idea in plain text. Claude turns it into a spoken, chunked script with a scored hook and on-screen hints (yt-script method). You review and edit it, then approve it; nothing is voiced before that. Approval is a human gate and is never part of Run all.",
  voice: "Qwen3-TTS reads every sentence in the channel voice. Each sentence gets several takes; the one that best matches the script and the voice is kept.",
  align: "Word-level timings from the voiceover, then mastering (EQ, de-ess, compression, −14 LUFS), the captions the planner uses, and the .srt for YouTube.",
  plan: "The director (Claude) splits the narration into acts: beats, the hits that must land on spoken words, BPM, and the data shown on screen with its source.",
  acts: "Each act is drawn in code by Claude in the plan's house style. Preview it, ask a reviewer, collect notes, send them to the act's author, and review again.",
  sound: "Foley events come from each act's code. The music bed is a separate stem for your editor; the mix is voice + foley only unless you include music.",
  render: "Assemble every act, render a draft, watch it, render the final 1080p H.264, then run QC (placeholders, loudness, duration).",
};

function stats(k: VideoKey, d: Details): React.ReactNode {
  const m = d.meta[k];
  const own: Record<VideoKey, [string, string]> = {
    script: [d.script.words ? String(d.script.words) : "—", "spoken words"], voice: [d.voice.sectionCount ? String(d.voice.sectionCount) : "—", "sections"],
    align: [d.align.durationMs ? dur(d.align.durationMs) : "—", "narration"], plan: [d.plan.acts.length ? String(d.plan.acts.length) : "—", "acts"],
    acts: [`${d.acts.filter((a) => a.scene).length}/${d.acts.length}`, "drawn"], sound: [d.sound.events != null ? String(d.sound.events) : "—", "foley events"], render: [d.render.videos.length ? String(d.render.videos.length) : "—", "videos"],
  };
  return (
    <>
      <StatTile value={own[k][0]} label={own[k][1]} />
      {m && <StatTile value={dur(m.totalMs)} label={`${m.runs} runs`} />}
      {m && m.totalCost > 0 && <StatTile value={money(m.totalCost)} label="Model cost" />}
    </>
  );
}

/** The Video section: the step bar on top, one step page below (the next step to do opens by default). */
function VideoSection() {
  const { d, route, go } = useApp();
  const states = useMemo(() => stepStates(d?.statuses), [d?.statuses]);
  if (!d) return null;
  const nextKey = STEPS.find((s) => states[s.key] === "next" || states[s.key] === "running")?.key ?? STEPS[0].key;
  const cur = route.step === "runs" || STEPS.some((s) => s.key === route.step) ? route.step! : nextKey;
  const body = cur === "runs" ? (
    <StepPage title="Runs" desc="" status="none" state="done" todo="Every run started from the dashboard (duration, CPU, memory, GPU) and every step the pipeline recorded (model and Claude cost)." >
      <HistoryStep />
    </StepPage>
  ) : (() => {
    const k = cur as VideoKey, View = VIEWS[k], st = d.statuses[k] ?? "none";
    const label = STEPS.find((s) => s.key === k)!.label;
    return <StepPage key={k} title={label} desc={DESC[k]} status={st} state={states[k]} todo={todoText(k, st, d)} stats={stats(k, d)} runAll={RUN_ALL[k]}><View /></StepPage>;
  })();
  return (
    <>
      <StepBar current={cur} onPick={(k) => go({ sec: "video", step: k })} />
      <div key={cur} className="min-h-0 flex-1 overflow-y-auto" id="step-scroll">{body}</div>
    </>
  );
}

/** A video project: the section tabs (Overview, Video, Shorts, Packaging) and the open section; the node view shows all of them at once. */
export function WorkspacePage() {
  const { d, route, mode } = useApp();
  if (!d) return <div className="p-6 text-muted-foreground">Loading…</div>;
  const scroll = (el: React.ReactNode) => <div className="min-h-0 flex-1 overflow-y-auto" id="step-scroll">{el}</div>;
  return (
    <>
      <SectionTabs />
      {mode === "nodes" ? <Suspense fallback={<div className="p-6 text-muted-foreground">Loading…</div>}><NodeView /></Suspense>
        : route.sec === "video" ? <VideoSection />
        : route.sec === "shorts" ? scroll(<ShortsPage />)
        : route.sec === "packaging" ? scroll(<PackagingPage />)
        : scroll(<ProjectOverview />)}
    </>
  );
}
