import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardSub, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/fields";
import { api } from "@/lib/api";
import { useApp } from "@/hooks/app";

type Cfg = Awaited<ReturnType<typeof api.notify>>;

/** Job-end notifications: MAC_NOTIFY / PHONE_NOTIFY in .env ("0" = off, unset = on). The server re-reads them at every job end. */
export function NotificationsForm() {
  const { toast } = useApp();
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const load = () => api.notify().then(setCfg).catch((e) => toast(e.message));
  useEffect(() => { void load(); window.addEventListener("wg:env", load); return () => window.removeEventListener("wg:env", load); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = async (key: "MAC_NOTIFY" | "PHONE_NOTIFY", on: boolean) => {
    try { await (on ? api.envSave({}, [key]) : api.envSave({ [key]: "0" })); await load(); } catch (e) { toast((e as Error).message); }
  };
  const test = async (only: "mac" | "phone") => {
    try { const r = await api.notifyTest(only); toast(r.sent[only] ? "Test sent" : "That channel is off"); } catch (e) { toast((e as Error).message); }
  };
  const rows: { key: "MAC_NOTIFY" | "PHONE_NOTIFY"; ch: "mac" | "phone"; label: string; sub: string; on: boolean; disabled: boolean }[] = cfg ? [
    { key: "MAC_NOTIFY", ch: "mac", label: "Mac notifications", sub: cfg.macAvailable ? "a banner + sound on this Mac when a job finishes or fails" : "only when the dashboard runs on macOS", on: cfg.mac, disabled: !cfg.macAvailable },
    { key: "PHONE_NOTIFY", ch: "phone", label: "Phone notifications", sub: cfg.topicSet ? "through the ntfy app (topic NTFY_TOPIC)" : "set NTFY_TOPIC under Environment first (the ntfy app subscribes to that topic)", on: cfg.phone, disabled: !cfg.topicSet },
  ] : [];
  return (
    <Card>
      <CardHeader><CardTitle>Notifications</CardTitle><CardSub>when a job finishes or fails · takes effect immediately</CardSub></CardHeader>
      <CardBody className="gap-0 p-0">
        {!cfg && <div className="px-3.5 py-2 text-xs text-muted-foreground">loading…</div>}
        {rows.map((r) => (
          <div key={r.key} className="flex items-center gap-3 border-b px-3.5 py-2.5 last:border-0">
            <Checkbox id={r.key} checked={r.on} disabled={r.disabled} onCheckedChange={(v) => toggle(r.key, v === true)} />
            <label htmlFor={r.key} className="grid flex-1 cursor-pointer gap-0.5">
              <span className="text-[13px]">{r.label}</span>
              <span className="text-[11px] text-muted-foreground">{r.sub}</span>
            </label>
            <Button size="sm" variant="outline" disabled={!r.on} onClick={() => test(r.ch)}>Send test</Button>
          </div>
        ))}
      </CardBody>
    </Card>
  );
}
