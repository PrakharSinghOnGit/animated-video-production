import { useEffect, useState } from "react";
import { useApp } from "@/hooks/app";
import { api } from "@/lib/api";
import { ago } from "@/lib/utils";
import { BlockFold, Flow, withKids } from "@/components/Flow";
import { scriptApproved, stepSpec } from "@/lib/pipeline";
import { StatusPill } from "@/components/Status";
import { Card, CardBody, CardHeader, CardSub, CardTitle } from "@/components/ui/card";
import { TextEditor, useDraft } from "@/components/TextEditor";
import { Prose } from "@/components/FileLine";
import { ScriptReader } from "@/components/ScriptReader";
import { ResearchPanel } from "@/components/ResearchPanel";

export function ScriptStep() {
  const { d, ws, refresh } = useApp();
  const [scriptText, setScriptText] = useState("");
  const mtime = d?.script.file?.mtime ?? 0;
  useEffect(() => { if (ws) api.script(ws).then(setScriptText).catch(() => setScriptText("")); }, [ws, mtime]);
  const idea = useDraft(d?.script.idea ?? ""), feedback = useDraft(d?.script.feedback ?? ""), script = useDraft(scriptText);
  if (!d || !ws) return null;
  const s = d.script, ap = s.approval, approved = scriptApproved(d), spec = stepSpec("script", d);
  const apTxt: Record<string, string> = { approved: `Approved ${ago(s.approvedAt)}`, "changed since approval": "Edited after approval: approve again", "not approved": "Waiting for your review", legacy: "Older video (no approval needed)", "no script": "No script yet" };
  const saveText = (which: "idea" | "feedback") => async (t: string) => { await api.saveText(ws, which, t); await refresh(); };
  const kids: Record<string, React.ReactNode> = {
    draft: <TextEditor title="Your draft" sub="02-scripting/idea.md" rows={12} draft={idea} onSave={saveText("idea")}
      placeholder={"What the video is about, the points you want to make, facts with their sources, examples...\n\n[make the hook about the money that never reaches companies]\n[keep it under 9 minutes]"} />,
    research: <ResearchPanel />,
    write: (
      <div className="grid gap-3">
        <div className="grid items-start gap-3.5 @6xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Card><CardHeader><CardTitle>Script</CardTitle><CardSub>clean: only what will be said{s.file ? ` · saved ${ago(s.file.mtime)}` : ""}</CardSub></CardHeader>
            <CardBody>{scriptText.trim() ? <ScriptReader raw={scriptText} words={s.words} /> : <span className="text-xs text-muted-foreground">Appears after Write script.</span>}</CardBody></Card>
          <Card><CardHeader><CardTitle>Writer's notes</CardTitle><CardSub>hooks and scores, numbers to verify, questions</CardSub></CardHeader>
            <CardBody>{s.notes ? <Prose>{s.notes}</Prose> : <span className="text-xs text-muted-foreground">Appears after Write script.</span>}</CardBody></Card>
        </div>
        <BlockFold title="Edit the full script (with tone notes for the voice and on-screen hints for the director)" defaultOpen={!scriptText.trim()}>
          <TextEditor title="Script file" sub={`02-scripting/script_raw.md${s.file ? ` · saved ${ago(s.file.mtime)}` : ""}`} rows={24} draft={script} spellCheck
            onSave={async (t) => { await api.saveScript(ws, t); setScriptText(t); await refresh(); }}
            placeholder={"### Part 1: Hook\n**VO:** `[VO: calm documentary tone]` ...\n**[ON SCREEN]:** ..."}
            hint={<>Format: <code>### Part n: Title</code>; <code>**VO:** `[VO: tone]` text</code>; <code>**[ON SCREEN]:** hint</code>. Saving after approval needs a new approval. {s.words ? `${s.words} spoken words · ${(s.words / 150).toFixed(1)} min at 150 wpm.` : ""}</>} />
        </BlockFold>
      </div>),
    approve: (
      <>
        <div className="flex flex-wrap items-center gap-3"><StatusPill s={approved ? "done" : s.file ? "partial" : "none"} text={apTxt[ap]} /></div>
        <TextEditor title="Feedback for a revision" sub="02-scripting/feedback.md" rows={6} draft={feedback} onSave={saveText("feedback")}
          placeholder="What to change in the last script. When this is newer than the script, Write script revises instead of starting over."
          hint="Save feedback, then run “Script written” again to loop back. Small changes: edit the script directly (free)." />
      </>),
    format: <div className="text-xs text-muted-foreground">{s.sections ? `${s.sections} voice sections in 03-voiceover/sections.` : "Not split yet."}</div>,
  };
  return <Flow loops={spec.loops} blocks={withKids(spec.blocks, kids)} />;
}
