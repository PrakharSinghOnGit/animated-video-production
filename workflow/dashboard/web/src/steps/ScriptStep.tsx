import { useEffect, useState } from "react";
import { useApp } from "@/hooks/app";
import { api } from "@/lib/api";
import { ago, cn } from "@/lib/utils";
import { ActionCard } from "@/components/ActionCard";
import { StatusPill } from "@/components/Status";
import { Card, CardBody, CardHeader, CardSub, CardTitle } from "@/components/ui/card";
import { ActionGrid, Cols } from "@/components/Layout";
import { TextEditor, useDraft } from "@/components/TextEditor";
import { Prose } from "@/components/FileLine";

export function ScriptStep() {
  const { d, ws, refresh } = useApp();
  const [scriptText, setScriptText] = useState("");
  const mtime = d?.script.file?.mtime ?? 0;
  useEffect(() => { if (ws) api.script(ws).then(setScriptText).catch(() => setScriptText("")); }, [ws, mtime]);
  const idea = useDraft(d?.script.idea ?? ""), feedback = useDraft(d?.script.feedback ?? ""), script = useDraft(scriptText);
  if (!d || !ws) return null;
  const s = d.script, ap = s.approval;
  const stage = !s.idea ? 0 : !s.file ? 1 : ap === "approved" || ap === "legacy" ? (d.statuses.script === "done" ? 4 : 3) : 2;
  const flow = ["Draft", "Script written", "Reviewed & approved", "Split into sections"];
  const apTxt: Record<string, string> = { approved: `Approved ${ago(s.approvedAt)}`, "changed since approval": "Edited after approval: approve again", "not approved": "Waiting for your review", legacy: "Older video (no approval needed)", "no script": "No script yet" };
  const saveIdea = (which: "idea" | "feedback") => async (t: string) => { await api.saveText(ws, which, t); await refresh(); };
  return (
    <>
      <div className="flex flex-wrap items-center gap-3.5">
        <ol className="m-0 flex list-none flex-wrap p-0 text-xs">
          {flow.map((l, i) => (
            <li key={l} className={cn("border px-2.5 py-1 first:rounded-l-md last:rounded-r-md [&+&]:border-l-0", i < stage ? "bg-success/10 text-success" : i === stage ? "bg-warning/10 text-warning" : "text-muted-foreground")}>{i + 1}. {l}</li>
          ))}
        </ol>
        <StatusPill s={ap === "approved" || ap === "legacy" ? "done" : s.file ? "partial" : "none"} text={apTxt[ap]} />
        <span className="text-xs text-muted-foreground">{s.words ? `${s.words} spoken words · ${(s.words / 150).toFixed(1)} min at 150 wpm` : ""}</span>
      </div>
      <Cols>
        <TextEditor title="1 · Your draft" sub="02-scripting/idea.md · plain text, [notes to the writer]" rows={14} draft={idea} onSave={saveIdea("idea")}
          placeholder={"What the video is about, the points you want to make, facts with their sources, examples...\n\n[make the hook about the money that never reaches companies]\n[keep it under 9 minutes]"} />
        <TextEditor title="Feedback for a revision" sub="02-scripting/feedback.md" rows={8} draft={feedback} onSave={saveIdea("feedback")}
          placeholder="What to change in the last script. When this is newer than the script, Write script revises instead of starting over."
          hint="Small changes: edit the script directly instead (free)." />
      </Cols>
      <ActionGrid>
        <ActionCard id="script.write" />
        <ActionCard id="script.approve" hint={s.file ? undefined : "Write or paste a script first."} />
        <ActionCard id="script.format" />
      </ActionGrid>
      <Cols>
        <TextEditor title="2 · Script" sub={`02-scripting/script_raw.md${s.file ? ` · saved ${ago(s.file.mtime)}` : ""}`} rows={26} draft={script} spellCheck
          onSave={async (t) => { await api.saveScript(ws, t); setScriptText(t); await refresh(); }}
          placeholder={"### Part 1: Hook\n**VO:** `[VO: calm documentary tone]` ...\n**[ON SCREEN]:** ..."}
          hint={<>Format: <code>### Part n: Title</code> or <code>### CHAPTER n: Title</code>; <code>**VO:** `[VO: tone]` text</code>; <code>**[ON SCREEN]:** hint</code> (not spoken). Saving after approval needs a new approval.</>} />
        <Card>
          <CardHeader><CardTitle>Writer's notes</CardTitle><CardSub>hooks and scores, numbers to verify, questions</CardSub></CardHeader>
          <CardBody>{s.notes ? <Prose>{s.notes}</Prose> : <span className="text-xs text-muted-foreground">Appears after Write script.</span>}</CardBody>
        </Card>
      </Cols>
    </>
  );
}
