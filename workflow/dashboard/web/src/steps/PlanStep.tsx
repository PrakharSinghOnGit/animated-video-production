import { useApp } from "@/hooks/app";
import { Flow } from "@/components/Flow";
import { DataTable, Td } from "@/components/DataTable";
import { Note } from "@/components/FileLine";
import { ok, reruns } from "./useStep";

export function PlanStep() {
  const { d, go } = useApp();
  if (!d) return null;
  const p = d.plan, checked = ok(d, "Validate plan");
  return (
    <Flow
      loops={[
        { from: "check", to: "plan", label: "invalid → re-plan", ran: reruns(d, "Plan acts") },
        { from: "review", to: "plan", label: "changes → re-plan", ran: reruns(d, "Plan acts") },
      ]}
      blocks={[
        { id: "plan", title: "Plan acts", action: "plan.run", label: "Plan acts", done: p.acts.length > 0, outAt: p.file?.mtime, costRe: /^direct\b/i,
          children: p.logline ? <div><b>Logline </b><span className="text-muted-foreground">{p.logline}</span></div> : undefined },
        { id: "check", title: "Validate plan", action: "plan.check", label: "Validate plan", done: checked && p.acts.length > 0 },
        { id: "review", title: "Review & approve plan", desc: "Gate G1: read the acts and the figures that come only from the narration.", done: p.acts.length > 0 && checked,
          children: (
            <>
              {p.unverified.length > 0 && (
                <Note tone="danger"><b>{p.unverified.length} on-screen figures come only from the narration. Fact-check before publishing:</b>
                  <ul className="m-0 mt-1.5 list-disc pl-5">{p.unverified.map((u) => <li key={u} className="font-mono text-xs">{u}</li>)}</ul></Note>
              )}
              <DataTable head={[{ label: "Act" }, { label: "Title" }, { label: "Time", right: true }, { label: "Length", right: true }, { label: "BPM", right: true }, { label: "Chapter" }, { label: "Beats", right: true }, { label: "Idea" }]}>
                {p.acts.map((a) => (
                  <tr key={a.id}>
                    <Td className="font-mono"><button className="min-h-8 text-brand hover:underline" onClick={() => { go({ act: a.id, step: "acts" }); }}>{a.id}</button></Td>
                    <Td>{a.title}</Td><Td right className="whitespace-nowrap">{(a.startMs / 1000).toFixed(1)}–{(a.endMs / 1000).toFixed(1)} s</Td>
                    <Td right>{((a.endMs - a.startMs) / 1000).toFixed(0)} s</Td><Td right>{a.bpm ?? ""}</Td>
                    <Td>{a.chapter ? `${a.chapter.n}. ${a.chapter.title}` : ""}</Td><Td right>{a.beats}</Td><Td className="min-w-64 text-muted-foreground">{a.idea}</Td>
                  </tr>
                ))}
                {p.acts.length === 0 && <tr><Td colSpan={8} className="text-muted-foreground">No plan yet.</Td></tr>}
              </DataTable>
            </>) },
      ]}
    />
  );
}
