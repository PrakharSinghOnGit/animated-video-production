import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardSub, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/fields";
import { api } from "@/lib/api";
import { useApp } from "@/hooks/app";
import type { EnvView } from "@/lib/types";

/** The .env file key by key. Secret values stay masked (and are not even sent) until you press reveal. */
export function EnvEditor() {
  const { toast } = useApp();
  const [env, setEnv] = useState<EnvView | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const [nk, setNk] = useState(""), [nv, setNv] = useState("");
  const load = useCallback(() => api.env().then((e) => { setEnv(e); setEdits({}); setShown({}); }).catch((e) => toast(e.message)), [toast]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const f = () => { void load(); }; window.addEventListener("wg:env", f); return () => window.removeEventListener("wg:env", f); }, [load]);
  if (!env) return <div className="text-muted-foreground">Loading…</div>;

  const reveal = async (key: string) => {
    if (shown[key]) { setShown((s) => ({ ...s, [key]: false })); return; }
    try { const r = await api.envReveal(key); setEdits((e) => (key in e ? e : { ...e, [key]: r.value })); setShown((s) => ({ ...s, [key]: true })); } catch (e) { toast((e as Error).message); }
  };
  const save = async (set: Record<string, string>, remove: string[] = []) => {
    try { setEnv(await api.envSave(set, remove)); setEdits({}); setShown({}); toast("Saved to .env"); } catch (e) { toast((e as Error).message); }
  };
  const dirty = Object.keys(edits).filter((k) => edits[k] !== "" || !env.entries.find((e) => e.key === k)?.secret || shown[k]);
  const add = () => { const k = nk.trim(); if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) { toast("Key: letters, digits, underscore; not starting with a digit"); return; } void save({ [k]: nv }).then(() => { setNk(""); setNv(""); }); };

  return (
    <Card>
      <CardHeader><CardTitle>Environment (.env)</CardTitle><CardSub>comments and order are kept · saved atomically</CardSub><span className="flex-1" />
        {dirty.length > 0 && <span className="text-xs text-warning">{dirty.length} unsaved</span>}
        <Button size="sm" variant="default" disabled={!dirty.length} onClick={() => save(Object.fromEntries(dirty.map((k) => [k, edits[k]])))}>Save changes</Button></CardHeader>
      <CardBody className="gap-0 p-0">
        {!env.exists && <div className="border-b px-3.5 py-2 text-xs text-warning">No .env yet. Adding a key creates it.</div>}
        {env.entries.map((e) => {
          const val = e.key in edits ? edits[e.key] : e.secret ? "" : e.value ?? "";
          return (
            <div key={e.key} className="grid gap-x-3 gap-y-1 border-b px-3.5 py-2 md:grid-cols-[minmax(200px,260px)_1fr_auto] md:items-center">
              <div className="min-w-0"><div className="truncate font-mono text-xs" title={e.help}>{e.key}</div>{e.help && <div className="line-clamp-1 text-[11px] text-muted-foreground">{e.help.split("\n").find((l) => l.trim() && !/^-+$/.test(l.trim()))}</div>}</div>
              <div className="flex gap-1.5">
                <Input type={e.secret && !shown[e.key] ? "password" : "text"} value={val} autoComplete="off" spellCheck={false}
                  placeholder={e.secret ? (e.set ? "set · hidden (type to replace)" : "not set") : "empty"} onChange={(ev) => setEdits((s) => ({ ...s, [e.key]: ev.target.value }))} className="font-mono" aria-label={e.key} />
                {e.secret && <Button variant="outline" size="icon" onClick={() => reveal(e.key)} aria-label={shown[e.key] ? `Hide ${e.key}` : `Reveal ${e.key}`}>{shown[e.key] ? <EyeOff /> : <Eye />}</Button>}
              </div>
              <Button variant="ghost" size="icon" aria-label={`Remove ${e.key}`} onClick={() => { if (window.confirm(`Remove ${e.key} from .env?`)) void save({}, [e.key]); }}><Trash2 /></Button>
            </div>
          );
        })}
        <div className="grid gap-2 px-3.5 py-3 md:grid-cols-[minmax(200px,260px)_1fr_auto]">
          <Input value={nk} onChange={(e) => setNk(e.target.value.toUpperCase())} placeholder="NEW_KEY" className="font-mono" aria-label="New key" spellCheck={false} />
          <Input value={nv} onChange={(e) => setNv(e.target.value)} placeholder="value" className="font-mono" aria-label="New value" autoComplete="off" spellCheck={false} onKeyDown={(e) => e.key === "Enter" && add()} />
          <Button onClick={add}><Plus />Add key</Button>
          {env.suggested.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 md:col-span-3"><span className="text-xs text-muted-foreground">Documented in .env.example:</span>
              {env.suggested.map((k) => <button key={k} onClick={() => setNk(k)} className="rounded border px-1.5 py-0.5 font-mono text-[11px] hover:bg-accent">{k}</button>)}</div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
