import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useApp } from "@/hooks/app";
import { copyText } from "@/lib/utils";

const MAX_LINES = 5000;
const nl = (s: string) => { let n = 0; for (let i = s.indexOf("\n"); i >= 0; i = s.indexOf("\n", i + 1)) n++; return n; };

/**
 * Plain monospace terminal for one job, streamed over SSE straight into the DOM (no React render per chunk).
 * Only the last ~5,000 lines are kept; older ones are counted in a marker with a link to the full log.
 * Sticks to the bottom while you are at the end; scrolling up pauses it until "jump to end".
 * `log:<step>` shows the last saved block for a step (from before a server restart).
 * Copy puts the command and the output on the clipboard, ready to paste into a chat when something fails.
 */
export function JobLogView({ ws, tab, cmd }: { ws: string; tab: string; cmd?: string }) {
  const { refresh, toast } = useApp();
  const scroller = useRef<HTMLDivElement>(null);
  const pre = useRef<HTMLPreElement>(null);
  const stick = useRef(true);
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(0);

  useEffect(() => {
    const box = scroller.current, el = pre.current;
    if (!box || !el) return;
    el.textContent = ""; setHidden(0);
    stick.current = true; setPaused(false);
    const toEnd = () => { if (stick.current) box.scrollTop = box.scrollHeight; };
    let nodes: { n: Text; lines: number }[] = [], total = 0, dropped = 0;
    const clear = () => { el.textContent = ""; nodes = []; total = 0; dropped = 0; setHidden(0); };
    const add = (text: string) => {
      let s = text, lines = nl(s);
      if (lines > MAX_LINES) {   // a huge chunk (long log opened late): keep only its tail
        let cut = s.length;
        for (let i = 0; i <= MAX_LINES; i++) cut = s.lastIndexOf("\n", cut - 1);
        s = s.slice(cut + 1); dropped += lines - MAX_LINES; lines = MAX_LINES;
        el.textContent = ""; nodes = []; total = 0;
      }
      const n = document.createTextNode(s);
      el.appendChild(n); nodes.push({ n, lines }); total += lines;
      while (total > MAX_LINES && nodes.length > 1) { const f = nodes.shift()!; f.n.remove(); total -= f.lines; dropped += f.lines; }
      if (dropped) setHidden(dropped);
    };
    if (tab.startsWith("log:")) {
      let live = true;
      api.lastLog(ws, tab.slice(4)).then((t) => { if (live) { add(t || "No run yet for this step."); toEnd(); } }).catch(() => {});
      return () => { live = false; };
    }
    let buf = "", raf = 0;
    const flush = () => { raf = 0; if (buf) { add(buf); buf = ""; toEnd(); } };
    const es = new EventSource(api.logUrl(ws, tab));
    es.addEventListener("reset", () => { buf = ""; clear(); });
    es.addEventListener("chunk", (e) => { buf += JSON.parse((e as MessageEvent).data); if (!raf) raf = requestAnimationFrame(flush); });
    es.addEventListener("end", () => { es.close(); flush(); void refresh(); });
    es.onerror = () => es.close();
    return () => { es.close(); if (raf) cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws, tab]);

  const onScroll = () => {
    const el = scroller.current!;
    const atEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    stick.current = atEnd;
    setPaused((p) => (p === !atEnd ? p : !atEnd));
  };
  const copy = async () => {
    const out = (pre.current?.textContent ?? "").trimEnd();
    if (!out) { toast("Nothing to copy yet"); return; }
    const text = `${cmd ? `$ ${cmd}\n` : ""}${hidden ? `(${hidden.toLocaleString()} earlier lines not included)\n` : ""}${out}`;
    toast((await copyText(text)) ? "Log copied" : "Copy failed: select the text and copy it");
  };
  const full = tab.startsWith("log:") ? null : api.logPlainUrl(ws, tab);
  return (
    <div className="relative min-h-0 flex-1">
      <div ref={scroller} onScroll={onScroll} tabIndex={0} aria-label="Terminal output" className="h-full overflow-auto px-3 py-2 font-mono text-[11.5px] leading-normal text-foreground/85">
        {hidden > 0 && (
          <div className="mb-1 text-muted-foreground">… {hidden.toLocaleString()} earlier lines hidden{full && <> · <a className="text-brand underline" href={full} target="_blank" rel="noreferrer">open full log</a></>}</div>
        )}
        <pre ref={pre} className="m-0 whitespace-pre-wrap break-words font-[inherit]" />
      </div>
      <Button size="sm" variant="secondary" className="absolute right-4 top-2 opacity-80 shadow-sm hover:opacity-100" onClick={copy} title="Copy the command and its output"><Copy />Copy</Button>
      {paused && (
        <Button size="sm" className="absolute bottom-3 right-4 shadow-lg" onClick={() => { stick.current = true; setPaused(false); const el = scroller.current!; el.scrollTop = el.scrollHeight; }}>
          <ArrowDownToLine /> Paused · jump to end
        </Button>
      )}
    </div>
  );
}
