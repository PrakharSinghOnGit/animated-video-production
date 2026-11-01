import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/** Live log of one analytics job (SSE: reset / chunk / end). Calls onEnd once when the job finishes. */
export function JobLog({ job, label, onEnd, onClose }: { job: string; label: string; onEnd: () => void; onClose: () => void }) {
  const pre = useRef<HTMLPreElement>(null);
  const [status, setStatus] = useState("running");
  const ended = useRef(onEnd);
  ended.current = onEnd;
  useEffect(() => {
    const el = pre.current!;
    el.textContent = "";
    setStatus("running");
    const es = new EventSource(api.analyticsLogUrl(job));
    const add = (s: string) => { el.textContent = (el.textContent + s).slice(-60000); el.scrollTop = el.scrollHeight; };
    es.addEventListener("reset", (e) => { el.textContent = ""; const j = JSON.parse((e as MessageEvent).data); if (j.status !== "running") setStatus(j.status); });
    es.addEventListener("chunk", (e) => add(JSON.parse((e as MessageEvent).data)));
    es.addEventListener("end", (e) => { const j = JSON.parse((e as MessageEvent).data); setStatus(j.status); es.close(); ended.current(); });
    es.onerror = () => es.close();
    return () => es.close();
  }, [job]);
  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center gap-2 border-b px-3 py-1.5 text-[13px]">
        <b className="font-semibold">{label}</b>
        <Badge tone={status === "done" ? "success" : status === "running" ? "info" : "danger"}>{status}</Badge>
        <Button variant="ghost" size="icon" className="ml-auto size-7" onClick={onClose} aria-label="Close log"><X /></Button>
      </div>
      <pre ref={pre} className="m-0 max-h-56 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[11.5px] leading-relaxed text-muted-foreground" />
    </div>
  );
}
