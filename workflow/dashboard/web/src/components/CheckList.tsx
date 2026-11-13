import { useState } from "react";
import { useApp } from "@/hooks/app";
import { api } from "@/lib/api";
import type { PubChecks } from "@/lib/types";

/** A step's check results. Each error has Accept: the creator overrides a check that is wrong in this case; it then
 *  no longer blocks approval (stored in the workspace's accepted.json, workflow/lib/accepted.ts). Undo brings it back. */
export function CheckList({ c, scope, short, empty }: { c: PubChecks | null | undefined; scope: string; short?: string; empty?: React.ReactNode }) {
  const { ws, refresh, toast } = useApp();
  const [busy, setBusy] = useState(false);
  if (!c || (!c.errors.length && !c.warnings.length && !c.accepted?.length)) return <>{empty ?? null}</>;
  const set = async (text: string, undo: boolean) => {
    if (!ws) return;
    setBusy(true);
    try { await api.acceptCheck(ws, { scope, text, short, undo }); await refresh(); } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };
  const btn = "ml-1.5 rounded border px-1.5 py-px text-[11px] text-foreground hover:bg-muted disabled:opacity-50";
  return (
    <ul className="m-0 grid list-none gap-0.5 p-0 text-[12px]">
      {c.errors.map((e, i) => <li key={`e${i}`} className="text-destructive">✗ {e}<button type="button" className={btn} disabled={busy} title="This check is wrong here: stop it blocking approval" onClick={() => set(e, false)}>Accept</button></li>)}
      {c.warnings.map((w, i) => <li key={`w${i}`} className="text-warning">⚠ {w}</li>)}
      {c.accepted?.map((e, i) => <li key={`a${i}`} className="text-muted-foreground">✓ accepted by you: {e}<button type="button" className={btn} disabled={busy} onClick={() => set(e, true)}>Undo</button></li>)}
    </ul>
  );
}
