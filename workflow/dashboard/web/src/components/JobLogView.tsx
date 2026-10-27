import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useApp } from "@/hooks/app";

/**
 * Monospace log of one job, streamed over SSE straight into a <pre> (no React re-render per chunk).
 * Sticks to the bottom while you are at the end; scrolling up pauses it until you press "Jump to end".
 * `log:<step>` shows the last saved block for a step (from before a server restart).
 */
export function JobLogView({ ws, tab }: { ws: string; tab: string }) {
  const { refresh } = useApp();
  const pre = useRef<HTMLPreElement>(null);
  const stick = useRef(true);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const el = pre.current;
    if (!el) return;
    el.textContent = "";
    stick.current = true; setPaused(false);
    const toEnd = () => { if (stick.current) el.scrollTop = el.scrollHeight; };
    if (tab.startsWith("log:")) {
      let live = true;
      api.lastLog(ws, tab.slice(4)).then((t) => { if (live) { el.textContent = t || "No run yet for this step."; toEnd(); } }).catch(() => {});
      return () => { live = false; };
    }
    let buf = "", raf = 0;
    const flush = () => { raf = 0; if (buf) { el.appendChild(document.createTextNode(buf)); buf = ""; toEnd(); } };
    const es = new EventSource(api.logUrl(ws, tab));
    es.addEventListener("reset", () => { buf = ""; el.textContent = ""; });
    es.addEventListener("chunk", (e) => { buf += JSON.parse((e as MessageEvent).data); if (!raf) raf = requestAnimationFrame(flush); });
    es.addEventListener("end", () => { es.close(); flush(); void refresh(); });
    es.onerror = () => es.close();
    return () => { es.close(); if (raf) cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws, tab]);

  const onScroll = () => {
    const el = pre.current!;
    const atEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    stick.current = atEnd;
    setPaused((p) => (p === !atEnd ? p : !atEnd));
  };
  return (
    <div className="relative min-h-0 flex-1">
      <pre ref={pre} onScroll={onScroll} tabIndex={0} aria-label="Job log" className="m-0 h-full overflow-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-[11.5px] leading-normal text-foreground/85" />
      {paused && (
        <Button size="sm" className="absolute bottom-3 right-4 shadow-lg" onClick={() => { stick.current = true; setPaused(false); const el = pre.current!; el.scrollTop = el.scrollHeight; }}>
          <ArrowDownToLine /> Paused · jump to end
        </Button>
      )}
    </div>
  );
}
