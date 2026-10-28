import { useApp } from "@/hooks/app";
import { Flow, withKids } from "@/components/Flow";
import { stepSpec } from "@/lib/pipeline";
import { DataTable, Td } from "@/components/DataTable";
import { Note } from "@/components/FileLine";

export function PlanStep() {
  const { d, go } = useApp();
  if (!d) return null;
  const p = d.plan;
  const spec = stepSpec("plan", d);
  const kids: Record<string, React.ReactNode> = {
    plan: p.logline ? <div><b>Logline </b><span className="text-muted-foreground">{p.logline}</span></div> : undefined,
    review: (
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
      </>),
  };
  return <Flow loops={spec.loops} blocks={withKids(spec.blocks, kids)} />;
}
