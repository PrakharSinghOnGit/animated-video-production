import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { useApp } from "@/hooks/app";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { DataTable, Td } from "@/components/DataTable";
import type { Sample } from "@/lib/types";

function Big({ title, value, h, pick, max, color, unit }: { title: string; value: string; h: Sample[]; pick: (s: Sample) => number | null; max: number; color: string; unit: string }) {
  const data = h.map((s, i) => ({ i, v: pick(s) ?? 0 }));
  const cfg = { v: { label: title, color } } satisfies ChartConfig;
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle><span className="flex-1" /><b className="text-[13px] font-semibold tabular-nums">{value}</b></CardHeader>
      <CardBody>
        <ChartContainer config={cfg} className="aspect-auto h-[130px] w-full">
          <AreaChart data={data} margin={{ left: 0, right: 4, top: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="i" hide />
            <YAxis domain={[0, max]} tickLine={false} axisLine={false} width={34} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel valueFormatter={(v) => `${Math.round(v * 10) / 10}${unit}`} />} />
            <Area dataKey="v" type="monotone" stroke="var(--color-v)" fill="var(--color-v)" fillOpacity={0.15} strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </AreaChart>
        </ChartContainer>
      </CardBody>
    </Card>
  );
}

export function MachinePage() {
  const { system: s } = useApp();
  if (!s) return <div className="p-6 text-muted-foreground">Loading…</div>;
  const n = s.now, H = s.history;
  return (
    <div className="mx-auto grid max-w-[1400px] gap-5 px-6 pb-12 pt-6 max-sm:px-4">
      <div>
        <h1 className="m-0 text-[20px] font-semibold leading-tight tracking-[-0.02em]">Machine</h1>
        <p className="m-0 mt-1 text-muted-foreground">{s.machine.cpu} · {s.machine.cores} cores · {s.machine.memGB} GB · {s.machine.host}. Sampled every 2 s while this page is open or a job runs (last {Math.round((H.length * 2) / 60)} min).</p>
      </div>
      <div className="grid gap-3.5 @3xl:grid-cols-2">
        <Big title="CPU" value={`${n.cpu.toFixed(0)}%`} h={H} pick={(x) => x.cpu} max={100} color="var(--chart-1)" unit="%" />
        <Big title="GPU" value={`${n.gpu ?? "—"}%`} h={H} pick={(x) => x.gpu} max={100} color="var(--chart-2)" unit="%" />
        <Big title="Memory" value={`${n.memUsedGB} / ${n.memTotalGB} GB${n.swapUsedGB ? ` · swap ${n.swapUsedGB} GB` : ""}`} h={H} pick={(x) => x.memUsedGB} max={n.memTotalGB} color="var(--chart-3)" unit=" GB" />
        <Big title="GPU memory" value={`${n.gpuMemGB ?? "—"} GB`} h={H} pick={(x) => x.gpuMemGB} max={Math.max(1, ...H.map((x) => x.gpuMemGB ?? 0))} color="var(--chart-4)" unit=" GB" />
      </div>
      <Card>
        <CardHeader><CardTitle>Cores</CardTitle></CardHeader>
        <CardBody>
          <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${n.cores.length}, minmax(0,1fr))` }}>
            {n.cores.map((c, i) => <i key={i} title={`${c}%`} className="relative block h-20 overflow-hidden rounded-sm bg-secondary"><i className="absolute inset-x-0 bottom-0 block bg-success" style={{ height: `${c}%` }} /></i>)}
          </div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader><CardTitle>Top processes</CardTitle></CardHeader>
        <DataTable head={[{ label: "Process" }, { label: "PID", right: true }, { label: "CPU", right: true }, { label: "Memory", right: true }]}>
          {s.top.map((p) => <tr key={p.pid}><Td className="font-mono">{p.comm}</Td><Td right className="text-muted-foreground">{p.pid}</Td><Td right>{p.cpu}%</Td><Td right>{p.rssMB} MB</Td></tr>)}
        </DataTable>
      </Card>
    </div>
  );
}
