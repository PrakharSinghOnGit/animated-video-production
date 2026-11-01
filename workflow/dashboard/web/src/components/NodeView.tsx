import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { applyNodeChanges, Background, BackgroundVariant, Controls, Handle, MiniMap, Panel, Position, ReactFlow, useReactFlow, ReactFlowProvider, type Node, type NodeChange, type NodeProps } from "@xyflow/react";
import { Check, ChevronsDownUp, ChevronsUpDown, ExternalLink, GripVertical, Loader2, Maximize2, Minimize2, RotateCcw, X } from "lucide-react";
import { Tip } from "@/components/ui/tooltip";
import "@xyflow/react/dist/style.css";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RunButton } from "@/components/RunButton";
import { StatusDot } from "@/components/Status";
import { useApp } from "@/hooks/app";
import { useRunSaved } from "@/hooks/useRunSaved";
import { buildGraph, STATE_LABEL, stateColor, W, H, type CardData, type FrameData, type GNode, type RootData, type RowData } from "@/lib/graph";
import { STEPS } from "@/lib/steps";
import { useMedia, useStored } from "@/lib/storage";
import { ago, cn, dur, money } from "@/lib/utils";

const STATUS_TXT = { done: "Done", running: "Running", failed: "Failed", todo: "To do" } as const;

/** Paid / Free badge of an action (nothing for blocks without one). */
function Cost({ action }: { action?: string }) {
  const { schema } = useApp();
  const a = action ? schema[action] : undefined;
  if (!a) return null;
  return a.paid ? <Badge tone="neutral" className="h-4 px-1 text-[10px]">{a.paid}</Badge> : null;
}

/** "4 h ago · 19 s · $0.21"; empty when the dashboard never ran it (e.g. it ran from the terminal) and nothing was recorded. */
const lastText = (c: CardData) => [c.last && `${ago(c.last.end)} · ${dur(c.last.ms)}`, c.cost > 0 && money(c.cost)].filter(Boolean).join(" · ");

function Mark({ status }: { status: CardData["status"] }) {
  return (
    <span className={cn("flex size-4 shrink-0 items-center justify-center rounded-full ring-1 ring-inset", status === "done" ? "bg-success/15 text-success ring-success/35" : status === "running" ? "bg-warning/15 text-warning ring-warning/40" : status === "failed" ? "bg-destructive/15 text-destructive ring-destructive/40" : "ring-border-strong")}>
      {status === "done" ? <Check className="size-2.5" strokeWidth={3} /> : status === "running" ? <Loader2 className="size-2.5 animate-spin" /> : status === "failed" ? <X className="size-2.5" strokeWidth={3} /> : null}
    </span>
  );
}

/** Lets a frame's header toggle its own collapse. */
const CollapseCtx = createContext<(key: string) => void>(() => {});

/** Sockets: in/out left-right (cross-column and act rows), bin/bout top-bottom (inside a column), loop sockets on the free side. */
const Card = memo(function Card({ data, selected }: NodeProps<Node<CardData, "card">>) {
  const loopPos = data.dir === "h" ? Position.Bottom : Position.Right;
  const loopStyle = (k: number, n: number) => (data.dir === "h" ? { left: `${50 + (k - (n - 1) / 2) * 24}%` } : { top: `${50 + (k - (n - 1) / 2) * 24}%` });
  const sock = "!size-2 !border-0 !opacity-0";
  return (
    <div data-status={data.status} style={{ width: W, height: H }}
      className={cn("group flex flex-col justify-center gap-1 rounded-lg border bg-card px-3 shadow-sm transition-[border-color,box-shadow] hover:border-border-strong", data.status === "failed" && "border-destructive/50", data.status === "running" && "border-warning/70 ring-[3px] ring-warning/15", selected && "border-brand ring-[3px] ring-brand/20")}>
      <Handle id="in" type="target" position={Position.Left} className={sock} />
      <Handle id="out" type="source" position={Position.Right} className={sock} />
      <Handle id="bin" type="target" position={Position.Top} className={sock} />
      <Handle id="bout" type="source" position={Position.Bottom} className={sock} />
      {Array.from({ length: data.ls }, (_, k) => <Handle key={`s${k}`} id={`ls${k}`} type="source" position={loopPos} style={loopStyle(k, data.ls)} className="!size-1.5 !border-0 !opacity-0" />)}
      {Array.from({ length: data.lt }, (_, k) => <Handle key={`t${k}`} id={`lt${k}`} type="target" position={loopPos} style={loopStyle(k, data.lt)} className="!size-1.5 !border-0 !opacity-0" />)}
      <div className="flex items-center gap-2">
        <Mark status={data.status} />
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium tracking-[-0.01em]" title={data.title}>{data.title}</span>
        <Cost action={data.action} />
      </div>
      <div className="truncate pl-6 text-[11px] text-subtle-foreground">{data.extra ?? (lastText(data) || STATUS_TXT[data.status])}</div>
    </div>
  );
});

/** Step frame: a draggable group (grip in the header) that collapses to one summary node; cards are its children. */
const Frame = memo(function Frame({ data }: NodeProps<Node<FrameData, "frame">>) {
  const toggle = useContext(CollapseCtx);
  const color = stateColor(data.state);
  const pct = data.total ? (data.done / data.total) * 100 : 0;
  const sock = "!size-2 !border-0 !opacity-0";
  return (
    <div className={cn("rounded-xl border bg-muted/30 transition-colors", data.collapsed && "bg-card shadow-sm")} style={{ width: data.w, height: data.h, borderColor: `color-mix(in srgb, ${color} 35%, var(--border))` }}>
      {data.collapsed && <><Handle id="in" type="target" position={Position.Left} className={sock} /><Handle id="out" type="source" position={Position.Right} className={sock} /></>}
      <div className="wg-drag flex h-12 cursor-grab items-center gap-2 px-3 active:cursor-grabbing">
        <GripVertical className="size-3.5 shrink-0 text-subtle-foreground/70" />
        <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />
        <b className="truncate text-[13.5px] font-semibold tracking-[-0.01em]">{data.label}</b>
        <span className="shrink-0 text-[11.5px]" style={{ color }}>{STATE_LABEL[data.state]}</span>
        {!data.collapsed && data.total > 0 && <span className="shrink-0 text-[11px] tabular-nums text-subtle-foreground">{data.done}/{data.total}</span>}
        <span className="flex-1" />
        <Tip label={data.collapsed ? "Expand" : "Collapse"}>
          <button type="button" onClick={(e) => { e.stopPropagation(); toggle(data.key); }} aria-label={`${data.collapsed ? "Expand" : "Collapse"} ${data.label}`}
            className="nodrag flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
            {data.collapsed ? <Maximize2 className="size-3.5" /> : <Minimize2 className="size-3.5" />}
          </button>
        </Tip>
      </div>
      {data.collapsed && (
        <div className="grid gap-1.5 px-3 pb-3">
          <div className="flex items-center justify-between text-[11.5px] text-muted-foreground"><span className="truncate">{data.hint}</span><span className="tabular-nums">{data.done}/{data.total}</span></div>
          <div className="h-1 overflow-hidden rounded-full bg-border-strong/60"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} /></div>
        </div>
      )}
    </div>
  );
});

const Row = memo(function Row({ data }: NodeProps<Node<RowData, "row">>) {
  return <div className="pointer-events-none whitespace-nowrap text-[11.5px] text-muted-foreground"><span className="font-mono font-medium text-foreground">{data.id}</span><span className="mx-1.5 text-subtle-foreground">·</span>{data.title}</div>;
});

/** The Idea: the root every branch (Video, Shorts, Packaging) grows from. Click = the project overview. */
const Root = memo(function Root({ data }: NodeProps<Node<RootData, "root">>) {
  return (
    <div style={{ width: W, height: H + 16 }} className="flex cursor-pointer flex-col justify-center gap-1 rounded-lg border border-brand/60 bg-card px-3 shadow-sm ring-[3px] ring-brand/10 transition-colors hover:border-brand">
      <Handle id="out" type="source" position={Position.Right} className="!size-2 !border-0 !opacity-0" />
      <div className="flex items-center gap-1.5"><StatusDot s={data.done ? "done" : "none"} /><b className="text-[13px] font-semibold tracking-tight">Idea</b></div>
      <div className="line-clamp-2 text-[11px] leading-snug text-muted-foreground" title={data.sub}>{data.sub}</div>
    </div>
  );
});

const nodeTypes = { card: Card, frame: Frame, row: Row, root: Root };

/** Selected card: what it is, its state, the Run button, and a jump back to the list view. */
function Inspector({ n, onClose }: { n: Node<CardData, "card">; onClose: () => void }) {
  const { schema, busy, go, setMode } = useApp();
  const runSaved = useRunSaved();
  const c = n.data, a = c.action ? schema[c.action] : undefined;
  return (
    <div className="wg-enter w-[min(340px,calc(100vw-24px))] rounded-xl border border-border-strong bg-popover p-4 text-xs shadow-md">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold tracking-tight">{c.act && <span className="mr-1 font-mono">{c.act}</span>}{c.title}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge tone={c.status === "done" ? "success" : c.status === "running" ? "warning" : c.status === "failed" ? "danger" : "neutral"}><StatusDot s={c.status === "todo" ? "none" : c.status} />{STATUS_TXT[c.status]}</Badge>
            {a?.paid && <Badge>{a.paid}</Badge>}
          </div>
        </div>
        <Button variant="ghost" size="icon" className="-mr-1.5 -mt-1.5 size-7" onClick={onClose} aria-label="Close"><X /></Button>
      </div>
      {(c.desc || a?.help) && <p className="m-0 mt-2 text-muted-foreground">{c.desc ?? a?.help}</p>}
      {c.extra && <p className="m-0 mt-2">{c.extra}</p>}
      <div className="mt-2 flex items-center gap-3 text-[11.5px] text-muted-foreground">
        {c.last && <span>last run {ago(c.last.end)} · {dur(c.last.ms)}</span>}
        {c.cost > 0 && <span className="text-foreground/80">{money(c.cost)}</span>}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {c.action && <RunButton primary={!a?.paid} running={c.status === "running"} disabled={!!busy} onClick={() => runSaved(c.action!, c.act)} />}
        <Button variant="secondary" onClick={() => { setMode("list"); go({ view: "ws", ...c.nav }); }}><ExternalLink />Open page</Button>
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
const fit = { padding: 0.06, minZoom: 0.8 };

type Offsets = Record<string, { x: number; y: number }>;

function Canvas() {
  const { d, ws, busy, go, setMode } = useApp();
  const [sel, setSel] = useState<string | null>(null);
  const dark = useDark(), phone = useMedia("(max-width: 639px)");
  const [collapsedList, setCollapsed] = useStored<string[]>("graph.collapsed", []);
  const [offsets, setOffsets] = useStored<Offsets>(`graph.offsets.${ws}`, {});
  const collapsed = useMemo(() => new Set(collapsedList), [collapsedList]);
  const graph = useMemo(() => (d ? buildGraph(d, busy, collapsed) : { nodes: [] as GNode[], edges: [] }), [d, busy, collapsed]);
  const base = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n.position])), [graph]);
  // computed layout + the user's moves (stored as offsets from the computed position, per video)
  const laid = useMemo(() => graph.nodes.map((n) => { const o = offsets[n.id]; return { ...n, position: o ? { x: n.position.x + o.x, y: n.position.y + o.y } : n.position, selected: n.id === sel }; }), [graph, offsets, sel]);
  const [nodes, setNodes] = useState<GNode[]>(laid);
  useEffect(() => setNodes(laid), [laid]);
  const onNodesChange = useCallback((ch: NodeChange<GNode>[]) => setNodes((ns) => applyNodeChanges(ch.filter((c) => c.type === "position" || c.type === "dimensions"), ns)), []);
  const picked = graph.nodes.find((n) => n.id === sel && n.type === "card") as Node<CardData, "card"> | undefined;
  const toggle = useCallback((key: string) => setCollapsed((l) => (l.includes(key) ? l.filter((k) => k !== key) : [...l, key])), [setCollapsed]);
  const allKeys = [...STEPS.map((s) => s.key), "shorts", "publish"];
  const rf = useReactFlow();
  const fitRef = useRef(rf.fitView);
  fitRef.current = rf.fitView;
  const refit = () => setTimeout(() => { void fitRef.current({ ...fit, duration: 300 }); }, 60);
  // refit when the video changes (live updates keep the viewport: nodes just change in place)
  useEffect(() => {
    setSel(null);
    const t = setTimeout(() => { void fitRef.current(fit).then(() => { const z = rf.getZoom(); if (z <= fit.minZoom + 0.01) void rf.setViewport({ x: 24, y: 24, zoom: z }); }); }, 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws]);
  return (
    <CollapseCtx.Provider value={toggle}>
      <ReactFlow nodes={nodes} edges={graph.edges} nodeTypes={nodeTypes} colorMode={dark ? "dark" : "light"} className="wg-flow"
        fitView fitViewOptions={fit} minZoom={0.1} maxZoom={1.5} onNodesChange={onNodesChange}
        nodesDraggable nodesConnectable={false} edgesFocusable={false} proOptions={{ hideAttribution: true }}
        onNodeDragStop={(_, n) => { const b = base.get(n.id); if (b) setOffsets((o) => ({ ...o, [n.id]: { x: n.position.x - b.x, y: n.position.y - b.y } })); }}
        onNodeClick={(_, n) => { if (n.type === "card") setSel(n.id); else if (n.type === "root") { setMode("list"); go({ view: "ws", sec: null, step: null, act: null, short: null }); } }}
        onNodeDoubleClick={(_, n) => { if (n.type === "card") { setMode("list"); go({ view: "ws", ...(n.data as CardData).nav }); } else if (n.type === "frame") toggle((n.data as FrameData).key); }} onPaneClick={() => setSel(null)}>
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.1} />
        <Controls showInteractive={false} />
        {!phone && <MiniMap style={{ width: 168, height: 104 }} pannable zoomable nodeColor={(n) => (n.type === "frame" ? "var(--muted)" : n.type === "card" ? "var(--border-strong)" : "transparent")} nodeStrokeWidth={0} />}
        <Panel position="bottom-center">
          <div className="flex items-center gap-0.5 rounded-lg border bg-card p-0.5 shadow-sm">
            <Tip label="Collapse every group"><Button variant="ghost" size="sm" onClick={() => { setCollapsed(allKeys); refit(); }}><ChevronsDownUp />Collapse</Button></Tip>
            <Tip label="Expand every group"><Button variant="ghost" size="sm" onClick={() => { setCollapsed([]); refit(); }}><ChevronsUpDown />Expand</Button></Tip>
            <span className="mx-0.5 h-4 w-px bg-border" />
            <Tip label="Put every group back where the layout places it"><Button variant="ghost" size="sm" disabled={!Object.keys(offsets).length} onClick={() => { setOffsets({}); refit(); }}><RotateCcw />Reset layout</Button></Tip>
          </div>
        </Panel>
        {picked && <Panel position="bottom-right"><Inspector n={picked} onClose={() => setSel(null)} /></Panel>}
      </ReactFlow>
    </CollapseCtx.Provider>
  );
}

/** Blender-style node view of the open project: the Idea, then Video, Shorts and Packaging with every step, sub-step, act row and loop-back. Click a card to inspect it, double-click (or "Open page") to go to its page. Live: derived from the polled details. */
export default function NodeView() {
  const { ws } = useApp();
  return <div className="min-h-0 flex-1"><ReactFlowProvider key={ws}><Canvas /></ReactFlowProvider></div>;
}
