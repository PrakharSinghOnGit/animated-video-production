import { useState } from "react";
import { Link2 } from "lucide-react";
import { api } from "@/lib/api";
import { useApp } from "@/hooks/app";
import type { AnalyticsData } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/fields";

/** Link a workspace to its YouTube upload (id or any YouTube URL). `fixedYt` pre-fills the video (per-video page). */
export function LinkControl({ data, fixedYt, onDone }: { data: AnalyticsData; fixedYt?: string; onDone: () => void }) {
  const { toast } = useApp();
  const free = data.workspaces.filter((w) => !w.ytId);
  const [ws, setWs] = useState(free[free.length - 1]?.id ?? "");
  const [id, setId] = useState(fixedYt ?? "");
  const link = async () => {
    try { const r = await api.analyticsLink(ws, id); toast(`${ws} linked to ${r.id}`); setId(fixedYt ?? ""); onDone(); }
    catch (e) { toast((e as Error).message); }
  };
  if (!free.length) return <p className="m-0 text-muted-foreground">Every workspace is linked.</p>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <NativeSelect aria-label="Workspace" value={ws} onChange={(e) => setWs(e.target.value)} className="w-auto min-w-48">
        {free.map((w) => <option key={w.id} value={w.id}>{w.id}</option>)}
      </NativeSelect>
      {!fixedYt && <Input aria-label="YouTube video id or URL" placeholder="YouTube URL or video id" value={id} onChange={(e) => setId(e.target.value)} className="min-w-56 flex-1" />}
      <Button size="sm" variant="default" disabled={!ws || !id.trim()} onClick={link}><Link2 />Link</Button>
    </div>
  );
}
