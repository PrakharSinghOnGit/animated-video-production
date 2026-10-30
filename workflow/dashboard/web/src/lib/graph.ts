import { MarkerType, type Edge as RFEdge, type Node } from "@xyflow/react";
import type { Route } from "@/hooks/useRoute";
import type { ActRow, Details, Job, Run, St, StepKey } from "./types";
import { costOf, lastRun, type BlockStatus } from "./flow";
import { actSpec, blockStatus, shortSpec, stepSpec, type BlockSpec, type LoopDef } from "./pipeline";
import { STATE_LABEL, STEPS, stepStates, type StepState } from "./steps";

/** Node card size, frame padding and gaps (px in flow coordinates). */
export const W = 184, H = 80;
const PAD = 16, HEAD = 44, GAP_Y = 32, GAP_X = 36, GAP_COL = 56, LOOP_PAD = 120, ROW_LABEL = 20, ROW_GAP = 44, ACTS_BOTTOM = 36, BAND_GAP = 72;

/** What a sub-step card shows and what the inspector needs. `dir` = which way its row/column flows ("h" in act rows). */
export type CardData = {
  title: string; desc?: string; action?: string; act?: string; short?: string; nav: Partial<Route>; dir: "h" | "v";
  status: BlockStatus; last: Run | null; cost: number; extra?: string;
  /** loop-back handles this card sources (`ls0..`) and receives (`lt0..`) */
  ls: number; lt: number;
};
export type FrameData = { label: string; hint: string; state: StepState; w: number; h: number };
export type RowData = { id: string; title: string };
/** The Idea: root of the project graph (click = the project overview). */
export type RootData = { title: string; sub: string; done: boolean };
/** Smoothstep edge with its path options (the library types them only on its internal edge type). */
export type Edge = RFEdge & { pathOptions?: { offset?: number; borderRadius?: number; stepPosition?: number } };
export type GNode = Node<CardData, "card"> | Node<FrameData, "frame"> | Node<RowData, "row"> | Node<RootData, "root">;

const STATE_COLOR: Record<StepState, string> = { done: "var(--success)", running: "var(--warning)", next: "var(--brand)", todo: "var(--muted-foreground)", blocked: "var(--muted-foreground)" };
export const stateColor = (s: StepState) => STATE_COLOR[s];
export { STATE_LABEL };

const arrow = (color: string) => ({ type: MarkerType.ArrowClosed, color, width: 16, height: 16 });
const MUTED = "var(--muted-foreground)";

interface Ctx { d: Details; busy: Job | null; nodes: GNode[]; edges: Edge[]; status: Map<string, BlockStatus> }

/** Add the cards of one flow (a step column or an act row) and its in-flow and loop edges. Returns the card ids. */
function flow(c: Ctx, nav: (b: BlockSpec) => Partial<Route>, prefix: string, blocks: BlockSpec[], loops: LoopDef[], at: (i: number) => { x: number; y: number }, dir: "h" | "v"): string[] {
  const ids = blocks.map((b) => `${prefix}:${b.id}`);
  const lo = new Map<string, number>(), li = new Map<string, number>();
  const loopIdx = loops.map((l) => ({ l, s: lo.get(l.from) ?? 0, t: li.get(l.to) ?? 0 }));
  loopIdx.forEach(({ l }) => { lo.set(l.from, (lo.get(l.from) ?? 0) + 1); li.set(l.to, (li.get(l.to) ?? 0) + 1); });
  blocks.forEach((b, i) => {
    const status = blockStatus(c.d, c.busy, b);
    c.status.set(ids[i], status);
    const act = c.d.acts.find((a) => a.id === b.act);
    c.nodes.push({
      id: ids[i], type: "card", position: at(i), width: W, height: H, draggable: false, connectable: false,
      data: {
        title: b.title, desc: b.desc, action: b.action, act: b.act, nav: nav(b), dir, status,
        last: b.label ? lastRun(c.d, b.label) : null, cost: costOf(c.d, b.costRe ?? null)?.cost ?? 0,
        extra: b.id === "review" && act ? reviewLine(act) : undefined,
        ls: lo.get(b.id) ?? 0, lt: li.get(b.id) ?? 0,
      },
    });
  });
  ids.slice(1).forEach((to, i) => link(c, ids[i], to, dir === "h" ? { sh: "out", th: "in" } : { sh: "bout", th: "bin" }));
  loopIdx.forEach(({ l, s, t }) => {
    const on = l.ran > 0, color = on ? "var(--brand)" : MUTED, bottom = dir === "h";
    c.edges.push({
      id: `loop:${prefix}:${l.from}->${l.to}`, source: `${prefix}:${l.from}`, target: `${prefix}:${l.to}`, sourceHandle: `ls${s}`, targetHandle: `lt${t}`,
      type: "smoothstep", pathOptions: { offset: bottom ? 26 : 62 + s * 16 + t * 16, borderRadius: 10 }, animated: on, className: on ? "wg-loop wg-loop-on" : "wg-loop",
      label: `${l.label}${on ? ` ×${l.ran}` : ""}`, labelStyle: { fill: color, fontSize: 10 }, labelBgStyle: { fill: "var(--card)", fillOpacity: 0.95 }, labelBgPadding: [4, 2], labelBgBorderRadius: 4,
      style: { stroke: color, strokeWidth: on ? 2 : 1.5, strokeDasharray: on ? undefined : "4 3", opacity: on ? 1 : 0.7 }, markerEnd: arrow(color), zIndex: 2,
    });
  });
  return ids;
}

/** Plain forward edge; `trunk` = x where the vertical run of a cross-column edge should sit (middle of the gap). */
function link(c: Ctx, from: string, to: string, o: { sh: string; th: string; trunk?: number }) {
  const s = c.nodes.find((n) => n.id === from)!, t = c.nodes.find((n) => n.id === to)!;
  const run = c.status.get(to) === "running";
  const color = run ? "var(--warning)" : MUTED;
  let stepPosition = 0.5;
  if (o.trunk != null) {
    const sx = s.position.x + W, tx = t.position.x;
    stepPosition = Math.min(0.95, Math.max(0.05, (o.trunk - sx) / (tx - sx)));
  }
  c.edges.push({
    id: `${from}->${to}`, source: from, target: to, sourceHandle: o.sh, targetHandle: o.th, type: "smoothstep",
    pathOptions: { borderRadius: 10, stepPosition }, animated: run, style: { stroke: color, strokeWidth: 1.5, opacity: run ? 1 : 0.7 }, markerEnd: arrow(color),
  });
}

const reviewLine = (a: ActRow) => { const r = a.reviews[0]; return r ? `sync ${r.sync} · overall ${r.overall} · ${r.issues.length} issue${r.issues.length === 1 ? "" : "s"}` : undefined; };

const secState = (st: St | undefined): StepState => (st === "done" ? "done" : st === "running" ? "running" : st === "none" || !st ? "todo" : "next");
const firstLine = (t: string) => t.split("\n").map((l) => l.replace(/^#+\s*/, "").trim()).find(Boolean) ?? "";

/**
 * The whole project as a node graph, left to right: the Idea at the root and three branches below each other.
 * Video: one frame per step (sub-steps top to bottom, the Acts frame with one row per act). Shorts: one row per short with
 * its stages. Packaging: one column. Pure: layout is computed, nothing measured.
 */
export function buildGraph(d: Details, busy: Job | null): { nodes: GNode[]; edges: Edge[] } {
  const c: Ctx = { d, busy, nodes: [], edges: [], status: new Map() };
  const states = stepStates(d.statuses);
  const first = new Map<StepKey, string>(), last = new Map<StepKey, string>(), right = new Map<StepKey, number>();
  const acts = d.acts;
  const actEnds: { first: string; last: string }[] = [];
  const x0 = W + 96;
  const vNav = (b: BlockSpec, step: StepKey): Partial<Route> => ({ sec: "video", step, act: b.act ?? null, short: null });
  let x = x0, bandH = 0;

  // ── branch 1: Video ──
  for (const s of STEPS) {
    const frameId = `frame:${s.key}`;
    let w: number, h: number;
    if (s.key !== "acts") {
      const { blocks, loops } = stepSpec(s.key, d);
      const colX = x + PAD;
      w = PAD + W + (loops.length ? LOOP_PAD : PAD);
      h = HEAD + blocks.length * H + (blocks.length - 1) * GAP_Y + PAD;
      const ids = flow(c, (b) => vNav(b, s.key), s.key, blocks, loops, (i) => ({ x: colX, y: HEAD + i * (H + GAP_Y) }), "v");
      first.set(s.key, ids[0]); last.set(s.key, ids.at(-1)!);
    } else {
      const rowH = ROW_LABEL + H + ROW_GAP;
      w = PAD * 2 + 7 * W + 6 * GAP_X;
      h = HEAD + Math.max(1, acts.length) * rowH - ROW_GAP + ACTS_BOTTOM;
      acts.forEach((a, r) => {
        const y = HEAD + r * rowH;
        c.nodes.push({ id: `row:${a.id}`, type: "row", position: { x: x + PAD, y }, width: W * 2, height: ROW_LABEL - 2, draggable: false, selectable: false, focusable: false, data: { id: a.id, title: a.title } });
        const { blocks, loops } = actSpec(a, d);
        const ids = flow(c, (b) => vNav(b, "acts"), `act:${a.id}`, blocks, loops, (i) => ({ x: x + PAD + i * (W + GAP_X), y: y + ROW_LABEL }), "h");
        actEnds.push({ first: ids[0], last: ids.at(-1)! });
      });
    }
    c.nodes.push({ id: frameId, type: "frame", position: { x, y: 0 }, width: w, height: h, zIndex: -1, draggable: false, selectable: false, focusable: false, data: { label: s.label, hint: s.hint, state: states[s.key], w, h } });
    right.set(s.key, x + w);
    bandH = Math.max(bandH, h);
    x += w + GAP_COL;
  }
  const trunk = (k: StepKey) => right.get(k)! + GAP_COL / 2;
  const cross = (a: StepKey, b: StepKey) => link(c, last.get(a)!, first.get(b)!, { sh: "out", th: "in", trunk: trunk(a) });
  cross("script", "voice"); cross("voice", "align"); cross("align", "plan");
  if (actEnds.length) {
    for (const e of actEnds) { link(c, last.get("plan")!, e.first, { sh: "out", th: "in", trunk: trunk("plan") }); link(c, e.last, first.get("sound")!, { sh: "out", th: "in", trunk: trunk("acts") }); }
  } else cross("plan", "sound");
  cross("sound", "render");

  // ── branch 2: Shorts (one row per short) and branch 3: Packaging, side by side below the video ──
  const y0 = bandH + BAND_GAP;
  const items = d.shorts.items, rowH = ROW_LABEL + H + ROW_GAP;
  const nShort = items[0] ? shortSpec(items[0], d).blocks.length : 9;
  const sw = PAD * 2 + nShort * W + (nShort - 1) * GAP_X;
  const sh = HEAD + Math.max(1, items.length) * rowH - ROW_GAP + ACTS_BOTTOM;
  const shortFirst: string[] = [];
  if (items.length) {
    items.forEach((it, r) => {
      const y = y0 + HEAD + r * rowH;
      c.nodes.push({ id: `row:short:${it.id}`, type: "row", position: { x: x0 + PAD, y }, width: W * 3, height: ROW_LABEL - 2, draggable: false, selectable: false, focusable: false, data: { id: it.id, title: it.entry.title ?? "(untitled)" } });
      const { blocks, loops } = shortSpec(it, d);
      const ids = flow(c, (b) => ({ sec: "shorts", short: it.id, step: b.id, act: null }), `short:${it.id}`, blocks, loops, (i) => ({ x: x0 + PAD + i * (W + GAP_X), y: y + ROW_LABEL }), "h");
      shortFirst.push(ids[0]);
    });
  } else {
    const ids = flow(c, () => ({ sec: "shorts", short: null, step: "script", act: null }), "short:new",
      [{ id: "write", title: "Write shorts", desc: "2–3 standalone 9:16 scripts from the approved script and its sourced data.", action: "shorts.write", label: "Write shorts", done: false }], [], () => ({ x: x0 + PAD, y: y0 + HEAD }), "h");
    shortFirst.push(ids[0]);
  }
  c.nodes.push({ id: "frame:shorts", type: "frame", position: { x: x0, y: y0 }, width: sw, height: sh, zIndex: -1, draggable: false, selectable: false, focusable: false, data: { label: "Shorts", hint: "9:16 shorts from this video", state: secState(d.statuses.shorts), w: sw, h: sh } });

  const pub = stepSpec("publish", d), px = x0 + sw + GAP_COL;
  const pw = PAD + W + (pub.loops.length ? LOOP_PAD : PAD), ph = HEAD + pub.blocks.length * H + (pub.blocks.length - 1) * GAP_Y + PAD;
  const pids = flow(c, (b) => ({ sec: "packaging", step: b.id, act: null, short: null }), "publish", pub.blocks, pub.loops, (i) => ({ x: px + PAD, y: y0 + HEAD + i * (H + GAP_Y) }), "v");
  c.nodes.push({ id: "frame:publish", type: "frame", position: { x: px, y: y0 }, width: pw, height: ph, zIndex: -1, draggable: false, selectable: false, focusable: false, data: { label: "Packaging", hint: "Thumbnails, titles, description", state: secState(d.statuses.publish), w: pw, h: ph } });

  // ── root: the Idea ──
  const idea = d.script.idea;
  c.nodes.push({ id: "root", type: "root", position: { x: 0, y: HEAD }, width: W, height: H, draggable: false, connectable: false, data: { title: "Idea", sub: d.title ?? (firstLine(idea) || "No draft yet"), done: !!idea.trim() } });
  const rootTrunk = x0 - 48;
  for (const to of [first.get("script")!, ...shortFirst, pids[0]]) link(c, "root", to, { sh: "out", th: "in", trunk: rootTrunk });
  return { nodes: c.nodes, edges: c.edges };
}
