import React from "react";
import { Composition, registerRoot } from "remotion";
import { SceneProvider, type SpokenWord } from "../../scene";
import { PaperCanvas, type PaperCtx } from "../PaperCanvas";
import {
  P, FONT, type G, type Pt, w2s, drawDesk, sheet, pencilStroke, resample, leader, ringPath, handText, setType,
  dataDot, drawPencil, caption, cutout, halftone, stamp, columnTotal, camPath, breathe, roundRectPath, circlePath, rectPath, dashedCell,
} from "../engine";
import { clamp, lerp, seg, outCubic, outExpo } from "../lib";

const FPS = 30, DUR = 12;
const SHEET = { x0: -520, y0: -420, x1: 2400, y1: 1000 };

// ---- chart geometry (world px) ----
const AX = { x0: 180, y0: 480, x1: 1120, top: 20 };
const YEARS = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023];
const VALS = [60, 95, 80, 140, 190, 170, 280, 350];            // illustrative demo data
const PTS: Pt[] = VALS.map((v, i) => [270 + i * 116, AX.y0 - v * 1.1]);
const LINE = resample(PTS, 2);
const lineAt = (u: number): Pt => {
  const L = LINE.total * clamp(u); let j = 0; while (j < LINE.len.length - 1 && LINE.len[j] < L) j++; return LINE.pts[j];
};
const ptFrac = PTS.map((_, i) => {                              // fraction of the polyline length at each data point
  let L = 0; for (let k = 1; k <= i; k++) L += Math.hypot(PTS[k][0] - PTS[k - 1][0], PTS[k][1] - PTS[k - 1][1]);
  return L / LINE.total;
});
const T_LINE: [number, number] = [1.9, 4.4];
const T_RING = [4.6, 5.0], T_LEAD = [5.0, 5.3], T_NOTE = [5.3, 6.2];
const NOTE = { text: "up 6x in eight years", x: 880, y: 14, size: 38 };
const COL = { x: 1640, y: 120, items: [
  { label: "wages", value: "+$4,200" }, { label: "rent", value: "-$1,350" },
  { label: "food", value: "-$620" }, { label: "debt", value: "-$980" } ] };

const CAM = camPath([
  { t: 0, x: 520, y: 130, zoom: 1.75 },
  { t: 3.0, x: 560, y: 290, zoom: 0.7 },
  { t: 7.0, x: 700, y: 290, zoom: 0.74 },
  { t: 9.3, x: 1620, y: 300, zoom: 1.0 },
  { t: 12, x: 1640, y: 300, zoom: 1.0 },
]);

// ---- pencil waypoints (world): each phase gives the tip position; hops between phases lift the pencil ----
interface Phase { t0: number; t1: number; at: (u: number) => Pt }
const ringP = ringPath(PTS[7][0], PTS[7][1], 17, 2);
const along = (pts: Pt[], u: number): Pt => { const r = resample(pts, 4), L = r.total * clamp(u); let j = 0; while (j < r.len.length - 1 && r.len[j] < L) j++; return r.pts[j]; };
const PHASES: Phase[] = [
  { t0: 0.8, t1: 1.3, at: (u) => [AX.x0, lerp(AX.y0, AX.top, u)] },
  { t0: 1.3, t1: 1.8, at: (u) => [lerp(AX.x0, AX.x1, u), AX.y0] },
  { t0: T_LINE[0], t1: T_LINE[1], at: (u) => lineAt(u) },
  { t0: T_RING[0], t1: T_RING[1], at: (u) => along(ringP, u) },
  { t0: T_LEAD[0], t1: T_NOTE[1], at: (u) => [NOTE.x - 240 + u * 240, NOTE.y - 10] },
  { t0: 6.0, t1: 6.9, at: (u) => [1300 + 220 * u, 160] },                    // taps the cut-outs
  { t0: 7.4, t1: 9.0, at: (u) => [COL.x + 110 + u * 120, COL.y + u * 220] },
];
const phaseEnd = (p: Phase) => p.at(1);
function pen(t: number): { tip: Pt; lift: number; alpha: number } {
  let prev: Phase | null = null;
  for (const p of PHASES) {
    if (t < p.t0) {                                                   // hop from prev end to p start
      const a = prev ? phaseEnd(prev) : [AX.x0 - 160, AX.y0 + 40] as Pt, b = p.at(0), t0 = prev ? prev.t1 : 0, k = outExpo(seg(t, t0 + 0.05, p.t0 - 0.02));
      return { tip: [lerp(a[0], b[0], k), lerp(a[1], b[1], k)], lift: Math.sin(Math.PI * k) * 0.9 + (1 - k) * 0 , alpha: prev ? 1 : clamp(t / 0.4) };
    }
    if (t <= p.t1) return { tip: p.at(seg(t, p.t0, p.t1)), lift: 0, alpha: 1 };
    prev = p;
  }
  const k = seg(t, 9.0, 9.7);                                         // leaves the page when the viewer should just look
  const a = phaseEnd(prev!);
  return { tip: [a[0] + 260 * outCubic(k), a[1] - 140 * outCubic(k)], lift: k, alpha: 1 - seg(t, 9.3, 9.8) };
}

const SAY = "Eight years of earnings, one column of costs, and what is left at the end.".split(" ");

function draw(g: G, c: PaperCtx): void {
  const { t } = c;
  const cam = breathe(CAM(t), t, 0.012);
  drawDesk(g, cam);
  sheet(g, SHEET.x0, SHEET.y0, SHEET.x1, SHEET.y1, { marginInset: 70 });
  const z = cam.zoom;

  // headline (set type, no wobble) typeset on the sheet
  setType(g, "Where the money went", AX.x0, -150, { size: 64, font: FONT.type, weight: 600, color: P.ink, progress: seg(t, 0.1, 1.2) });
  setType(g, "Earnings per month, illustrative data", AX.x0, -100, { size: 24, font: FONT.mono, color: P.inkSoft, progress: seg(t, 0.8, 1.8) });

  // halftone area under the line (spot ink: green = money in), misregistered from its pencil outline
  const area: Pt[] = [[PTS[0][0], AX.y0], ...PTS, [PTS[7][0], AX.y0]];
  halftone(g, area, { color: P.green, cell: 9, coverage: 0.5, progress: seg(t, 4.2, 6.6), misreg: [2, 1.5] });

  // axes (pencil) + ticks
  pencilStroke(g, [[AX.x0, AX.y0], [AX.x0, AX.top]], { color: P.ink, width: 2.4, progress: seg(t, 0.8, 1.3), seed: 2 });
  pencilStroke(g, [[AX.x0, AX.y0], [AX.x1, AX.y0]], { color: P.ink, width: 2.4, progress: seg(t, 1.3, 1.8), seed: 3 });
  YEARS.forEach((y, i) => setType(g, String(y), PTS[i][0], AX.y0 + 34, { size: 19, align: "center", progress: seg(t, 1.6 + i * 0.08, 2.0 + i * 0.08) }));
  [0, 100, 200, 300].forEach((v, i) => {
    const yy = AX.y0 - v * 1.1;
    setType(g, v ? `$${v}` : "0", AX.x0 - 16, yy + 6, { size: 19, align: "right", progress: seg(t, 1.0 + i * 0.1, 1.5 + i * 0.1) });
    if (v) pencilStroke(g, [[AX.x0, yy], [AX.x1, yy]], { color: P.rule, width: 1.2, progress: seg(t, 1.2 + i * 0.1, 1.9 + i * 0.1), passes: 1, wobble: 0.2, alpha: 0.9 });
  });
  const dashT = seg(t, 5.4, 6.4);
  dashedCell(g, PTS[7][0] + 40, PTS[7][1] - 60, PTS[7][0] + 180, PTS[7][1] + 40, { progress: dashT, color: P.inkSoft });
  setType(g, "2024?", PTS[7][0] + 110, PTS[7][1] - 8, { size: 20, align: "center", color: P.inkSoft, progress: seg(t, 6.2, 6.8) });

  // series line (lead), dots landing as the pencil passes
  pencilStroke(g, PTS, { color: P.lead, width: 3.4, progress: seg(t, T_LINE[0], T_LINE[1]), seed: 4 });
  PTS.forEach((p, i) => {
    const landT = lerp(T_LINE[0], T_LINE[1], ptFrac[i]);
    dataDot(g, p[0], p[1], 7.5, i === 7 ? P.ochre : P.paper, { fresh: t - landT, ring: P.ink, ringW: 2 });
  });

  // handwritten note, leader, un-closed ring
  pencilStroke(g, ringP, { color: P.red, width: 2.2, progress: seg(t, T_RING[0], T_RING[1]), seed: 9 });
  const ringEnd = ringP[ringP.length - 1], a: Pt = [NOTE.x + 8, NOTE.y - 10];
  leader(g, a, [PTS[7][0] - 12, PTS[7][1] - 14], { color: P.red, progress: seg(t, T_LEAD[0], T_LEAD[1]), seed: 5 });
  handText(g, NOTE.text, NOTE.x, NOTE.y, { size: NOTE.size, color: P.red, align: "right", progress: seg(t, T_NOTE[0], T_NOTE[1]), zoom: z, weight: 700 });
  void ringEnd;

  // cut-outs: a banknote and a coin laid on the sheet
  const bn = roundRectPath(1290, 100, 1530, 230, 12);
  const o1 = cutout(g, bn, { fill: P.sage, progress: seg(t, 6.0, 6.7), seed: 3 });
  if (t > 6.2) {
    const k = seg(t, 6.4, 7.0);
    g.save(); g.globalAlpha = k; g.translate(0, o1.dy);
    g.strokeStyle = P.ink; g.lineWidth = 1.6; g.beginPath(); g.roundRect(1304, 114, 212, 102, 8); g.stroke();
    setType(g, "$", 1410, 192, { size: 84, font: FONT.type, weight: 600, color: P.ink, align: "center" });
    g.restore();
  }
  const o2 = cutout(g, circlePath(1230, 300, 58), { fill: P.straw, progress: seg(t, 6.5, 7.2), seed: 8 });
  if (t > 6.7) { g.save(); g.globalAlpha = seg(t, 6.7, 7.3); g.translate(0, o2.dy); setType(g, "1", 1230, 322, { size: 64, font: FONT.type, weight: 600, color: P.ink, align: "center" }); g.restore(); }
  const o3 = cutout(g, rectPath(1180, 400, 1420, 470), { fill: P.dusty, progress: seg(t, 7.0, 7.7), seed: 5, border: 3 });
  if (t > 7.2) { g.save(); g.globalAlpha = seg(t, 7.2, 7.8); g.translate(0, o3.dy); handText(g, "kept receipts", 1204, 447, { size: 34, color: P.ink, weight: 700, zoom: z }); g.restore(); }

  // ledger column on the right of the sheet
  setType(g, "MARCH", COL.x, COL.y - 62, { size: 20, track: 3, color: P.inkSoft, progress: seg(t, 7.2, 7.8) });
  pencilStroke(g, [[COL.x - 6, COL.y - 46], [COL.x + 466, COL.y - 46]], { color: P.ink, width: 1.8, progress: seg(t, 7.2, 7.6), passes: 1, wobble: 0.3 });
  columnTotal(g, COL.items, COL.x, COL.y, { progress: seg(t, 7.4, 9.0), total: "+$1,250", totalColor: P.green, totalLabel: "left over" });

  // verdict stamp slams at ~9 s
  stamp(g, "AUDITED", COL.x + 250, 520, { progress: seg(t, 9.0, 9.7), rot: -0.1, size: 76, color: P.red });

  // the pencil performer (screen space)
  const pn = pen(t), s = w2s(cam, pn.tip[0], pn.tip[1]);
  drawPencil(g, { tip: s, s: 0.4 + 0.3 * cam.zoom, lift: pn.lift, flip: seg(t, 4.3, 4.6) - seg(t, 9.0, 9.3), alpha: pn.alpha, ang: 0.62 });

  // figure caption: words on their spoken time
  const seen: Record<string, number> = {};
  const words = SAY.map((w) => { const k = w.toLowerCase().replace(/[^a-z]/g, ""); seen[k] = (seen[k] || 0) + 1; return { w, t: c.word(k, seen[k]).t0 }; });
  caption(g, words, t, { x: 270, y: 1000, size: 40, maxW: 1400, kicker: "FIG. 1", t0: 0.2, t1: 11.8 });
}

const Demo: React.FC = () => <PaperCanvas draw={draw} />;

const synth: SpokenWord[] = SAY.map((text, i) => {
  const startFrame = Math.round(0.6 * FPS + i * 0.62 * FPS);
  return { text, startFrame, endFrame: startFrame + 12 };
});

const PreviewRoot: React.FC = () => (
  <Composition
    id="PaperDemo"
    durationInFrames={DUR * FPS}
    fps={FPS}
    width={1920}
    height={1080}
    component={() => (
      <SceneProvider value={{ id: "paper-demo", fps: FPS, width: 1920, height: 1080, durationFrames: DUR * FPS, words: synth }}>
        <Demo />
      </SceneProvider>
    )}
  />
);

registerRoot(PreviewRoot);

