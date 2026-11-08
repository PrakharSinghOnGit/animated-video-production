import React from "react";
import { Composition, Sequence, registerRoot } from "remotion";
import { DraftCanvas } from "../DraftCanvas";
import {
  W, H, PAL, INK, clamp, lerp, spring, move, expIn, stepTime, seg,
  lineP, circleP, polygonP, rectP, bezierP, sineP, gearP, morph, xform,
  line, fill, shape, background, setInkTime, inkLayer,
  text, label, fitSize, dropIn, typeOn, whipIn, capHeight,
  cube, box, drawMesh, drawSolids, globe,
  bars, graph, counter, panel, toggle, cursor, ruler, dimension, diamond,
  drawAct, chapterCard, penny, blinking, logo,
  type G, type Pt, type DraftCtx, type InkName, type PennyPose, type PennyMood,
} from "../index";

const FPS = 30;
const HEX_R = 96, HEX_C: Pt = [960, 540];
/** 19-cell honeycomb centres (pointy-top hexes of radius r). */
const honey = (r: number, rings = 2): Pt[] => {
  const out: Pt[] = [], dx = Math.sqrt(3) * r, dy = 1.5 * r;
  for (let q = -rings; q <= rings; q++) for (let s = -rings; s <= rings; s++) {
    const z = -q - s; if (Math.abs(z) > rings) continue;
    out.push([HEX_C[0] + dx * (q + s / 2), HEX_C[1] + dy * s]);
  }
  return out;
};

// ───────────────────────────── act 1: paper (0-8 s) ─────────────────────────────
function act1(g: G, ctx: DraftCtx) {
  drawAct(g, ctx, {
    ink: "paper", fig: { n: 1, name: "draft" }, meta: "SHEET 01 / 03",
    close: "flood", to: "blueprint", floodShape: (u) => polygonP(HEX_C[0], HEX_C[1], lerp(HEX_R, 1500, u), 6, -Math.PI / 2, 60),
    handoff: (h) => honey(HEX_R).forEach((c, i) => line(h, polygonP(c[0], c[1], HEX_R, 6, -Math.PI / 2, 60), { ink: "blueprint", closed: true, seed: i })),
  }, (h, t) => {
    const k = INK.paper;
    if (t < 2.0) {
      // title, rail above, pressed into the rail at 1.5
      const card = chapterCard(h, t, { ink: "paper", n: 1, title: "The Wealth Gap", t0: 0, pressAt: 1.5 });
      if (card.pressed >= 1) {
        // the line rises to the middle and gets ruler ticks
        const u = move(t, 1.62, 1.95), y = lerp(card.rail[0][1], 540, u);
        line(h, lineP(260, y, 1660, y), { ink: k, w: 4 });
      }
      return;
    }
    if (t < 4.0) {
      // the line gets pen-tool handles and bends into an S, then becomes travelling sine waves
      const u = move(t, 2.05, 2.5), w = move(t, 3.0, 3.4);
      const hl = 330 * u, a = 0.95;
      const p0: Pt = [380, 540], p3: Pt = [1540, 540], p1: Pt = [p0[0] + hl * Math.cos(-a), 540 + hl * Math.sin(-a) * 1], p2: Pt = [p3[0] - hl * Math.cos(-a), 540 - hl * Math.sin(-a)];
      const S = bezierP(p0, p1, p2, p3, 140);
      if (w <= 0) {
        line(h, S, { ink: k, w: 4, col: k.accent });
        if (u > 0.05 && t < 2.95) {
          for (const [a0, b0] of [[p0, p1], [p3, p2]] as [Pt, Pt][]) {
            line(h, [a0, b0], { ink: k, w: 2 });
            shape(h, rectP(a0[0] - 7, a0[1] - 7, 14, 14), { ink: k, w: 2 });
            shape(h, circleP(b0[0], b0[1], 7, 18), { ink: k, w: 2 });
          }
          label(h, "TREND", p1[0] + 18, p1[1] - 14, { ink: k, size: 24 });
        }
      } else {
        for (let i = 0; i < 8; i++) {
          const ribbon = sineP(380, 1540, 540, 92 * w, 2.75, t * 4 + i * 0.22, 140);
          line(h, morph(S, ribbon, w, { n: 140 }), { ink: k, w: i === 0 ? 4 : 1.8, col: k.accent, alpha: i === 0 ? 1 : 0.55, seed: i });
        }
      }
      return;
    }
    if (t < 6.0) {
      // the wave curls into a circle, then triangle, square, hexagon; hatching builds inside
      const flat = lineP(380, 540, 1540, 540, 160);
      const circle = circleP(960, 540, 235, 160), tri = polygonP(960, 540, 260, 3, -Math.PI / 2 + Math.PI * 2 / 3 * move(t, 4.5, 4.85), 160);
      const sq = polygonP(960, 540, 260, 4, Math.PI / 4, 160), hex = polygonP(960, 540, 270, 6, -Math.PI / 2, 160);
      let p: Pt[];
      if (t < 4.5) p = morph(flat, circle, move(t, 4.05, 4.4), { closedB: true });
      else if (t < 5.0) p = morph(circle, tri, move(t, 4.5, 4.85), { closedA: true, closedB: true, key: "ct" });
      else if (t < 5.5) p = morph(tri, sq, move(t, 5.0, 5.35), { closedA: true, closedB: true, key: "ts" });
      else p = morph(sq, hex, move(t, 5.5, 5.85), { closedA: true, closedB: true, key: "sh" });
      const closed = t >= 4.4;
      if (closed) fill(h, p, { ink: k, kind: t > 5.5 ? "cross" : "hatch", progress: seg(t, 4.5, 5.6) });
      line(h, p, { ink: k, w: 4, closed });
      return;
    }
    // tiling: the hexagon shrinks and the honeycomb slides out; hatching floods every cell solid blue
    const cells = honey(HEX_R);
    const shrink = move(t, 6.0, 6.35), r = lerp(270, HEX_R, shrink);
    cells.forEach((c, i) => {
      const d = Math.hypot(c[0] - HEX_C[0], c[1] - HEX_C[1]);
      const out = move(t, 6.35 + (d > 200 ? 0.5 : 0), 6.7 + (d > 200 ? 0.5 : 0));
      if (i > 0 && d > 1 && out <= 0) return;
      const cc: Pt = d < 1 ? HEX_C : [lerp(HEX_C[0], c[0], out), lerp(HEX_C[1], c[1], out)];
      const hex = polygonP(cc[0], cc[1], d < 1 ? r : HEX_R, 6, -Math.PI / 2, 60);
      const solid = seg(t, 7.0 + (cc[0] - 600) / 1800, 7.35 + (cc[0] - 600) / 1800);
      if (solid > 0) fill(h, hex, { ink: k, kind: "solid", progress: solid });
      else fill(h, hex, { ink: k, kind: "hatch", progress: seg(t, 6.7, 7.0) });
      line(h, hex, { ink: k, w: 3, closed: true, seed: i });
    });
  });
}

// ───────────────────────────── act 2: blueprint (8-14 s) ─────────────────────────────
function act2(g: G, ctx: DraftCtx) {
  drawAct(g, ctx, {
    ink: "blueprint", fig: { n: 2, name: "mechanism" }, meta: "SHEET 02 / 03", close: "scan", to: "hologram",
  }, (h, t) => {
    const k = INK.blueprint;
    if (t < 2.0) {
      // the honeycomb in white line becomes cubes seen corner-on, which slide into the centre one; perspective switches on
      const cells = honey(HEX_R), gather = move(t, 0.6, 1.0);
      // hand-over: the white honeycomb the paper act flooded in stays until the cube edges have drawn on
      if (t < 0.5) cells.forEach((c, i) => line(h, polygonP(c[0], c[1], HEX_R, 6, -Math.PI / 2, 60), { ink: k, closed: true, seed: i }));
      const ry = Math.PI / 4 + (Math.PI / 4) * move(t, 1.1, 1.5), rx = lerp(-0.6155, -0.35, move(t, 1.1, 1.5));
      const persp = move(t, 1.1, 1.5);
      cells.forEach((c, i) => {
        if (i > 0 && gather >= 1) return;
        const cc: Pt = [lerp(c[0], HEX_C[0], gather), lerp(c[1], HEX_C[1], gather)];
        const isC = Math.hypot(c[0] - HEX_C[0], c[1] - HEX_C[1]) < 1;
        const s = isC ? lerp(HEX_R * 1.15, 300, gather) : HEX_R * 1.15;
        drawMesh(h, cube(1), { x: cc[0], y: cc[1], s: s, rx: -0.6155, ry: Math.PI / 4, ...(isC ? { rx, ry, persp } : {}) }, { ink: k, hidden: "dashed", progress: seg(t, 0.05, 0.45), seed: i });
      });
      return;
    }
    if (t < 4.0) {
      // the cube flattens to its front square, which grows teeth: a gear train stepping on every eighth note
      const step = Math.floor(Math.max(0, t - 2.25) / 0.25), rot = step * (Math.PI / 4) + (Math.PI / 4) * clamp(spring(t, 2.25 + step * 0.25, 30));
      const grow = move(t, 2.0, 2.3);
      const sq = rectP(960 - 208, 540 - 208, 416, 416, 200), gear = gearP(960, 540, 16, 208, 30, rot / 16 * 8);
      line(h, morph(sq, gear, grow, { closedA: true, closedB: true, n: 200 }), { ink: k, closed: true, w: 3.5 });
      if (grow > 0.9) {
        line(h, circleP(960, 540, 208, 120), { ink: k, hidden: true, closed: true });
        shape(h, circleP(960, 540, 18, 30), { ink: k, w: 3 });
        label(h, "16T", 960, 590, { ink: k, align: "center", size: 24 });
        const g2 = move(t, 2.5, 2.8);
        if (g2 > 0) {
          const c2: Pt = [960 + (208 + 130) * Math.cos(-0.7), 540 + (208 + 130) * Math.sin(-0.7)];
          shape(h, gearP(c2[0], c2[1], 10, 130 * g2, 26 * g2, -rot * 1.6 + 0.16), { ink: k, w: 3.5 });
          if (g2 > 0.9) label(h, "10T", c2[0], c2[1] + 8, { ink: k, align: "center", size: 24 });
        }
      }
      return;
    }
    // dashboard: panels, a bar chart (one bar per second of this preview) and counters rolling up
    const T = t - 4.0, k2 = k;
    const vals = [42, 30, 36, 44, 50, 46, 52, 62, 50, 56, 62, 72, 60, 66, 58, 76, 56, 62, 68, 74];
    panel(h, 230, 170, 1460, 70, { ink: k2, title: "THE WEALTH GAP — DEMO DATA", u: move(t, 4.0, 4.3) });
    toggle(h, 1600, 189, { ink: k2, on: seg(T, 1.6, 1.75), label: "LIGHT" });
    panel(h, 230, 270, 300, 480, { ink: k2, u: move(t, 4.05, 4.35) });
    panel(h, 560, 270, 820, 480, { ink: k2, u: move(t, 4.1, 4.4) });
    panel(h, 1410, 270, 280, 230, { ink: k2, u: move(t, 4.15, 4.45) });
    panel(h, 1410, 520, 280, 230, { ink: k2, u: move(t, 4.2, 4.5) });
    panel(h, 230, 780, 1460, 110, { ink: k2, u: move(t, 4.25, 4.55) });
    const tops = bars(h, { ink: k2, values: vals, max: 100, x: 600, y: 720, w: 740, h: 400, gap: 0.35,
      grow: (i) => spring(T, 0.3 + i * 0.02, 18), fillOf: (i) => (i === Math.floor(T * 4) % vals.length ? "solid" : i < Math.floor(T * 4) % vals.length ? "hatch" : "none"), colOf: (i) => (i === Math.floor(T * 4) % vals.length ? PAL.cyan : undefined) });
    graph(h, tops, { ink: k2, u: seg(T, 0.8, 1.3), col: PAL.cyan });
    counter(h, T, 260, 400, { ink: k2, value: 120, t0: 0.6, size: 90, fill: "solid" });
    label(h, "BPM", 262, 440, { ink: k2, size: 22 });
    counter(h, T, 260, 640, { ink: k2, value: 60, t0: 0.7, size: 90, fill: "solid" });
    label(h, "BEATS", 262, 680, { ink: k2, size: 22 });
    counter(h, T, 1440, 400, { ink: k2, value: 1800, t0: 0.8, size: 80, fill: "solid" });
    counter(h, T, 1440, 650, { ink: k2, value: 0, t0: 0.9, size: 80, fill: "solid" });
    for (let i = 0; i < 15; i++) diamond(h, 280 + i * 96, 835, { ink: k2, on: i <= T * 4 });
    // the cursor arrives and clicks LIGHT at 1.6 s
    const ca = move(T, 0.9, 1.5), press = seg(T, 1.5, 1.75);
    cursor(h, lerp(1200, 1628, ca), lerp(900, 204, ca), { ink: k2, press });
  });
}

// ───────────────────────────── act 3: hologram (14-20 s) ─────────────────────────────
function act3(g: G, ctx: DraftCtx) {
  drawAct(g, ctx, { ink: "hologram", fig: { n: 3, name: "light" }, meta: "SHEET 03 / 03" }, (h, t) => {
    const k = INK.hologram;
    if (t < 2.2) {
      // bars stand up on a floor and turn into a rising staircase
      const vals = [42, 50, 46, 62, 56, 72, 66, 76, 70, 86, 94, 100];
      const ry = lerp(-0.25, 0.55, move(t, 0.4, 1.4)), rx = -0.42;
      const floor = box(1100, 8, 420);
      const items: { mesh: ReturnType<typeof box>; pose: any }[] = [{ mesh: floor, pose: { x: 960, y: 700, rx, ry, oy: 4 } }];
      const sorted = [...vals].sort((a, b) => a - b), u = move(t, 1.0, 1.6);
      vals.forEach((v, i) => {
        const vv = lerp(v, sorted[i], u), hgt = 4.2 * vv * clamp(spring(t, 0.1 + i * 0.03, 16));
        items.push({ mesh: box(56, Math.max(1, hgt), 56), pose: { x: 960, y: 700, rx, ry, ox: -480 + i * 87, oy: -hgt / 2 } });
      });
      drawSolids(h, items as any, { ink: k, fill: "scan" });
      return;
    }
    if (t < 4.0) {
      // a globe with a ripple running down it; the halves twist against each other
      const T = t - 2.2;
      globe(h, 960, 540, 205 * clamp(spring(T, 0, 16)), { ink: k, ry: T * 0.8, rx: -0.35, lat: 8, lon: 14, twist: move(T, 1.0, 1.4) * (Math.PI / 4), split: 30 * Math.sin(Math.PI * seg(T, 0.9, 1.6)),
        ripple: (la) => 0.06 * Math.max(0, Math.sin(la * 3 - T * 8)) * seg(T, 0.3, 0.6) });
      return;
    }
    // end title: scan-line type, rail, Penny runs in along the rail, stops, waves
    const T = t - 4.0, size = fitSize("THE WEALTH GAP", 1300);
    const base = 600;
    text(h, "THE WEALTH GAP", 960, base, { size, ink: k, align: "center", fill: "scan", progress: seg(T, 0, 0.3), light: 0.8 });
    label(h, "A FINANCE CHANNEL", 960, base - capHeight(size) - 40, { ink: k, align: "center", size: 26, track: 0.3, col: PAL.white, alpha: T > 0.3 ? 1 : 0 });
    const railY = base - capHeight(size) - 90;
    line(h, lineP(960 - 650 * clamp(spring(T, 0.3, 18)), railY, 960 + 650 * clamp(spring(T, 0.3, 18)), railY), { ink: k, w: 4 });
    const run = move(T, 0.6, 1.3), px = lerp(2100, 1480, run);
    penny(h, px, railY - 2, { ink: k, s: 1.5, t, pose: run < 1 ? "run" : T > 1.6 ? "wave" : "stand", flip: true, mood: "happy" });
  });
}

// ───────────────────────────── character sheet ─────────────────────────────
function sheet(g: G, ctx: DraftCtx, ink: InkName) {
  setInkTime(1.0);
  background(g, ink);
  inkLayer(g, ink, (h) => {
    const k = INK[ink];
    label(h, `PENNY — CHARACTER SHEET — ${ink.toUpperCase()}`, 110, 90, { ink: k, size: 26, track: 0.22 });
    const row1: { pose: PennyPose; turn?: number; name: string; t?: number }[] = [
      { pose: "stand", name: "FRONT" }, { pose: "stand", turn: 0.7, name: "THREE-QUARTER" }, { pose: "stand", turn: 1.5, name: "EDGE-ON" },
      { pose: "run", name: "RUN", t: 0.08 }, { pose: "walk", name: "WALK", t: 0.2 }, { pose: "sit", name: "SIT" },
    ];
    const row2: { pose: PennyPose; mood: PennyMood; name: string }[] = [
      { pose: "point", mood: "happy", name: "POINT" }, { pose: "present", mood: "happy", name: "PRESENT" }, { pose: "pencil", mood: "neutral", name: "PENCIL" },
      { pose: "shrug", mood: "worried", name: "SHRUG / WORRIED" }, { pose: "wave", mood: "happy", name: "WAVE" }, { pose: "stand", mood: "surprised", name: "SURPRISED" },
    ];
    row1.forEach((r, i) => { const x = 230 + i * 292; penny(h, x, 470, { ink, s: 1.9, pose: r.pose, turn: r.turn, t: r.t ?? 0.5 }); label(h, r.name, x, 520, { ink: k, size: 20, align: "center" }); });
    row2.forEach((r, i) => { const x = 230 + i * 292; penny(h, x, 900, { ink, s: 1.9, pose: r.pose, mood: r.mood, t: 0.5, aim: -0.4 }); label(h, r.name, x, 950, { ink: k, size: 20, align: "center" }); });
    line(h, lineP(110, 560, 1810, 560), { ink: k, w: 1.5, hidden: true });
  });
}


// Logos and icons in the ink (draft.logo): outline + the ink's fill; the last row is drawn on / hatched in part-way.
function logoSheet(g: G, ctx: DraftCtx, ink: InkName) {
  setInkTime(1.0);
  background(g, ink);
  inkLayer(g, ink, (h) => {
    const k = INK[ink];
    label(h, `LOGOS + ICONS — draft.logo — ${ink.toUpperCase()}`, 110, 90, { ink: k, size: 26, track: 0.22 });
    const brands = ["tesla", "visa", "hdfcbank", "zerodha", "bitcoin", "apple"];
    brands.forEach((n, i) => { const x = 270 + i * 276; logo(h, n, x, 300, 180, { ink, col: i === 0 ? k.accent : undefined }); label(h, n.toUpperCase(), x, 440, { ink: k, size: 20, align: "center" }); });
    const icons = ["mdi:bank", "mdi:piggy-bank", "mdi:home-city", "mdi:cash-multiple", "mdi:chart-line", "mdi:factory"];
    icons.forEach((n, i) => { const x = 270 + i * 276; logo(h, n, x, 600, 150, { ink, fit: "box", fill: "none" }); label(h, n, x, 710, { ink: k, size: 20, align: "center" }); });
    [0.3, 0.6, 1].forEach((u, i) => { const x = 500 + i * 460; logo(h, "nvidia", x, 880, 200, { ink, progress: u, fillProgress: clamp(u * 2 - 1) }); label(h, `progress ${u}`, x, 1010, { ink: k, size: 20, align: "center" }); });
  });
}

const actsTotal = 20 * FPS;
const Preview: React.FC = () => (
  <>
    <Sequence from={0} durationInFrames={8 * FPS}><DraftCanvas draw={act1} /></Sequence>
    <Sequence from={8 * FPS} durationInFrames={6 * FPS}><DraftCanvas draw={act2} /></Sequence>
    <Sequence from={14 * FPS} durationInFrames={6 * FPS}><DraftCanvas draw={act3} /></Sequence>
  </>
);

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="DraftPreview" component={Preview} durationInFrames={actsTotal} fps={FPS} width={1920} height={1080} />
    <Composition id="LogoPaper" component={() => <DraftCanvas draw={(g, c) => logoSheet(g, c, "paper")} />} durationInFrames={1} fps={FPS} width={1920} height={1080} />
    <Composition id="LogoBlueprint" component={() => <DraftCanvas draw={(g, c) => logoSheet(g, c, "blueprint")} />} durationInFrames={1} fps={FPS} width={1920} height={1080} />
    <Composition id="LogoHologram" component={() => <DraftCanvas draw={(g, c) => logoSheet(g, c, "hologram")} />} durationInFrames={1} fps={FPS} width={1920} height={1080} />
    <Composition id="PennyPaper" component={() => <DraftCanvas draw={(g, c) => sheet(g, c, "paper")} />} durationInFrames={1} fps={FPS} width={1920} height={1080} />
    <Composition id="PennyBlueprint" component={() => <DraftCanvas draw={(g, c) => sheet(g, c, "blueprint")} />} durationInFrames={1} fps={FPS} width={1920} height={1080} />
    <Composition id="PennyHologram" component={() => <DraftCanvas draw={(g, c) => sheet(g, c, "hologram")} />} durationInFrames={1} fps={FPS} width={1920} height={1080} />
  </>
);

registerRoot(RemotionRoot);
