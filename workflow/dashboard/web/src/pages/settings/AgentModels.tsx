import { useEffect, useMemo, useState } from "react";
import { RefreshCw, RotateCcw } from "lucide-react";
import { api } from "@/lib/api";
import { useApp } from "@/hooks/app";
import { cn } from "@/lib/utils";
import type { ModelsData, ProviderKey, RoleRow } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardSub, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/fields";
import { InfoTip } from "@/components/ui/tooltip";

const ORDER: ProviderKey[] = ["claude", "claude-iit", "codex", "opencode", "ollama", "agy"];
const BILLING = { subscription: "Subscription", free: "Free", local: "Local" } as const;

/** "opus" -> claude/opus; "agy" -> agy/<first model>; "codex:gpt-6-luna" -> codex/gpt-6-luna. */
function split(spec: string): [ProviderKey, string] {
  if (/^(opus|sonnet|haiku)$/.test(spec)) return ["claude", spec];
  if (spec === "agy") return ["agy", "gemini-3.8-flash-medium"];
  const i = spec.indexOf(":");
  return [spec.slice(0, i) as ProviderKey, spec.slice(i + 1)];
}

/**
 * Which model runs each agent step (workflow/models.json). A run's own model option still overrides for that run;
 * "default" in a run's options means this table.
 */
export function AgentModels() {
  const { toast } = useApp();
  const [d, setD] = useState<ModelsData | null>(null);
  const [busy, setBusy] = useState(false);
  const load = (refresh = false) => { setBusy(true); api.models(refresh).then(setD).catch((e) => toast(e.message)).finally(() => setBusy(false)); };
  useEffect(() => load(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = async (r: RoleRow, spec: string | null) => {
    try { await api.modelSet(r.key, spec); toast(spec ? `${r.label}: ${spec}` : `${r.label}: back to ${r.builtin}`); load(); } catch (e) { toast((e as Error).message); }
  };
  const groups = useMemo(() => {
    const m = new Map<string, RoleRow[]>();
    for (const r of d?.roles ?? []) m.set(r.group, [...(m.get(r.group) ?? []), r]);
    return [...m.entries()];
  }, [d]);

  return (
    <Card>
      <CardHeader className="flex-wrap">
        <CardTitle>Agent models</CardTitle>
        <CardSub className="max-sm:hidden">which model runs each step · workflow/models.json</CardSub>
        <InfoTip label="About agent models">
          A run's own model option overrides this for one run ("default" there means this table). Claude runs keep their per-tool allow list; Codex and OpenCode run with a workspace-write sandbox instead. Ollama models run through OpenCode, so they can read and write files only if the model supports tool calling. agy is read-only, so it is offered only for review steps.
        </InfoTip>
        <span className="flex-1" />
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => load(true)}><RefreshCw className={cn(busy && "animate-spin")} />Rescan models</Button>
      </CardHeader>
      <CardBody className="gap-0 p-0">
        {d && (
          <div className="flex flex-wrap gap-1.5 border-b px-4 py-3">
            {ORDER.map((k) => {
              const p = d.providers[k];
              return (
                <span key={k} title={p.ok ? p.note : p.error} className={cn("inline-flex h-7 items-center gap-1.5 rounded-md border bg-raised px-2 text-[12px]", !p.ok && "opacity-55")}>
                  <span className={cn("size-1.5 rounded-full", !p.ok ? "bg-subtle-foreground" : p.models.every((m) => m.tools === false) ? "bg-warning" : "bg-success")} />
                  <b className="font-medium">{p.label}</b>
                  <span className="text-muted-foreground">{p.ok ? `${p.models.length} model${p.models.length === 1 ? "" : "s"}${p.models.every((m) => m.tools === false) ? ", none with tool calling" : ""}` : p.error}</span>
                  <span className="text-subtle-foreground">· {BILLING[p.billing]}</span>
                </span>
              );
            })}
          </div>
        )}
        {!d && <div className="px-4 py-6 text-[13px] text-muted-foreground">Looking for models…</div>}
        {d && groups.map(([g, rows]) => (
          <div key={g}>
            <div className="border-b bg-background/40 px-4 py-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-subtle-foreground">{g}</div>
            {rows.map((r) => <Row key={r.key} r={r} d={d} onSet={set} />)}
          </div>
        ))}
      </CardBody>
    </Card>
  );
}

function Row({ r, d, onSet }: { r: RoleRow; d: ModelsData; onSet: (r: RoleRow, spec: string | null) => void }) {
  const [prov, model] = split(r.current);
  const usable = ORDER.filter((k) => d.providers[k].ok && (!r.edits || d.providers[k].edits) && d.providers[k].models.some((m) => m.tools !== false));
  const models = d.providers[prov]?.models ?? [];
  const known = models.some((m) => m.id === model);
  const spec = (p: ProviderKey, m: string) => `${p}:${m}`;
  return (
    <div className="grid items-center gap-x-3 gap-y-1.5 border-b px-4 py-2.5 last:border-0 md:grid-cols-[minmax(180px,1fr)_160px_minmax(220px,1.4fr)_88px]">
      <div className="min-w-0">
        <div className="text-[13px] font-medium">{r.label}</div>
        <div className="text-[11.5px] text-muted-foreground">{r.edits ? "reads and writes files" : "reads, answers in text"}{r.custom ? "" : " · built-in default"}</div>
      </div>
      <NativeSelect aria-label={`${r.label} provider`} value={prov} onChange={(e) => { const p = e.target.value as ProviderKey; const first = d.providers[p].models.find((m) => m.tools !== false); if (first) onSet(r, spec(p, first.id)); }}>
        {!usable.includes(prov) && <option value={prov}>{d.providers[prov]?.label ?? prov} (unavailable)</option>}
        {usable.map((k) => <option key={k} value={k}>{d.providers[k].label}</option>)}
      </NativeSelect>
      <NativeSelect aria-label={`${r.label} model`} className="font-mono text-[12px]" value={model} onChange={(e) => onSet(r, spec(prov, e.target.value))}>
        {!known && <option value={model}>{model} (not found)</option>}
        {models.map((m) => <option key={m.id} value={m.id} disabled={m.tools === false}>{m.label}{m.tools === false ? " · no tool calling" : m.free ? " · free" : ""}</option>)}
      </NativeSelect>
      <div className="flex items-center justify-end gap-1.5">
        {d.providers[prov]?.billing !== "subscription" && <Badge tone="success">{BILLING[d.providers[prov]?.billing ?? "free"]}</Badge>}
        {r.custom && <Button size="icon" variant="ghost" className="size-7" aria-label={`Reset ${r.label} to ${r.builtin}`} title={`Reset to ${r.builtin}`} onClick={() => onSet(r, null)}><RotateCcw /></Button>}
      </div>
    </div>
  );
}
