import { useApp } from "@/hooks/app";
import { ActionCard } from "@/components/ActionCard";
import { ActionGrid } from "@/components/Layout";
import { Card, CardBody } from "@/components/ui/card";
import { DataTable, Td } from "@/components/DataTable";
import { gotoStep } from "@/lib/steps";
import { Note } from "@/components/FileLine";

export function PlanStep() {
  const { d, go } = useApp();
  if (!d) return null;
  const p = d.plan;
  return (
    <>
      <ActionGrid><ActionCard id="plan.run" /><ActionCard id="plan.check" /></ActionGrid>
      {p.logline && <Card><CardBody><b>Logline</b><span className="text-muted-foreground">{p.logline}</span></CardBody></Card>}
      {p.unverified.length > 0 && (
        <Note tone="danger">
          <b>{p.unverified.length} on-screen figures come only from the narration. Fact-check before publishing:</b>
          <ul className="m-0 mt-1.5 list-disc pl-5">{p.unverified.map((u) => <li key={u} className="font-mono text-xs">{u}</li>)}</ul>
        </Note>
      )}
      <Card>
        <DataTable head={[{ label: "Act" }, { label: "Title" }, { label: "Time", right: true }, { label: "Length", right: true }, { label: "BPM", right: true }, { label: "Chapter" }, { label: "Beats", right: true }, { label: "Idea" }]}>
          {p.acts.map((a) => (
            <tr key={a.id}>
              <Td className="font-mono"><button className="min-h-8 text-brand hover:underline" onClick={() => { go({ act: a.id, step: "acts" }); gotoStep("acts"); }}>{a.id}</button></Td>
              <Td>{a.title}</Td>
              <Td right className="whitespace-nowrap">{(a.startMs / 1000).toFixed(1)}–{(a.endMs / 1000).toFixed(1)} s</Td>
              <Td right>{((a.endMs - a.startMs) / 1000).toFixed(0)} s</Td>
              <Td right>{a.bpm ?? ""}</Td>
              <Td>{a.chapter ? `${a.chapter.n}. ${a.chapter.title}` : ""}</Td>
              <Td right>{a.beats}</Td>
              <Td className="min-w-64 text-muted-foreground">{a.idea}</Td>
            </tr>
          ))}
          {p.acts.length === 0 && <tr><Td colSpan={8} className="text-muted-foreground">No plan yet.</Td></tr>}
        </DataTable>
      </Card>
    </>
  );
}
