import { useEffect, useMemo, useState } from "react";
import { BarChart3, RefreshCw } from "lucide-react";
import { useApp } from "@/hooks/app";
import { useStored } from "@/lib/storage";
import type { ProviderId, ProviderReport, URow, UsageReport } from "@/lib/types";
import { LimitsMeter } from "@/components/LimitsMeter";
import { ago, cn, dur, money, tok } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardSub, CardTitle } from "@/components/ui/card";
import { Input, NativeSelect } from "@/components/ui/fields";
import { EmptyState, PageHeader, Segmented, StatCard } from "@/components/ui/layout";
import { DataTable, Td } from "@/components/DataTable";
import { costLabel, DailyChart, fresh, iso, LimitBars, PROVIDER_IDS, PROVIDER_META, sumRows, type Sum } from "@/components/usage/shared";

type Price = { in?: number; cw?: number; cr?: number; out?: number };
type Tab = "all" | ProviderId;
type Pipe = UsageReport["pipeline"][number];
const MODEL_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-4)", "var(--chart-5)", "var(--chart-3)"];

/** Pipeline rows → provider (older rows have no provider field). */
const provOf = (r: Pipe): ProviderId => r.provider ?? (/^agy|gemini/i.test(r.model ?? "") ? "agy" : "claude");
const stepKey = (s: string) => s.replace(/\s*\(.*\)$/, "").replace(/\bA\d+\b/, "A··").replace(/ r\d+$/, "");

export function UsagePage() {
  const { usage: u, loadUsage: load } = useApp();
  const [tab, setTab] = useStored<Tab>("usageTab", "all");
  const [prices, setPrices] = useStored<Record<string, Price>>("prices", {});
  useEffect(() => { void load(); }, [load]);

  const providers = useMemo<ProviderReport[]>(() => {
    if (!u) return [];
    // older servers only send the default Claude profile
    return u.providers ?? [{ id: "claude", label: "Claude", source: "~/.claude/projects", found: true, files: u.files, costKind: "estimate", rows: u.rows, recent: [] }];
  }, [u]);
  const price = useMemo(() => (r: URow) => { const p = prices[r.model]; return p ? (r.in * (p.in ?? 0) + r.cacheWrite * (p.cw ?? 0) + r.cacheRead * (p.cr ?? 0) + r.out * (p.out ?? 0)) / 1e6 : null; }, [prices]);

  if (!u) return <div className="p-6 text-muted-foreground">Reading the local usage logs…</div>;
  const current = providers.find((p) => p.id === tab);
  const pipe = u.pipeline;

  return (
    <div className="mx-auto grid max-w-[1400px] gap-5 px-6 pb-12 pt-6 max-sm:px-4">
      <PageHeader
        title="Usage"
        sub={`Every model this machine runs: Claude (two profiles), Codex, OpenCode, agy and local Ollama, from each tool's own logs plus the pipeline's cost records. Updated ${ago(u.scannedAt)} in ${u.scanMs} ms.`}
        actions={<Button variant="secondary" onClick={() => load(true)}><RefreshCw />Refresh</Button>}
      />
      <div className="-mx-1 overflow-x-auto px-1 pb-0.5">
        <Segmented<Tab> label="Provider" value={tab} onChange={setTab} className="w-max"
          options={[{ value: "all", label: "All" }, ...PROVIDER_IDS.map((id) => ({ value: id as Tab, label: <span className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: PROVIDER_META[id].color }} />{PROVIDER_META[id].label}</span> }))]} />
      </div>
      {tab === "all" || !current
        ? <AllView providers={providers} pipe={pipe} price={price} priced={Object.keys(prices).length > 0} onPick={setTab} />
        : <ProviderView key={current.id} p={current} pipe={pipe.filter((r) => provOf(r) === current.id)} price={price} prices={prices} setPrices={setPrices} />}
    </div>
  );
}

// ───────────────────────────── All providers ─────────────────────────────

function AllView({ providers, pipe, price, priced, onPick }: { providers: ProviderReport[]; pipe: Pipe[]; price: (r: URow) => number | null; priced: boolean; onPick: (t: Tab) => void }) {
  const month = iso(29), week = iso(6);
  const stats = providers.map((p) => {
    const pr = p.costKind === "estimate" ? price : undefined;
    return { p, M: sumRows(p.rows, month, pr), W: sumRows(p.rows, week, pr), runs: pipe.filter((r) => provOf(r) === p.id) };
  });
  const total = stats.reduce((a, s) => a + fresh(s.M), 0);
  const pipeCost = pipe.reduce((a, r) => a + (r.costUsd ?? 0), 0);
  const byProv = PROVIDER_IDS.map((id) => { const rs = pipe.filter((r) => provOf(r) === id); return { id, n: rs.length, ms: rs.reduce((a, r) => a + (r.ms ?? 0), 0), cost: rs.reduce((a, r) => a + (r.costUsd ?? 0), 0) }; }).filter((x) => x.n);
  const claudeLimits = providers.find((p) => p.id === "claude");
  const codex = providers.find((p) => p.id === "codex");
  return (
    <>
      <div className="grid grid-cols-2 gap-3.5 max-sm:gap-2.5 xl:grid-cols-4">
        <StatCard label="Tokens, last 30 days" value={tok(total)} hint="input + cache write + output, all providers" />
        <StatCard label="Active providers" value={`${stats.filter((s) => fresh(s.M) > 0 || s.runs.length).length} of ${providers.length}`} hint="with activity in 30 days" />
        <StatCard label="Pipeline cost (reported)" value={money(pipeCost)} hint={`${pipe.length} model steps across ${new Set(pipe.map((r) => r.ws)).size} videos`} />
        <StatCard label="Pipeline time" value={dur(pipe.reduce((a, r) => a + (r.ms ?? 0), 0))} hint="wall time of all model steps" />
      </div>
      <Card>
        <CardHeader><CardTitle>Tokens per day by provider</CardTitle><CardSub>input + cache write + output, last 30 days</CardSub></CardHeader>
        <CardBody><DailyChart series={providers.map((p) => ({ key: p.id, label: PROVIDER_META[p.id].label, color: PROVIDER_META[p.id].color }))} rowsOf={(k) => providers.find((p) => p.id === k)?.rows ?? []} /></CardBody>
      </Card>
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
        {stats.map(({ p, M, W, runs }) => (
          <button key={p.id} type="button" onClick={() => onPick(p.id)} className="group rounded-[10px] border bg-card p-4 text-left shadow-sm transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40">
            <div className="flex items-center gap-2">
              <span className="size-2.5 rounded-full" style={{ background: PROVIDER_META[p.id].color }} />
              <b className="text-[13px] font-semibold">{p.label}</b>
              <span className="ml-auto text-[11px] text-subtle-foreground">{costLabel(p.costKind, M, priced)}</span>
            </div>
            {p.found || runs.length ? (
              <>
                <div className="mt-2.5 text-[20px] font-semibold tabular-nums tracking-[-0.02em]">{tok(fresh(M))}<span className="ml-1 text-[12px] font-normal text-muted-foreground">tokens · 30 d</span></div>
                <div className="mt-1 text-[12px] text-muted-foreground">{tok(fresh(W))} this week · {tok(M.cr)} cache read · {runs.length} pipeline run{runs.length === 1 ? "" : "s"}</div>
              </>
            ) : <div className="mt-2.5 text-[12.5px] text-muted-foreground">{p.id === "ollama" ? "No Ollama runs yet." : `No logs found in ${p.source}.`}</div>}
          </button>
        ))}
      </div>
      <div className="grid items-start gap-3.5 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Plan limits</CardTitle><CardSub>Claude (status line) and Codex (session logs)</CardSub></CardHeader>
          <CardBody className="gap-4">
            <div><div className="mb-2 text-[12px] font-medium">Claude</div>{claudeLimits ? <LimitsMeter /> : null}</div>
            <div><div className="mb-2 text-[12px] font-medium">Codex</div><LimitBars limits={codex?.limits ?? []} at={codex?.limitsAt} /></div>
          </CardBody></Card>
        <Card><CardHeader><CardTitle>Pipeline by provider</CardTitle><CardSub>steps run by the video pipeline</CardSub></CardHeader>
          {byProv.length ? (
            <DataTable head={[{ label: "Provider" }, { label: "Runs", right: true }, { label: "Time", right: true }, { label: "Cost", right: true }]}>
              {byProv.map((x) => <tr key={x.id}><Td><span className="mr-2 inline-block size-2 rounded-full align-middle" style={{ background: PROVIDER_META[x.id].color }} />{PROVIDER_META[x.id].label}</Td><Td right>{x.n}</Td><Td right>{dur(x.ms)}</Td><Td right>{x.cost ? money(x.cost) : "free"}</Td></tr>)}
            </DataTable>
          ) : <CardBody><span className="text-muted-foreground">No pipeline model steps recorded yet.</span></CardBody>}
        </Card>
      </div>
      <PipelineTable rows={pipe} showProvider />
    </>
  );
}

// ───────────────────────────── One provider ─────────────────────────────

function ProviderView({ p, pipe, price, prices, setPrices }: { p: ProviderReport; pipe: Pipe[]; price: (r: URow) => number | null; prices: Record<string, Price>; setPrices: (v: Record<string, Price>) => void }) {
  const isClaude = p.id === "claude" || p.id === "claude-iit";
  const [proj, setProj] = useStored(`usageProject.${p.id}`, "all");
  const [kindF, setKindF] = useStored(`usageKind.${p.id}`, "all");
  const rows = useMemo(() => p.rows.filter((r) => !isClaude || ((proj === "all" || r.project === proj) && (kindF === "all" || r.kind === kindF))), [p.rows, isClaude, proj, kindF]);
  const pr = p.costKind === "estimate" ? price : undefined;
  const priced = Object.keys(prices).length > 0;
  const T = sumRows(rows, iso(0), pr), W = sumRows(rows, iso(6), pr), M = sumRows(rows, iso(29), pr);
  const models = useMemo(() => [...new Set(rows.map((r) => r.model))].sort(), [rows]);
  const projects = useMemo(() => [...new Set(p.rows.map((r) => r.project ?? ""))].filter(Boolean).sort(), [p.rows]);
  const byModel = models.map((m) => [m, sumRows(rows.filter((r) => r.model === m), iso(29), pr)] as const).sort((a, b) => fresh(b[1]) - fresh(a[1]));
  const kinds = isClaude ? [...new Set(rows.map((r) => r.kind ?? ""))].map((k) => [k, sumRows(rows.filter((r) => r.kind === k), iso(29))] as const).sort((a, b) => fresh(b[1]) - fresh(a[1])) : [];
  const hasLimits = p.id === "claude" || (p.limits?.length ?? 0) > 0;

  if (!p.found && !pipe.length) {
    return (
      <Card><CardBody>
        <EmptyState icon={<BarChart3 />} title={p.id === "ollama" ? "No Ollama runs yet" : `No ${p.label} usage found`}>
          {p.id === "ollama" ? "Pick a local Ollama model for a pipeline step and its runs will show up here. Local models are free." : <>Nothing in <code>{p.source}</code> yet. Usage appears after the first session with {p.label}.</>}
        </EmptyState>
      </CardBody></Card>
    );
  }
  const kpi = (label: string, s: Sum) => (
    <StatCard label={label} value={`${tok(fresh(s))} tokens`} hint={<>{tok(s.out)} output · {tok(s.cr)} cache read · {s.n} {p.id === "opencode" ? "sessions" : p.id === "agy" ? "steps" : "replies"}<br />{costLabel(p.costKind, s, priced)}</>} />
  );
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
        <span className="size-2.5 rounded-full" style={{ background: PROVIDER_META[p.id].color }} />
        <span>Source: <code className="text-foreground/80">{p.source}</code> · {p.files} {p.id === "opencode" ? "sessions" : "log files"}</span>
        {isClaude && (
          <span className="ml-auto flex flex-wrap gap-2">
            <NativeSelect className="w-44" value={proj} onChange={(e) => setProj(e.target.value)} aria-label="Project"><option value="all">All projects</option>{projects.map((x) => <option key={x}>{x}</option>)}</NativeSelect>
            <NativeSelect className="w-48" value={kindF} onChange={(e) => setKindF(e.target.value)} aria-label="Session kind">
              {[["all", "All sessions"], ["interactive", "Interactive"], ["pipeline", "Pipeline (claude -p)"], ["subagent", "Subagents"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </NativeSelect>
          </span>
        )}
      </div>
      {p.note && <p className="m-0 -mt-2 max-w-3xl text-[12px] text-subtle-foreground">{p.note}</p>}
      <div className="grid grid-cols-2 gap-3.5 max-sm:gap-2.5 xl:grid-cols-4">
        {kpi("Today", T)}{kpi("Last 7 days", W)}{kpi("Last 30 days", M)}
        <StatCard label="Pipeline runs" value={String(pipe.length)} hint={<>{dur(pipe.reduce((a, r) => a + (r.ms ?? 0), 0))} · {money(pipe.reduce((a, r) => a + (r.costUsd ?? 0), 0))} reported</>} />
      </div>
      <div className={cn("grid items-start gap-3.5", hasLimits && "lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]")}>
        <Card>
          <CardHeader><CardTitle>Tokens per day</CardTitle><CardSub>input + cache write + output, by model</CardSub></CardHeader>
          <CardBody><DailyChart series={models.map((m, i) => ({ key: m, label: m, color: MODEL_COLORS[i % MODEL_COLORS.length] }))} rowsOf={(m) => rows.filter((r) => r.model === m)} /></CardBody>
        </Card>
        {hasLimits && (
          <Card><CardHeader><CardTitle>Plan limits</CardTitle></CardHeader>
            <CardBody>{p.id === "claude" ? <LimitsMeter /> : <LimitBars limits={p.limits ?? []} at={p.limitsAt} />}</CardBody></Card>
        )}
      </div>
      <div className={cn("grid items-start gap-3.5", kinds.length > 0 && "lg:grid-cols-2")}>
        <Card><CardHeader><CardTitle>By model, 30 days</CardTitle></CardHeader>
          <DataTable head={[{ label: "Model" }, { label: "Input", right: true }, { label: "Cache write", right: true }, { label: "Cache read", right: true }, { label: "Output", right: true }, { label: p.id === "opencode" ? "Sessions" : "Calls", right: true }, { label: "Cost", right: true }]}>
            {byModel.map(([k, x]) => <tr key={k}><Td className="font-mono">{k}</Td><Td right>{tok(x.in)}</Td><Td right>{tok(x.cw)}</Td><Td right>{tok(x.cr)}</Td><Td right>{tok(x.out)}</Td><Td right>{x.n}</Td><Td right>{costLabel(p.costKind, x, priced)}</Td></tr>)}
          </DataTable></Card>
        {kinds.length > 0 && (
          <Card><CardHeader><CardTitle>By kind, 30 days</CardTitle></CardHeader>
            <DataTable head={[{ label: "Kind" }, { label: "Tokens", right: true }, { label: "Output", right: true }, { label: "Replies", right: true }]}>
              {kinds.map(([k, x]) => <tr key={k}><Td>{k}</Td><Td right>{tok(fresh(x))}</Td><Td right>{tok(x.out)}</Td><Td right>{x.n}</Td></tr>)}
            </DataTable>
            <div className="px-3 py-2 text-xs text-muted-foreground">Interactive = terminal sessions; pipeline = steps run with <code>claude -p</code>; subagents = agents started from a session.</div></Card>
        )}
      </div>
      {p.recent.length > 0 && (
        <Card><CardHeader><CardTitle>Recent sessions</CardTitle><CardSub>{p.recent.length}</CardSub></CardHeader>
          <DataTable maxH="420px" head={[{ label: "Last activity" }, ...(isClaude || p.id === "opencode" ? [{ label: "Project" }] : []), { label: "Model" }, { label: "Input + cache write", right: true }, { label: "Cache read", right: true }, { label: "Output", right: true }, { label: "Calls", right: true }, ...(p.id === "opencode" ? [{ label: "Cost", right: true }] : []), { label: "Session" }]}>
            {p.recent.filter((s) => !isClaude || ((proj === "all" || s.project === proj) && (kindF === "all" || s.kind === kindF))).map((s) => (
              <tr key={s.id}><Td className="whitespace-nowrap text-muted-foreground">{s.last ? new Date(s.last).toLocaleString() : ""}</Td>{(isClaude || p.id === "opencode") && <Td>{s.title ?? s.project ?? ""}</Td>}<Td className="font-mono">{s.model}</Td><Td right>{tok(s.total.in + s.total.cacheWrite)}</Td><Td right>{tok(s.total.cacheRead)}</Td><Td right>{tok(s.total.out)}</Td><Td right>{s.total.replies}</Td>{p.id === "opencode" && <Td right>{money(s.cost)}</Td>}<Td className="font-mono text-muted-foreground">{s.id.slice(-8)}</Td></tr>
            ))}
          </DataTable></Card>
      )}
      <PipelineTable rows={pipe} />
      {isClaude && <PriceCard models={models} prices={prices} setPrices={setPrices} />}
    </>
  );
}

// ───────────────────────────── shared tables ─────────────────────────────

function PipelineTable({ rows, showProvider }: { rows: Pipe[]; showProvider?: boolean }) {
  const bySteps: Record<string, { n: number; ms: number; cost: number }> = {};
  for (const r of rows) { const x = (bySteps[stepKey(r.step)] ??= { n: 0, ms: 0, cost: 0 }); x.n++; x.ms += r.ms ?? 0; x.cost += r.costUsd ?? 0; }
  if (!rows.length) return null;
  return (
    <div className="grid items-start gap-3.5 2xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <Card><CardHeader><CardTitle>Pipeline by step</CardTitle></CardHeader>
        <DataTable head={[{ label: "Step" }, { label: "Runs", right: true }, { label: "Time", right: true }, { label: "Cost", right: true }]}>
          {Object.entries(bySteps).sort((a, b) => b[1].cost - a[1].cost || b[1].ms - a[1].ms).map(([k, x]) => <tr key={k}><Td>{k}</Td><Td right>{x.n}</Td><Td right className="whitespace-nowrap">{dur(x.ms)}</Td><Td right>{x.cost ? money(x.cost) : "free"}</Td></tr>)}
        </DataTable></Card>
      <Card><CardHeader><CardTitle>Pipeline steps</CardTitle><CardSub>{rows.length}</CardSub></CardHeader>
        <DataTable maxH="420px" head={[{ label: "When" }, { label: "Video" }, { label: "Step" }, ...(showProvider ? [{ label: "Provider" }] : []), { label: "Model" }, { label: "Time", right: true }, { label: "Cost", right: true }]}>
          {[...rows].sort((a, b) => String(b.at).localeCompare(String(a.at))).map((r, i) => (
            <tr key={i}><Td className="whitespace-nowrap text-muted-foreground">{r.at ? new Date(r.at).toLocaleString() : ""}</Td><Td className="whitespace-nowrap font-mono">{r.ws}</Td><Td className="min-w-48">{r.step}</Td>{showProvider && <Td className="whitespace-nowrap"><span className="mr-1.5 inline-block size-2 rounded-full align-middle" style={{ background: PROVIDER_META[provOf(r)].color }} />{PROVIDER_META[provOf(r)].short}</Td>}<Td className="font-mono">{r.model ?? ""}</Td><Td right className="whitespace-nowrap">{dur(r.ms)}</Td><Td right>{r.costUsd ? money(r.costUsd) : "free"}</Td></tr>
          ))}
        </DataTable></Card>
    </div>
  );
}

function PriceCard({ models, prices, setPrices }: { models: string[]; prices: Record<string, Price>; setPrices: (v: Record<string, Price>) => void }) {
  const { toast } = useApp();
  const [draft, setDraft] = useState<Record<string, Price>>(prices);
  useEffect(() => setDraft(prices), [prices]);
  return (
    <Card><CardHeader><CardTitle>Prices per million tokens</CardTitle><CardSub>optional, stored in this browser only</CardSub></CardHeader>
      <CardBody>
        <DataTable head={[{ label: "Model" }, { label: "Input" }, { label: "Cache write" }, { label: "Cache read" }, { label: "Output" }]}>
          {models.map((mo) => (
            <tr key={mo}><Td className="font-mono">{mo}</Td>{(["in", "cw", "cr", "out"] as const).map((k) => (
              <Td key={k}><Input type="number" inputMode="decimal" step="0.01" min="0" className="w-20" placeholder="$" aria-label={`${mo} ${k} price`} value={draft[mo]?.[k] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [mo]: { ...d[mo], [k]: e.target.value === "" ? undefined : Number(e.target.value) } }))} /></Td>
            ))}</tr>
          ))}
        </DataTable>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => { setPrices(Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined))]).filter(([, v]) => Object.keys(v as object).length) as [string, Price][])); toast("Prices saved in this browser"); }}>Save prices</Button>
          <span className="text-xs text-muted-foreground">Enter your plan's prices to see dollar estimates for Claude sessions. Pipeline costs are what each tool reported.</span>
        </div>
      </CardBody></Card>
  );
}
