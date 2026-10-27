import { useEffect, useState } from "react";
import { useApp } from "@/hooks/app";
import { api } from "@/lib/api";
import { ago } from "@/lib/utils";
import { Flow } from "@/components/Flow";
import { StatusPill } from "@/components/Status";
import { Card, CardBody, CardHeader, CardSub, CardTitle } from "@/components/ui/card";
import { TextEditor, useDraft } from "@/components/TextEditor";
import { Prose } from "@/components/FileLine";
import { Cols } from "@/components/Layout";
import { reruns } from "./useStep";

export function ScriptStep() {
  const { d, ws, refresh } = useApp();
  const [scriptText, setScriptText] = useState("");
  const mtime = d?.script.file?.mtime ?? 0;
  useEffect(() => { if (ws) api.script(ws).then(setScriptText).catch(() => setScriptText("")); }, [ws, mtime]);
  const idea = useDraft(d?.script.idea ?? ""), feedback = useDraft(d?.script.feedback ?? ""), script = useDraft(scriptText);
  if (!d || !ws) return null;
  const s = d.script, ap = s.approval, approved = ap === "approved" || ap === "legacy";
  const apTxt: Record<string, string> = { approved: `Approved ${ago(s.approvedAt)}`, "changed since approval": "Edited after approval: approve again", "not approved": "Waiting for your review", legacy: "Older video (no approval needed)", "no script": "No script yet" };
  const saveText = (which: "idea" | "feedback") => async (t: string) => { await api.saveText(ws, which, t); await refresh(); };
  return (
    <Flow
      loops={[{ from: "approve", to: "write", label: "feedback → rewrite", ran: reruns(d, "Write script") }]}
      blocks={[
        { id: "draft", title: "Draft", desc: "Your idea in plain text. [Square brackets] are instructions to the writer, never narration.", done: !!s.idea.trim(),
          children: <TextEditor title="Your draft" sub="02-scripting/idea.md" rows={12} draft={idea} onSave={saveText("idea")}
            placeholder={"What the video is about, the points you want to make, facts with their sources, examples...\n\n[make the hook about the money that never reaches companies]\n[keep it under 9 minutes]"} /> },
        { id: "write", title: "Script written", action: "script.write", label: "Write script", done: !!s.file, outAt: s.file?.mtime, costRe: /^write script/i,
          children: (
            <Cols>
              <TextEditor title="Script" sub={`02-scripting/script_raw.md${s.file ? ` · saved ${ago(s.file.mtime)}` : ""}`} rows={24} draft={script} spellCheck
                onSave={async (t) => { await api.saveScript(ws, t); setScriptText(t); await refresh(); }}
                placeholder={"### Part 1: Hook\n**VO:** `[VO: calm documentary tone]` ...\n**[ON SCREEN]:** ..."}
                hint={<>Format: <code>### Part n: Title</code>; <code>**VO:** `[VO: tone]` text</code>; <code>**[ON SCREEN]:** hint</code>. Saving after approval needs a new approval. {s.words ? `${s.words} spoken words · ${(s.words / 150).toFixed(1)} min at 150 wpm.` : ""}</>} />
              <Card><CardHeader><CardTitle>Writer's notes</CardTitle><CardSub>hooks and scores, numbers to verify, questions</CardSub></CardHeader>
                <CardBody>{s.notes ? <Prose>{s.notes}</Prose> : <span className="text-xs text-muted-foreground">Appears after Write script.</span>}</CardBody></Card>
            </Cols>) },
        { id: "approve", title: "Reviewed & approved", desc: "Gate G1a: read it, edit it, or write feedback and rewrite. Approving locks this exact script for voicing.", action: "script.approve", label: "Approve script", done: approved,
          note: s.file ? undefined : "Write or paste a script first.",
          children: (
            <>
              <div className="flex flex-wrap items-center gap-3"><StatusPill s={approved ? "done" : s.file ? "partial" : "none"} text={apTxt[ap]} /></div>
              <TextEditor title="Feedback for a revision" sub="02-scripting/feedback.md" rows={6} draft={feedback} onSave={saveText("feedback")}
                placeholder="What to change in the last script. When this is newer than the script, Write script revises instead of starting over."
                hint="Save feedback, then run “Script written” again to loop back. Small changes: edit the script directly (free)." />
            </>) },
        { id: "format", title: "Split into sections", action: "script.format", label: "Split into voice sections", done: s.sections > 0 && approved,
          children: <div className="text-xs text-muted-foreground">{s.sections ? `${s.sections} voice sections in 03-voiceover/sections.` : "Not split yet."}</div> },
      ]}
    />
  );
}
