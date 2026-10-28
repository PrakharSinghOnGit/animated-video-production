import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Background, BackgroundVariant, Controls, Handle, MiniMap, Panel, Position, ReactFlow, useReactFlow, ReactFlowProvider, type Node, type NodeProps } from "@xyflow/react";
import { ExternalLink, X } from "lucide-react";
import "@xyflow/react/dist/style.css";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RunButton } from "@/components/RunButton";
import { StatusDot } from "@/components/Status";
import { useApp } from "@/hooks/app";
import { useRunSaved } from "@/hooks/useRunSaved";
import { buildGraph, STATE_LABEL, stateColor, W, H, type CardData, type FrameData, type GNode, type RowData } from "@/lib/graph";
import { useMedia } from "@/lib/storage";
import { ago, cn, dur, money } from "@/lib/utils";

const STATUS_TXT = { done: "Done", running: "Running", failed: "Failed", todo: "To do" } as const;

/** Paid / Free badge of an action (nothing for blocks without one). */
function Cost({ action }: { action?: string }) {
  const { schema } = useApp();
  const a = action ? schema[action] : undefined;
  if (!a) return null;
  return a.paid ? <Badge tone="warning" className="px-1.5 py-0 text-[10px]">Paid</Badge> : <Badge tone="success" className="px-1.5 py-0 text-[10px]">Free</Badge>;
}

const lastText = (c: CardData) => (c.last ? `${ago(c.last.end)} · ${dur(c.last.ms)}${c.cost > 0 ? ` · ${money(c.cost)}` : ""}` : "never run here");

/** Sockets: in/out left-right (cross-column and act rows), bin/bout top-bottom (inside a column), loop sockets on the free side. */
const Card = memo(function Card({ data, selected }: NodeProps<Node<CardData, "card">>) {
  const loopPos = data.dir === "h" ? Position.Bottom : Position.Right;
  const loopStyle = (k: number, n: number) => (data.dir === "h" ? { left: `${50 + (k - (n - 1) / 2) * 24}%` } : { top: `${50 + (k - (n - 1) / 2) * 24}%` });
  const sock = "!size-2 !border-0 !opacity-0";
  return (
    <div data-status={data.status} style={{ width: W, height: H }}
      className={cn("flex flex-col justify-center gap-0.5 rounded-lg border bg-card px-2.5 py-1.5 shadow-sm", data.status === "failed" && "border-destructive/50", data.status === "running" && "border-warning ring-2 ring-warning/40", selected && "border-brand ring-2 ring-brand/50")}>
      <Handle id="in" type="target" position={Position.Left} className={sock} />
      <Handle id="out" type="source" position={Position.Right} className={sock} />
      <Handle id="bin" type="target" position={Position.Top} className={sock} />
      <Handle id="bout" type="source" position={Position.Bottom} className={sock} />
      {Array.from({ length: data.ls }, (_, k) => <Handle key={`s${k}`} id={`ls${k}`} type="source" position={loopPos} style={loopStyle(k, data.ls)} className="!size-1.5 !border-0 !opacity-0" />)}
      {Array.from({ length: data.lt }, (_, k) => <Handle key={`t${k}`} id={`lt${k}`} type="target" position={loopPos} style={loopStyle(k, data.lt)} className="!size-1.5 !border-0 !opacity-0" />)}
      <div className="flex items-center justify-between gap-1.5">
        <span className="truncate text-[12.5px] font-semibold tracking-tight" title={data.title}>{data.title}</span>
        <Cost action={data.action} />
      </div>
      <div className="flex items-center gap-1.5 text-[11px]">
        <StatusDot s={data.status === "todo" ? "none" : data.status} />
        <span className={cn(data.status === "done" && "text-success", data.status === "running" && "text-warning", data.status === "failed" && "text-destructive", data.status === "todo" && "text-muted-foreground")}>{STATUS_TXT[data.status]}</span>
      </div>
      {data.extra && <div className="truncate text-[10.5px] text-foreground/80">{data.extra}</div>}
      {data.action && <div className="truncate text-[10.5px] text-muted-foreground">{lastText(data)}</div>}
    </div>
  );
});

/** Step frame: header with the step name and its state, drawn behind the cards. */
const Frame = memo(function Frame({ data }: NodeProps<Node<FrameData, "frame">>) {
  const color = stateColor(data.state);
  return (
    <div className="pointer-events-none rounded-xl border bg-muted/40" style={{ width: data.w, height: data.h, borderColor: `color-mix(in srgb, ${color} 45%, var(--border))` }}>
      <div className="flex items-baseline gap-2 px-4 pt-3">
        <span className="size-2 shrink-0 self-center rounded-full" style={{ background: color }} />
        <b className="text-[14px] font-semibold tracking-tight">{data.label}</b>
        <span className="text-[11.5px]" style={{ color }}>{STATE_LABEL[data.state]}</span>
        <span className="truncate text-[11px] text-muted-foreground">{data.hint}</span>
      </div>
    </div>
  );
});

const Row = memo(function Row({ data }: NodeProps<Node<RowData, "row">>) {
  return <div className="pointer-events-none whitespace-nowrap text-[11.5px] text-muted-foreground"><span className="font-mono text-foreground">{data.id}</span> · {data.title}</div>;
});

const nodeTypes = { card: Card, frame: Frame, row: Row };

/** Selected card: what it is, its state, the Run button, and a jump back to the list view. */
function Inspector({ n, onClose }: { n: Node<CardData, "card">; onClose: () => void }) {
  const { schema, busy, go, setMode } = useApp();
  const runSaved = useRunSaved();
  const c = n.data, a = c.action ? schema[c.action] : undefined;
  return (
    <div className="w-[min(320px,calc(100vw-24px))] rounded-lg border bg-card p-3 text-xs shadow-lg">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold tracking-tight">{c.act && <span className="mr-1 font-mono">{c.act}</span>}{c.title}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge tone={c.status === "done" ? "success" : c.status === "running" ? "warning" : c.status === "failed" ? "danger" : "neutral"}><StatusDot s={c.status === "todo" ? "none" : c.status} />{STATUS_TXT[c.status]}</Badge>
            {a && (a.paid ? <Badge tone="warning">Paid · {a.paid}</Badge> : <Badge tone="success">Free</Badge>)}
          </div>
        </div>
        <Button variant="ghost" size="icon" className="-mr-1.5 -mt-1.5 size-7" onClick={onClose} aria-label="Close"><X /></Button>
      </div>
      {(c.desc || a?.help) && <p className="m-0 mt-2 text-muted-foreground">{c.desc ?? a?.help}</p>}
      {c.extra && <p className="m-0 mt-2">{c.extra}</p>}
      <div className="mt-2 flex items-center gap-3 text-[11.5px] text-muted-foreground">
        <span>{c.last ? `last run ${ago(c.last.end)} · ${dur(c.last.ms)}` : c.action ? "never run here" : "no run of its own"}</span>
        {c.cost > 0 && <span className="text-foreground/80">{money(c.cost)}</span>}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {c.action && <RunButton primary={!a?.paid} running={c.status === "running"} disabled={!!busy} onClick={() => runSaved(c.action!, c.act)} />}
        <Button variant="secondary" onClick={() => { setMode("list"); go({ step: c.step, act: c.act ?? null }); }}><ExternalLink />Open in list</Button>
      </div>
    </div>
  );
}

/** Follows the page theme (the toggle lives in TopBar, so watch the class instead of keeping a copy of the state). */
function useDark() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const mo = new MutationObserver(() => setDark(document.documentElement.classList.contains("dark")));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);
  return dark;
}

/** Fit everything, but never smaller than text can be read: on narrow screens the view starts at the Script frame and you pan. */
const fit = { padding: 0.06, minZoom: 0.45 };

function Canvas() {
  const { d, ws, busy } = useApp();
  const [sel, setSel] = useState<string | null>(null);
  const dark = useDark(), phone = useMedia("(max-width: 639px)");
  const graph = useMemo(() => (d ? buildGraph(d, busy) : { nodes: [] as GNode[], edges: [] }), [d, busy]);
  const nodes = useMemo(() => graph.nodes.map((n) => (n.id === sel ? { ...n, selected: true } : n)), [graph, sel]);
  const picked = graph.nodes.find((n) => n.id === sel && n.type === "card") as Node<CardData, "card"> | undefined;
  const rf = useReactFlow();
  const fitRef = useRef(rf.fitView);
  fitRef.current = rf.fitView;
  // refit when the video changes (live updates keep the viewport: nodes just change in place)
  useEffect(() => {
    setSel(null);
    const t = setTimeout(() => { void fitRef.current(fit).then(() => { const z = rf.getZoom(); if (z <= fit.minZoom + 0.01) void rf.setViewport({ x: 24, y: 24, zoom: z }); }); }, 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws]);
  return (
    <ReactFlow nodes={nodes} edges={graph.edges} nodeTypes={nodeTypes} colorMode={dark ? "dark" : "light"} className="wg-flow"
      fitView fitViewOptions={fit} minZoom={0.1} maxZoom={1.5}
      nodesDraggable={false} nodesConnectable={false} edgesFocusable={false} proOptions={{ hideAttribution: true }}
      onNodeClick={(_, n) => { if (n.type === "card") setSel(n.id); }} onPaneClick={() => setSel(null)}>
      <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} />
      <Controls showInteractive={false} />
      {!phone && <MiniMap pannable zoomable nodeColor={(n) => (n.type === "frame" ? "var(--muted)" : n.type === "card" ? "var(--input)" : "transparent")} nodeStrokeWidth={0} />}
      {picked && <Panel position="bottom-right"><Inspector n={picked} onClose={() => setSel(null)} /></Panel>}
    </ReactFlow>
  );
}

/** Blender-style node view of the open video: every step, sub-step, act row and loop-back at once. Live: derived from the polled details. */
export default function NodeView() {
  const { ws } = useApp();
  return <div className="min-h-0 flex-1"><ReactFlowProvider key={ws}><Canvas /></ReactFlowProvider></div>;
}
