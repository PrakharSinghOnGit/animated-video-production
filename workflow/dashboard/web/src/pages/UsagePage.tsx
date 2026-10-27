import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { useApp } from "@/hooks/app";
import { usePoll } from "@/hooks/usePoll";
import { useStored } from "@/lib/storage";
import type { TokRow, UsageReport } from "@/lib/types";
import { ago, dur, money, tok } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardSub, CardTitle } from "@/components/ui/card";
import { Input, NativeSelect } from "@/components/ui/fields";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { DataTable, Td } from "@/components/DataTable";

type Price = { in?: number; cw?: number; cr?: number; out?: number };
const COLORS = ["var(--chart-4)", "var(--chart-2)", "var(--chart-1)", "var(--chart-3)", "var(--chart-5)"];
const modelColor = (m: string, i: number) => (/opus/.test(m) ? COLORS[0] : /sonnet/.test(m) ? COLORS[1] : /haiku/.test(m) ? COLORS[2] : COLORS[3 + (i % 2)]);
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 864e5).toISOString().slice(0, 10);
const allTok = (x: { in: number; cw: number; cr: number; out: number }) => x.in + x.cw + x.cr + x.out;

export function UsagePage() {
  const { toast } = useApp();
  const [u, setU] = useState<UsageReport | null>(null);
  const [prices, setPrices] = useStored<Record<string, Price>>("prices", {});
  const [proj, setProj] = useStored("usageProject", "all");
  const [kindF, setKindF] = useStored("usageKind", "all");
  const [draft, setDraft] = useState<Record<string, Price>>(prices);

  const load = useCallback(async (force = false) => { try { setU(await api.usage(force)); } catch (e) { toast((e as Error).message); } }, [toast]);
  usePoll(() => load(), 30000);
  useEffect(() => setDraft(prices), [prices]);

  const m = useMemo(() => {
    if (!u) return null;
    const cost = (r: TokRow) => { const p = prices[r.model]; return p ? (r.in * (p.in ?? 0) + r.cacheWrite * (p.cw ?? 0) + r.cacheRead * (p.cr ?? 0) + r.out * (p.out ?? 0)) / 1e6 : null; };
    const rows = u.rows.filter((r) => (proj === "all" || r.project === proj) && (kindF === "all" || r.kind === kindF));
    const sum = (rs: TokRow[]) => rs.reduce((a, r) => { const c = cost(r); return { in: a.in + r.in, cw: a.cw + r.cacheWrite, cr: a.cr + r.cacheRead, out: a.out + r.out, n: a.n + r.replies, $: a.$ + (c ?? 0), unpriced: a.unpriced || c === null }; }, { in: 0, cw: 0, cr: 0, out: 0, n: 0, $: 0, unpriced: false });
    const today = iso(0), week = iso(6), month = iso(29);
    const models = [...new Set(u.rows.map((r) => r.model))].sort();
    const projects = [...new Set(u.rows.map((r) => r.project))].sort();
    const days = Array.from({ length: 30 }, (_, i) => iso(29 - i));
    const perDay = days.map((day) => ({ day: day.slice(5), ...Object.fromEntries(models.map((mo) => [mo, rows.filter((r) => r.day === day && r.model === mo).reduce((a, r) => a + r.in + r.cacheWrite + r.out, 0)])) }));
    const group = (key: "model" | "kind") => { const g: Record<string, TokRow[]> = {}; for (const r of rows.filter((r) => r.day >= month)) (g[r[key]] ??= []).push(r); return Object.entries(g).map(([k, rs]) => [k, sum(rs)] as const).sort((a, b) => allTok(b[1]) - allTok(a[1])); };
    const pipe = u.pipeline;
    const pipeBy: Record<string, { n: number; ms: number; $: number }> = {};
    for (const r of pipe) { const k = r.step.replace(/\s*\(.*\)$/, "").replace(/\bA\d+\b/, "A··").replace(/ r\d+$/, ""); const x = (pipeBy[k] ??= { n: 0, ms: 0, $: 0 }); x.n++; x.ms += r.ms ?? 0; x.$ += r.costUsd ?? 0; }
    return { T: sum(rows.filter((r) => r.day === today)), W: sum(rows.filter((r) => r.day >= week)), M: sum(rows.filter((r) => r.day >= month)), models, projects, perDay, byModel: group("model"), byKind: group("kind"), pipe, pipeBy, pipeTotal: pipe.reduce((a, r) => a + (r.costUsd ?? 0), 0) };
  }, [u, prices, proj, kindF]);

  if (!u || !m) return <div className="p-6 text-muted-foreground">Reading Claude Code's session logs…</div>;
  const priced = Object.keys(prices).length > 0;
  const cfg: ChartConfig = Object.fromEntries(m.models.map((mo, i) => [mo, { label: mo, color: modelColor(mo, i) }]));
  const kpi = (label: string, x: typeof m.T) => (
    <Card><CardBody className="gap-1"><span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span><b className="text-[22px]">{tok(allTok(x))} tokens</b>
      <span className="text-muted-foreground">{tok(x.out)} output · {tok(x.cr)} cache read · {x.n} replies</span>
      {priced && <span>{money(x.$)}{x.unpriced && <span className="text-muted-foreground"> (some models unpriced)</span>} est.</span>}</CardBody></Card>
  );
  return (
    <div className="mx-auto grid max-w-[1100px] gap-3.5 p-3 pb-24 md:p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1 basis-72">
          <h2 className="m-0 text-lg font-semibold tracking-tight">Claude usage</h2>
          <p className="m-0 mt-1 max-w-3xl text-muted-foreground">Read from Claude Code's local session logs (every reply's token counts, interactive and headless) and from each video's pipeline cost records. Updated {ago(u.scannedAt)} · {u.files} log files in {u.scanMs} ms.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <NativeSelect className="w-44" value={proj} onChange={(e) => setProj(e.target.value)} aria-label="Project"><option value="all">All projects</option>{m.projects.map((p) => <option key={p}>{p}</option>)}</NativeSelect>
          <NativeSelect className="w-48" value={kindF} onChange={(e) => setKindF(e.target.value)} aria-label="Session kind">
            {[["all", "All sessions"], ["interactive", "Interactive (you + me)"], ["pipeline", "Pipeline (claude -p)"], ["subagent", "Subagents"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </NativeSelect>
          <Button onClick={() => load(true)}>Refresh</Button>
        </div>
      </div>
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        {kpi("Today", m.T)}{kpi("Last 7 days", m.W)}{kpi("Last 30 days", m.M)}
        <Card><CardBody className="gap-1"><span className="text-[11px] uppercase tracking-wider text-muted-foreground">Pipeline cost (reported)</span><b className="text-[22px]">{money(m.pipeTotal)}</b><span className="text-muted-foreground">{m.pipe.length} paid or model steps across {new Set(m.pipe.map((r) => r.ws)).size} videos</span></CardBody></Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Tokens per day</CardTitle><CardSub>input + cache write + output, last 30 days</CardSub></CardHeader>
        <CardBody>
          <ChartContainer config={cfg} className="aspect-auto h-[220px] w-full">
            <BarChart data={m.perDay} margin={{ left: -8, right: 4, top: 4, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="day" tickLine={false} axisLine={false} interval={4} />
              <YAxis tickFormatter={(v) => tok(v)} tickLine={false} axisLine={false} width={44} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent valueFormatter={(v) => tok(v)} />} />
              <ChartLegend content={<ChartLegendContent />} />
              {m.models.map((mo) => <Bar key={mo} dataKey={mo} stackId="t" fill={`var(--color-${mo})`} isAnimationActive={false} />)}
            </BarChart>
          </ChartContainer>
        </CardBody>
      </Card>
      <div className="grid items-start gap-3.5 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>By model, 30 days</CardTitle></CardHeader>
          <DataTable head={[{ label: "Model" }, { label: "Input", right: true }, { label: "Cache write", right: true }, { label: "Cache read", right: true }, { label: "Output", right: true }, { label: "Replies", right: true }, ...(priced ? [{ label: "Est. $", right: true }] : [])]}>
            {m.byModel.map(([k, x]) => <tr key={k}><Td className="font-mono">{k}</Td><Td right>{tok(x.in)}</Td><Td right>{tok(x.cw)}</Td><Td right>{tok(x.cr)}</Td><Td right>{tok(x.out)}</Td><Td right>{x.n}</Td>{priced && <Td right>{prices[k] ? money(x.$) : "—"}</Td>}</tr>)}
          </DataTable></Card>
        <Card><CardHeader><CardTitle>By kind, 30 days</CardTitle></CardHeader>
          <DataTable head={[{ label: "Kind" }, { label: "Tokens", right: true }, { label: "Output", right: true }, { label: "Replies", right: true }]}>
            {m.byKind.map(([k, x]) => <tr key={k}><Td>{k}</Td><Td right>{tok(allTok(x))}</Td><Td right>{tok(x.out)}</Td><Td right>{x.n}</Td></tr>)}
          </DataTable>
          <div className="px-3 py-2 text-xs text-muted-foreground">Interactive = Claude Code sessions in the terminal; pipeline = the director, act authors, writer and reviewers run with <code>claude -p</code>; subagents = agents started from a session.</div></Card>
      </div>
      <div className="grid items-start gap-3.5 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Pipeline cost by step</CardTitle><CardSub>as reported by claude -p</CardSub></CardHeader>
          <DataTable head={[{ label: "Step" }, { label: "Runs", right: true }, { label: "Time", right: true }, { label: "Cost", right: true }]}>
            {Object.entries(m.pipeBy).sort((a, b) => b[1].$ - a[1].$).map(([k, x]) => <tr key={k}><Td>{k}</Td><Td right>{x.n}</Td><Td right>{dur(x.ms)}</Td><Td right>{money(x.$)}</Td></tr>)}
          </DataTable></Card>
        <Card><CardHeader><CardTitle>Prices per million tokens (optional)</CardTitle></CardHeader>
          <CardBody>
            <CardSub className="whitespace-normal">Stored in this browser only; nothing is assumed.</CardSub>
            <DataTable head={[{ label: "Model" }, { label: "Input" }, { label: "Cache write" }, { label: "Cache read" }, { label: "Output" }]}>
              {m.models.map((mo) => (
                <tr key={mo}><Td className="font-mono">{mo}</Td>{(["in", "cw", "cr", "out"] as const).map((k) => (
                  <Td key={k}><Input type="number" inputMode="decimal" step="0.01" min="0" className="w-20" placeholder="$" value={draft[mo]?.[k] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [mo]: { ...d[mo], [k]: e.target.value === "" ? undefined : Number(e.target.value) } }))} /></Td>
                ))}</tr>
              ))}
            </DataTable>
            <div><Button onClick={() => { setPrices(Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined))]).filter(([, v]) => Object.keys(v as object).length) as [string, Price][])); toast("Prices saved in this browser"); }}>Save prices</Button></div>
            <div className="text-xs text-muted-foreground">Enter the current prices from your plan or the pricing page to see dollar estimates for interactive sessions. Pipeline costs are the amounts claude -p reported.</div>
          </CardBody></Card>
      </div>
      <Card><CardHeader><CardTitle>Recent sessions</CardTitle><CardSub>{u.sessions.length}</CardSub></CardHeader>
        <DataTable maxH="460px" head={[{ label: "Last reply" }, { label: "Project" }, { label: "Kind" }, { label: "Models" }, { label: "Input + cache write", right: true }, { label: "Cache read", right: true }, { label: "Output", right: true }, { label: "Replies", right: true }, { label: "Session" }]}>
          {u.sessions.filter((s) => (proj === "all" || s.project === proj) && (kindF === "all" || s.kind === kindF)).map((s) => (
            <tr key={s.id}><Td className="whitespace-nowrap text-muted-foreground">{s.last ? new Date(s.last).toLocaleString() : ""}</Td><Td>{s.project}</Td><Td>{s.kind}</Td><Td className="font-mono">{Object.keys(s.models).join(", ")}</Td><Td right>{tok(s.total.in + s.total.cacheWrite)}</Td><Td right>{tok(s.total.cacheRead)}</Td><Td right>{tok(s.total.out)}</Td><Td right>{s.total.replies}</Td><Td className="font-mono text-muted-foreground">{s.id.slice(0, 8)}</Td></tr>
          ))}
        </DataTable></Card>
      <Card><CardHeader><CardTitle>Pipeline steps with a model</CardTitle></CardHeader>
        <DataTable maxH="420px" head={[{ label: "When" }, { label: "Video" }, { label: "Step" }, { label: "Model" }, { label: "Time", right: true }, { label: "Cost", right: true }]}>
          {[...m.pipe].sort((a, b) => String(b.at).localeCompare(String(a.at))).map((r, i) => (
            <tr key={i}><Td className="whitespace-nowrap text-muted-foreground">{r.at ? new Date(r.at).toLocaleString() : ""}</Td><Td className="font-mono">{r.ws}</Td><Td>{r.step}</Td><Td className="font-mono">{r.model ?? ""}</Td><Td right>{dur(r.ms)}</Td><Td right>{r.costUsd ? money(r.costUsd) : "free"}</Td></tr>
          ))}
        </DataTable></Card>
    </div>
  );
}
