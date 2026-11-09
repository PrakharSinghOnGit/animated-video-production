import { MarkerType, type Edge as RFEdge, type Node } from "@xyflow/react";
import type { Route } from "@/hooks/useRoute";
import type { ActRow, Details, Run, St, StepKey } from "./types";
import { costOf, lastRun, type BlockStatus } from "./flow";
import { actSpec, blockStatus, shortSpec, stepSpec, type BlockSpec, type LoopDef } from "./pipeline";
import { STATE_LABEL, STEPS, stepStates, type StepState } from "./steps";

/** Node card size, frame padding and gaps (px in flow coordinates). */
export const W = 196, H = 64;
const PAD = 20, HEAD = 56, GAP_Y = 28, GAP_X = 40, GAP_COL = 104, LOOP_PAD = 128, ROW_LABEL = 22, ROW_GAP = 48, ACTS_BOTTOM = 40, BAND_GAP = 128;
/** A collapsed group is one summary node this size. */
export const CW = 220, CH = 96;

/** What a sub-step card shows and what the inspector needs. `dir` = which way its row/column flows ("h" in act rows). */
export type CardData = {
  title: string; desc?: string; action?: string; act?: string; short?: string; nav: Partial<Route>; dir: "h" | "v";
  status: BlockStatus; last: Run | null; cost: number; extra?: string;
  /** loop-back handles this card sources (`ls0..`) and receives (`lt0..`) */
  ls: number; lt: number;
};
export type FrameData = { key: string; label: string; hint: string; state: StepState; w: number; h: number; collapsed: boolean; done: number; total: number };
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

interface Ctx { d: Details; nodes: GNode[]; edges: Edge[]; status: Map<string, BlockStatus>; parent: Map<string, string>; frame: string | null }

/** Add the cards of one flow (a step column or an act row) and its in-flow and loop edges. Returns the card ids. */
function flow(c: Ctx, nav: (b: BlockSpec) => Partial<Route>, prefix: string, blocks: BlockSpec[], loops: LoopDef[], at: (i: number) => { x: number; y: number }, dir: "h" | "v"): string[] {
  const ids = blocks.map((b) => `${prefix}:${b.id}`);
  const lo = new Map<string, number>(), li = new Map<string, number>();
  const loopIdx = loops.map((l) => ({ l, s: lo.get(l.from) ?? 0, t: li.get(l.to) ?? 0 }));
  loopIdx.forEach(({ l }) => { lo.set(l.from, (lo.get(l.from) ?? 0) + 1); li.set(l.to, (li.get(l.to) ?? 0) + 1); });
  blocks.forEach((b, i) => {
    const status = blockStatus(c.d, b);
    c.status.set(ids[i], status);
    const act = c.d.acts.find((a) => a.id === b.act);
    if (c.frame) c.parent.set(ids[i], c.frame);
    c.nodes.push({
      id: ids[i], type: "card", position: at(i), width: W, height: H, connectable: false,
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

const countDone = (d: Details, blocks: BlockSpec[]) => blocks.filter((b) => blockStatus(d, b) === "done").length;

/**
 * The whole project as a node graph, left to right: the Idea at the root and three branches below each other.
 * Video: one frame per step (sub-steps top to bottom, the Acts frame with one row per act). Shorts: one row per short with
 * its stages. Packaging: one column. A key in `collapsed` turns that frame into one summary node (edges re-route to it).
 * Cards are children of their frame (relative positions), so dragging a frame moves its cards. Pure: nothing is measured.
 */
export function buildGraph(d: Details, collapsed: Set<string> = new Set()): { nodes: GNode[]; edges: Edge[] } {
  const c: Ctx = { d, nodes: [], edges: [], status: new Map(), parent: new Map(), frame: null };
  const states = stepStates(d.statuses);
  const first = new Map<StepKey, string>(), last = new Map<StepKey, string>(), right = new Map<StepKey, number>();
  const acts = d.acts;
  const actEnds: { first: string; last: string }[] = [];
  const x0 = W + 128;
  // a shorts project (SH…) has no long video and no packaging: only the brief and its shorts
  const only = d.kind === "shorts";
  const vNav = (b: BlockSpec, step: StepKey): Partial<Route> => ({ sec: "video", step, act: b.act ?? null, short: null });
  const frame = (id: string, key: string, x: number, y: number, w: number, h: number, label: string, hint: string, state: StepState, done: number, total: number) =>
    c.nodes.push({ id, type: "frame", position: { x, y }, width: w, height: h, zIndex: -1, selectable: false, focusable: false, dragHandle: ".wg-drag",
      data: { key, label, hint, state, w, h, collapsed: collapsed.has(key), done, total } });
  let x = x0, bandH = 0;

  // ── branch 1: Video ──
  for (const s of only ? [] : STEPS) {
    const frameId = `frame:${s.key}`;
    let w: number, h: number, done = 0, total = 0;
    c.frame = frameId;
    if (collapsed.has(s.key)) {
      w = CW; h = CH;
      if (s.key === "acts") { done = acts.filter((a) => a.status === "done").length; total = acts.length; }
      else { const { blocks } = stepSpec(s.key, d); done = countDone(d, blocks); total = blocks.length; }
      first.set(s.key, frameId); last.set(s.key, frameId);
      if (s.key === "acts") actEnds.push({ first: frameId, last: frameId });
    } else if (s.key !== "acts") {
      const { blocks, loops } = stepSpec(s.key, d);
      const colX = x + PAD;
      w = PAD + W + (loops.length ? LOOP_PAD : PAD);
      h = HEAD + blocks.length * H + (blocks.length - 1) * GAP_Y + PAD;
      const ids = flow(c, (b) => vNav(b, s.key), s.key, blocks, loops, (i) => ({ x: colX, y: HEAD + i * (H + GAP_Y) }), "v");
      first.set(s.key, ids[0]); last.set(s.key, ids.at(-1)!);
      done = ids.filter((id) => c.status.get(id) === "done").length; total = ids.length;
    } else {
      const rowH = ROW_LABEL + H + ROW_GAP;
      w = PAD * 2 + 7 * W + 6 * GAP_X;
      h = HEAD + Math.max(1, acts.length) * rowH - ROW_GAP + ACTS_BOTTOM;
      acts.forEach((a, r) => {
        const y = HEAD + r * rowH;
        c.parent.set(`row:${a.id}`, frameId);
        c.nodes.push({ id: `row:${a.id}`, type: "row", position: { x: x + PAD, y }, width: W * 2, height: ROW_LABEL - 2, draggable: false, selectable: false, focusable: false, data: { id: a.id, title: a.title } });
        const { blocks, loops } = actSpec(a, d);
        const ids = flow(c, (b) => vNav(b, "acts"), `act:${a.id}`, blocks, loops, (i) => ({ x: x + PAD + i * (W + GAP_X), y: y + ROW_LABEL }), "h");
        actEnds.push({ first: ids[0], last: ids.at(-1)! });
      });
      done = acts.filter((a) => a.status === "done").length; total = acts.length;
    }
    frame(frameId, s.key, x, 0, w, h, s.label, s.hint, states[s.key], done, total);
    right.set(s.key, x + w);
    bandH = Math.max(bandH, h);
    x += w + GAP_COL;
  }
  c.frame = null;
  const trunk = (k: StepKey) => right.get(k)! + GAP_COL / 2;
  const cross = (a: StepKey, b: StepKey) => link(c, last.get(a)!, first.get(b)!, { sh: "out", th: "in", trunk: trunk(a) });
  if (!only) {
    cross("script", "voice"); cross("voice", "align"); cross("align", "plan");
    if (actEnds.length) {
      if (collapsed.has("acts")) { link(c, last.get("plan")!, actEnds[0].first, { sh: "out", th: "in", trunk: trunk("plan") }); link(c, actEnds[0].last, first.get("sound")!, { sh: "out", th: "in", trunk: trunk("acts") }); }
      else for (const e of actEnds) { link(c, last.get("plan")!, e.first, { sh: "out", th: "in", trunk: trunk("plan") }); link(c, e.last, first.get("sound")!, { sh: "out", th: "in", trunk: trunk("acts") }); }
    } else cross("plan", "sound");
    cross("sound", "render");
  }

  // ── branch 2: Shorts (one row per short) and branch 3: Packaging, side by side below the video ──
  const y0 = only ? 0 : bandH + BAND_GAP;
  const items = d.shorts.items, rowH = ROW_LABEL + H + ROW_GAP;
  const shortFirst: string[] = [];
  let sw: number, sh: number;
  c.frame = "frame:shorts";
  if (collapsed.has("shorts")) {
    sw = CW; sh = CH; shortFirst.push("frame:shorts");
  } else {
    const nShort = items[0] ? shortSpec(items[0], d).blocks.length : 1;
    sw = PAD * 2 + nShort * W + (nShort - 1) * GAP_X;
    sh = HEAD + Math.max(1, items.length) * rowH - ROW_GAP + ACTS_BOTTOM;
    if (items.length) {
      items.forEach((it, r) => {
        const y = y0 + HEAD + r * rowH;
        c.parent.set(`row:short:${it.id}`, "frame:shorts");
        c.nodes.push({ id: `row:short:${it.id}`, type: "row", position: { x: x0 + PAD, y }, width: W * 3, height: ROW_LABEL - 2, draggable: false, selectable: false, focusable: false, data: { id: it.id, title: it.entry.title ?? "(untitled)" } });
        const { blocks, loops } = shortSpec(it, d);
        const ids = flow(c, (b) => ({ sec: "shorts", short: it.id, step: b.id, act: null }), `short:${it.id}`, blocks, loops, (i) => ({ x: x0 + PAD + i * (W + GAP_X), y: y + ROW_LABEL }), "h");
        shortFirst.push(ids[0]);
      });
    } else {
      const ids = flow(c, () => ({ sec: "shorts", short: null, step: "script", act: null }), "short:new",
        [{ id: "write", title: "Write shorts", desc: only ? "One short or a series of parts from your brief." : "2–3 standalone 9:16 scripts from the approved script and its sourced data.", action: "shorts.write", label: "Write shorts", done: false }], [], () => ({ x: x0 + PAD, y: y0 + HEAD }), "h");
      shortFirst.push(ids[0]);
    }
  }
  const shortsDone = items.filter((s) => s.progress.exported).length;
  frame("frame:shorts", "shorts", x0, y0, sw, sh, "Shorts", only ? "9:16 shorts from the brief" : "9:16 shorts from this video", secState(d.statuses.shorts), shortsDone, items.length);

  let pFirst: string | undefined;
  if (!only) {
    const pub = stepSpec("publish", d), px = x0 + sw + GAP_COL;
    let pw: number, ph: number;
    c.frame = "frame:publish";
    if (collapsed.has("publish")) { pw = CW; ph = CH; pFirst = "frame:publish"; }
    else {
      pw = PAD + W + (pub.loops.length ? LOOP_PAD : PAD); ph = HEAD + pub.blocks.length * H + (pub.blocks.length - 1) * GAP_Y + PAD;
      pFirst = flow(c, (b) => ({ sec: "packaging", step: b.id, act: null, short: null }), "publish", pub.blocks, pub.loops, (i) => ({ x: px + PAD, y: y0 + HEAD + i * (H + GAP_Y) }), "v")[0];
  }
  c.frame = null;
  frame("frame:publish", "publish", px, y0, pw, ph, "Packaging", "Thumbnails, titles, description", secState(d.statuses.publish), countDone(d, pub.blocks), pub.blocks.length);
  }

  // ── root: the Idea ──
  const idea = d.script.idea;
  c.nodes.push({ id: "root", type: "root", position: { x: 0, y: HEAD }, width: W, height: H + 16, connectable: false, data: { title: only ? "Brief" : "Idea", sub: d.title ?? (firstLine(idea) || "No draft yet"), done: !!idea.trim() } });
  const rootTrunk = x0 - 64;
  for (const to of [...(only ? [] : [first.get("script")!]), ...shortFirst, ...(pFirst ? [pFirst] : [])]) link(c, "root", to, { sh: "out", th: "in", trunk: rootTrunk });

  // children after their frame, with positions relative to it (React Flow sub-flows)
  const byId = new Map(c.nodes.map((n) => [n.id, n]));
  const frames = c.nodes.filter((n) => n.type === "frame"), rest = c.nodes.filter((n) => n.type !== "frame");
  for (const n of rest) {
    const pid = c.parent.get(n.id), p = pid ? byId.get(pid) : undefined;
    if (!p) continue;
    n.parentId = p.id;
    n.position = { x: n.position.x - p.position.x, y: n.position.y - p.position.y };
    if (n.type === "card") n.extent = "parent";
  }
  return { nodes: [...frames, ...rest], edges: c.edges };
}
