import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardSub, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useApp } from "@/hooks/app";

/** Internet access (bun run dashboard:public): the public link, and sign out when this page came in through it. */
export function RemoteAccess() {
  const { toast } = useApp();
  const [s, setS] = useState<{ remote: boolean; publicUrl: string | null } | null>(null);
  useEffect(() => { api.session().then(setS).catch(() => setS({ remote: false, publicUrl: null })); }, []);
  const out = async () => { try { await api.logout(); location.assign("/login"); } catch (e) { toast((e as Error).message); } };
  if (!s) return null;
  return (
    <Card>
      <CardHeader><CardTitle>Internet access</CardTitle><CardSub className="max-sm:hidden">password: PWA_PASS in .env · changing it signs every device out</CardSub></CardHeader>
      <CardBody className="gap-0 p-0">
        <div className="flex flex-wrap items-center gap-3 px-3.5 py-2.5">
          <div className="grid min-w-0 flex-1 gap-0.5">
            {s.publicUrl
              ? <a href={s.publicUrl} className="truncate font-mono text-[12.5px] underline-offset-2 hover:underline">{s.publicUrl}</a>
              : <span className="text-[13px]">Off</span>}
            <span className="text-[11px] text-muted-foreground">{s.publicUrl ? (s.remote ? "you're signed in on this device" : "open it on your phone, or scan the QR code printed when the dashboard starts") : "start the dashboard with bun run dashboard:public to open it on the internet"}</span>
          </div>
          {s.remote && <Button size="sm" variant="outline" onClick={out}>Sign out</Button>}
        </div>
      </CardBody>
    </Card>
  );
}
