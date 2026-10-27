import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardSub, CardTitle } from "@/components/ui/card";
import { Input, NativeSelect } from "@/components/ui/fields";
import { api } from "@/lib/api";
import { useApp } from "@/hooks/app";

/** Defaults the pipeline scripts read from the environment (found with grep process.env in workflow/). Run options on a step still override them. */
const FIELDS: { key: string; label: string; used: string; def: string; choices?: string[] }[] = [
  { key: "WRITER_MODEL", label: "Script writer model", used: "write_script.ts", def: "opus", choices: ["opus", "sonnet"] },
  { key: "DIRECTOR_MODEL", label: "Director (plan) model", used: "direct.ts", def: "opus", choices: ["opus", "sonnet"] },
  { key: "ACT_MODEL", label: "Act author model", used: "author_act.ts", def: "opus", choices: ["opus", "sonnet"] },
  { key: "CRITIC_MODEL", label: "Act critic / review agent", used: "author_act.ts", def: "agy", choices: ["agy", "haiku", "sonnet", "opus"] },
  { key: "AGY_MODEL", label: "Gemini (agy) model id", used: "agent.ts", def: "gemini-3.8-flash-medium" },
  { key: "STORYBOARD_MODEL", label: "Storyboard model", used: "storyboard.ts", def: "opus" },
  { key: "AUTHOR_MODEL", label: "Legacy scene author model", used: "author.ts", def: "sonnet" },
  { key: "WHISPER_MODEL", label: "Transcription model", used: "transcribe.ts", def: "small.en" },
  { key: "WG_STYLE", label: "Default house style", used: "direct.ts", def: "briefing" },
  { key: "WG_GRAIN", label: "Final render grain", used: "render.ts", def: "3" },
];

export function ModelsForm() {
  const { toast } = useApp();
  const [cur, setCur] = useState<Record<string, string>>({}), [vals, setVals] = useState<Record<string, string>>({});
  const load = () => api.env().then((e) => { const m = Object.fromEntries(e.entries.filter((x) => !x.secret).map((x) => [x.key, x.value ?? ""])); setCur(m); setVals(m); }).catch((er) => toast(er.message));
  useEffect(() => { void load(); window.addEventListener("wg:env", load); return () => window.removeEventListener("wg:env", load); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const changed = FIELDS.filter((f) => (vals[f.key] ?? "") !== (cur[f.key] ?? ""));
  const save = async () => {
    const set: Record<string, string> = {}, remove: string[] = [];
    for (const f of changed) { const v = (vals[f.key] ?? "").trim(); if (v) set[f.key] = v; else remove.push(f.key); }
    try { await api.envSave(set, remove); toast("Saved to .env"); await load(); } catch (e) { toast((e as Error).message); }
  };
  return (
    <Card>
      <CardHeader><CardTitle>Models and defaults</CardTitle><CardSub>stored in .env · empty = the pipeline's own default</CardSub><span className="flex-1" />
        <Button size="sm" variant="default" disabled={!changed.length} onClick={save}>Save</Button></CardHeader>
      <CardBody className="gap-0 p-0">
        {FIELDS.map((f) => (
          <div key={f.key} className="grid gap-x-3 gap-y-1 border-b px-3.5 py-2 last:border-0 md:grid-cols-[minmax(220px,300px)_1fr] md:items-center">
            <div><div className="text-[13px]">{f.label}</div><div className="font-mono text-[11px] text-muted-foreground">{f.key} · {f.used} · default {f.def}</div></div>
            {f.choices
              ? <NativeSelect className="md:w-60" value={vals[f.key] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))}><option value="">(default: {f.def})</option>{f.choices.map((c) => <option key={c}>{c}</option>)}</NativeSelect>
              : <Input className="font-mono md:w-60" value={vals[f.key] ?? ""} placeholder={f.def} onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))} />}
          </div>
        ))}
      </CardBody>
    </Card>
  );
}
