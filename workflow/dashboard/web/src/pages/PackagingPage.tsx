import { useEffect } from "react";
import { useApp } from "@/hooks/app";
import { stepStates, todoText } from "@/lib/steps";
import { dur, money } from "@/lib/utils";
import { PublishStep } from "@/steps/PublishStep";
import { StatTile } from "@/components/StatTile";
import { StepPage } from "@/components/StepPage";

const DESC = "YouTube packaging: three packages for Test & Compare (a Briefing-style thumbnail with its title), the description with computed chapters, sources and credits, tags. A vision critic checks the thumbnails against the guide (workflow/07-publish/GUIDE.md); you review, fix with notes, edit the text and approve. Approval is a human gate and goes stale if anything changes afterwards.";

/** Packaging section: thumbnail, title, description (the former Publish step) with its review, fix and re-render actions. */
export function PackagingPage() {
  const { d, route } = useApp();
  // a node-view click lands on one block of the flow
  useEffect(() => {
    if (!route.step) return;
    const t = setTimeout(() => document.querySelector(`[data-block="${CSS.escape(route.step!)}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" }), 150);
    return () => clearTimeout(t);
  }, [route.step]);
  if (!d) return null;
  const st = d.statuses.publish ?? "none", m = d.meta.publish;
  // packaging has no "next step" of its own: it follows the video
  const state = st === "done" ? "done" : st === "running" ? "running" : stepStates(d.statuses).render === "done" ? "next" : "blocked";
  return (
    <StepPage title="Packaging" desc={DESC} status={st} state={state} todo={todoText("publish", st, d)} runAll="publish.all"
      stats={<><StatTile value={`${d.publish.thumbs.filter((t) => t.file).length}/3`} label="thumbnails" />{m && <StatTile value={dur(m.totalMs)} label={`${m.runs} runs`} />}{m && m.totalCost > 0 && <StatTile value={money(m.totalCost)} label="Claude cost" />}</>}>
      <PublishStep />
    </StepPage>
  );
}
