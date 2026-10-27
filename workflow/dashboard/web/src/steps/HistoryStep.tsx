import { useApp } from "@/hooks/app";
import { ActionCard } from "@/components/ActionCard";
import { ActionGrid } from "@/components/Layout";
import { Card, CardHeader, CardSub, CardTitle } from "@/components/ui/card";
import { DataTable, Td } from "@/components/DataTable";
import { StatusPill } from "@/components/Status";
import { dur, money, tok } from "@/lib/utils";

export function HistoryStep() {
  const { d } = useApp();
  if (!d) return null;
  const runs = [...d.runs].reverse(), t = [...d.timings].reverse();
  return (
    <>
      <ActionGrid><ActionCard id="timings.run" /></ActionGrid>
      <Card>
        <CardHeader><CardTitle>Dashboard runs</CardTitle><CardSub>{runs.length}</CardSub></CardHeader>
        <DataTable maxH="420px" head={[{ label: "When" }, { label: "Run" }, { label: "Status" }, { label: "Duration", right: true }, { label: "CPU avg / peak", right: true }, { label: "Memory peak", right: true }, { label: "GPU avg / peak", right: true }, { label: "Options" }]}>
          {runs.map((r) => (
            <tr key={r.id}>
              <Td className="whitespace-nowrap text-muted-foreground">{new Date(r.start).toLocaleString()}</Td>
              <Td>{r.label}<div className="font-mono text-[11px] text-muted-foreground">{(r.cmds ?? []).join(" → ")}</div></Td>
              <Td><StatusPill s={r.status === "done" ? "done" : "failed"} text={r.status === "done" ? "Done" : r.status === "stopped" ? "Stopped" : "Failed"} /></Td>
              <Td right>{dur(r.ms)}</Td>
              <Td right className="whitespace-nowrap">{r.cpuAvg ?? "—"}% / {r.cpuPeak ?? "—"}%</Td>
              <Td right>{r.rssPeakMB != null ? `${r.rssPeakMB} MB` : "—"}</Td>
              <Td right className="whitespace-nowrap">{r.gpuAvg ?? "—"}% / {r.gpuPeak ?? "—"}%</Td>
              <Td className="font-mono text-[11px] text-muted-foreground">{JSON.stringify(r.opts ?? {})}</Td>
            </tr>
          ))}
          {runs.length === 0 && <tr><Td colSpan={8} className="text-muted-foreground">No dashboard runs yet.</Td></tr>}
        </DataTable>
      </Card>
      <Card>
        <CardHeader><CardTitle>Pipeline steps (timings.json)</CardTitle><CardSub>{t.length}</CardSub></CardHeader>
        <DataTable maxH="520px" head={[{ label: "When" }, { label: "Step" }, { label: "Model" }, { label: "Duration", right: true }, { label: "Cost", right: true }, { label: "Input", right: true }, { label: "Cache read", right: true }, { label: "Output", right: true }]}>
          {t.map((r, i) => (
            <tr key={i}>
              <Td className="whitespace-nowrap text-muted-foreground">{r.at ? new Date(r.at).toLocaleString() : ""}</Td>
              <Td>{r.step}{r.note && <div className="text-muted-foreground">{r.note}</div>}</Td>
              <Td className="font-mono">{r.model ?? ""}</Td>
              <Td right>{dur(r.ms)}</Td>
              <Td right>{r.costUsd ? money(r.costUsd) : ""}</Td>
              <Td right>{r.inputTokens ? tok(r.inputTokens) : ""}</Td>
              <Td right>{r.cacheReadTokens ? tok(r.cacheReadTokens) : ""}</Td>
              <Td right>{r.outputTokens ? tok(r.outputTokens) : ""}</Td>
            </tr>
          ))}
        </DataTable>
      </Card>
    </>
  );
}
