import React from "react";
import { Composition, registerRoot } from "remotion";
import { SceneProvider, type SpokenWord } from "../../scene";
import { SpyCanvas, type SpyCtx } from "../SpyCanvas";
import {
  INKS, W, H, clear, paperFinish, piece, withBg, roughC, rectP, applyCam, frameRect, clamp, seg, lerp, outBack, outCubic, vnoise,
  type G, type Pt, type Cam, type Rect,
} from "../engine";
import { layout, drawLine, landEach, lineRect } from "../glyph";
import { figureSide, POSE, walkPose, runPose, onTwos, walkStride } from "../chars";
import { focusCam, whip, pushIn, spotlight, rectToScreen, type Focus } from "../camera";
import { drawAct, irisWipe, stripWipe, pixelWipe, fillScreen, chapterCard, chapterPill, ACT_OUT } from "../transitions";
import { autoSubtitle } from "../subtitle";
import { brandEndCard } from "../brand";
import { drawTitle } from "../title";
import { logo } from "../logo";

const FPS = 30, DUR = 20;
const IN = INKS.noir, IN2 = INKS.teal;
const GROUND = IN.hot;                                   // scene 1 ground: signal red, like the reference frame
const FL = 880;                                          // floor line (world y)

// ---- the three actions the camera follows (world rects) ----
const NUM_RECT: Rect = [100, 330, 1250, 800];
const WALK_RECT: Rect = [1400, 360, 2700, 920];
const BARS_RECT: Rect = [2800, 330, 3640, 920];
const FOCUS: Focus[] = [
  { t0: 0.8, t1: 2.4, rect: NUM_RECT },                  // the number lands letter by letter
  { t0: 5.0, t1: 8.6, rect: WALK_RECT },                 // the figure walks
  { t0: 11.2, t1: 12.6, rect: BARS_RECT },               // three bars are assembled
];
const T_WHIP = [13.4, 14.0], T_PUSH = [14.0, 15.6], T_IRIS = [16.0, 16.9], T_CARD = 16.0;
const camNum = frameRect(NUM_RECT, 0.8);
const numBox = (): Rect => lineRect(layout("$9.6T", 520), 150, 780);   // needs the font, so only inside draw

function camAt(t: number): Cam {
  if (t < T_WHIP[0]) return focusCam(t, FOCUS);
  const last = focusCam(T_WHIP[0], FOCUS);
  if (t < T_WHIP[1]) return whip(last, camNum, seg(t, T_WHIP[0], T_WHIP[1]));
  return pushIn(camNum, NUM_RECT, seg(t, T_PUSH[0], T_PUSH[1]), 0.5);
}

const poly = (key: string, fn: () => Pt[], seed: number, amp = 2, step = 14) => roughC(key, fn, seed, amp, step);

function drawWorld(g: G, t: number, cam: Cam): void {
  clear(g, GROUND);
  applyCam(g, cam);
  // distant hills (shadow-red paper) and telegraph poles with wires
  piece(g, poly("hills", () => { const o: Pt[] = [[-600, 900]]; for (let x = -600; x <= 4400; x += 120) o.push([x, 690 - 110 * vnoise(x / 330 + 4)]); o.push([4400, 900]); return o; }, 5, 3, 20), IN.hotD, { gap: 0, shadow: false });
  for (let i = 0; i < 5; i++) {
    const x = 300 + i * 900;
    piece(g, poly(`pole${i}`, () => rectP(x - 8, 380, 16, 520), 10 + i, 1.2, 12), IN.hotD, { gap: 0, shadow: false });
    piece(g, poly(`arm${i}`, () => rectP(x - 60, 400, 120, 12), 20 + i, 1, 10), IN.hotD, { gap: 0, shadow: false });
    if (i < 4) piece(g, poly(`wire${i}`, () => { const a: Pt[] = [], b: Pt[] = []; for (let k = 0; k <= 12; k++) { const u = k / 12, wx = x + u * 900, wy = 404 + 46 * Math.sin(Math.PI * u); a.push([wx, wy]); b.unshift([wx, wy + 4]); } return a.concat(b); }, 30 + i, 0.4, 30), IN.paper, { gap: 0, shadow: false });
  }
  // floor: black slab with a paper rail and dashes
  piece(g, poly("floor", () => rectP(-700, FL, 5200, 900), 3, 2.4, 20), IN.ink, { gap: 0 });
  piece(g, poly("rail", () => rectP(-700, FL - 12, 5200, 9), 4, 1, 20), IN.paper, { gap: 0, shadow: false });
  for (let i = 0; i < 28; i++) piece(g, poly(`dash${i}`, () => rectP(-600 + i * 190, FL + 28, 90, 9), 40 + i, 0.8, 12), IN.hot, { gap: 0, shadow: false });

  // 1. the number, cut from League Gothic, landing letter by letter
  const num = layout("$9.6T", 520);
  drawLine(g, num, 150, 780, { col: IN.ink, seed: 4, jit: 1, each: landEach(t, 0.9, { stagger: 0.12, dur: 0.3, rise: 520 }) });

  // 2. a silhouette walks along the floor
  const u = clamp((onTwos(t) - 5.0) / 3.6), x = lerp(1550, 2450, u), s = 0.62;
  const walking = u > 0 && u < 1;
  figureSide(g, x, FL + 6, s, walking ? walkPose((x - 1550) / walkStride(s)) : POSE.stand, { col: IN.ink, accent: IN.warm, paper: IN.paper });

  // 3. three bars assembled from cut paper (illustrative heights)
  const bars: [number, string, string][] = [[210, IN.paper, "A"], [330, IN.warm, "B"], [480, IN.ink, "C"]];
  bars.forEach(([h, col], i) => {
    const k = outBack(seg(t, 11.2 + i * 0.35, 11.2 + i * 0.35 + 0.5), 1.1);
    if (k <= 0) return;
    piece(g, poly(`bar${i}`, () => rectP(2900 + i * 220, FL - 14 - h, 170, h), 50 + i, 1.8, 14).map(([px, py]) => [px, FL - 14 - (FL - 14 - py) * k] as Pt), col);
  });
}

function draw(g: G, c: SpyCtx): void {
  const t = c.t;
  const cam = camAt(t);
  const card = (h: G) => chapterCard(h, 2, "The long walk", (t - T_CARD) / 3.4, IN2);
  const scene = (h: G) => {
    const iu = seg(t, T_IRIS[0], T_IRIS[1]);
    irisWipe(h, iu, (a) => drawWorld(a, t, cam), card, { ring: IN.warm });
    // spotlight freeze on the number (before the iris takes over)
    const sp = seg(t, 14.6, 15.2) * (1 - seg(t, 15.8, 16.0));
    if (sp > 0) spotlight(h, rectToScreen(cam, numBox()), sp, IN.ink);
  };
  drawAct(g, c, { dur: c.duration, ground: GROUND, cam: camAt, from: GROUND, to: IN2.ink, overlay: (h) => {
    chapterPill(h, 1, "The debt", seg(t, 1.0, 1.5) * (1 - seg(t, T_IRIS[0], T_IRIS[0] + 0.3)), IN);
    autoSubtitle(h, c, { ground: t < 16.45 ? GROUND : IN2.ink, inks: t < 16.45 ? IN : IN2 });
  } }, scene);
  void W; void H; void ACT_OUT; void outCubic; void drawTitle;
}

// ---- fake narration so the subtitle strip has words ----
const SENT = [
  { t: 1.0, text: "Americans now owe nine point six trillion dollars." },
  { t: 5.2, text: "She walks to the bank with one hat, one coat and one question." },
  { t: 10.6, text: "The bars you are about to see are all the same debt." },
  { t: 14.2, text: "Remember this number." },
];
const synth: SpokenWord[] = SENT.flatMap((s) => s.text.split(" ").map((text, i) => {
  const startFrame = Math.round((s.t + i * 0.4) * FPS);
  return { text, startFrame, endFrame: startFrame + 10 };
}));

// ---- second preview: strip / pixel wipes and the cut title (split, shatter) on the cobalt set ----
function drawWipes(g: G, c: SpyCtx): void {
  const t = c.t, C = INKS.cobalt, P2 = INKS.plum;
  const a = fillScreen(C.paper), b = (h: G) => { clear(h, C.hot); drawTitle(h, "THE WEALTH GAP", 960, 300, 300, { col: C.paper, align: "center" }); };
  const d = (h: G) => { clear(h, P2.paper); drawTitle(h, "DEBT\nCLOCK", 960, 170, 300, { col: P2.ink, align: "center", split: seg(t, 8.5, 10) * 220, shatter: seg(t, 10.5, 12) }); };
  const scene = (h: G) => {
    if (t < 3) stripWipe(h, seg(t, 0.4, 2.6), a, b);
    else if (t < 6) pixelWipe(h, seg(t, 3.4, 5.4), b, d);
    else d(h);
  };
  scene(g);
  chapterPill(g, 2, "Wipes", seg(t, 0.2, 0.7), C);
  paperFinish(g);
}
const Wipes: React.FC = () => <SpyCanvas draw={drawWipes} />;

const Demo: React.FC = () => <SpyCanvas draw={draw} />;

// ---- third preview: the brand end card on the "subscribe" line (word at 2.4 s) ----
function drawEnd(g: G, c: SpyCtx): void {
  const t = c.t, K = INKS.noir;
  clear(g, K.paper);
  drawTitle(g, "BORING WINS", 960, 300, 260, { col: K.ink, align: "center" });
  brandEndCard(g, t, 2.4);
  paperFinish(g);
}
const EndCard: React.FC = () => <SpyCanvas draw={drawEnd} />;

/** The Agent's character sheet (brand-assets/mascot/agent_sheet.png): close-up, poses, the four ink sets, hero vs extra. */
function drawAgent(g: G, c: SpyCtx) {
  const K = INKS.noir;
  clear(g, K.paper);
  const lab = (t: string, x: number, y: number) => { g.save(); g.font = '600 22px "League Spartan"'; g.fillStyle = K.ink; g.textAlign = "center"; g.fillText(t, x, y); g.restore(); };
  g.save(); g.font = '700 28px "League Spartan"'; g.fillStyle = K.ink; g.fillText("THE AGENT — CHARACTER SHEET (BRIEFING)", 80, 70); g.restore();
  figureSide(g, 260, 900, 1.25, POSE.stand, { col: K.ink, accent: K.hot, paper: K.paper, hero: true, eye: "open" });
  lab("CLOSE-UP: HATBAND CUTS + COIN CLIP", 260, 1000);
  const poses: [string, any][] = [["STAND", POSE.stand], ["WALK", walkPose(0.25)], ["RUN", runPose(0.3)], ["REACH", POSE.reach], ["LEAP", POSE.leap], ["OVER SHOULDER", POSE.overShoulder]];
  poses.forEach(([n, p], i) => { const x = 700 + i * 205; figureSide(g, x, 470, 0.5, p, { col: K.ink, accent: K.hot, paper: K.paper, hero: true }); lab(n, x + 20, 510); });
  const sets: [string, any][] = [["NOIR", INKS.noir], ["TEAL", INKS.teal], ["COBALT", INKS.cobalt], ["PLUM", INKS.plum]];
  sets.forEach(([n, k], i) => {
    const x = 640 + i * 260;
    piece(g, rectP(x - 100, 580, 220, 380), k.hot, { gap: 0 });
    figureSide(g, x + 10, 920, 0.6, POSE.stand, { col: k.ink, accent: k.warm, paper: k.paper, warm: k.warm, hero: true });
    lab(n, x + 10, 1000);
  });
  figureSide(g, 1790, 920, 0.6, POSE.stand, { col: K.ink, accent: K.hot, paper: K.paper });
  lab("EXTRA (NO SIGNATURE)", 1790, 1000);
  paperFinish(g);
}
const AgentSheet: React.FC = () => <SpyCanvas draw={drawAgent} />;

// Logos and icons as cut paper (spy.logo): brand logos (Simple Icons) and generic icons (MDI, "mdi:" names).
function drawLogos(g: G) {
  const K = INKS.noir;
  clear(g, K.paper);
  const lab = (t: string, x: number, y: number, col = K.ink) => { g.save(); g.font = '600 22px "League Spartan"'; g.fillStyle = col; g.textAlign = "center"; g.fillText(t, x, y); g.restore(); };
  g.save(); g.font = '700 28px "League Spartan"'; g.fillStyle = K.ink; g.fillText("LOGOS + ICONS — spy.logo (BRIEFING)", 80, 70); g.restore();
  const brands = ["tesla", "visa", "hdfcbank", "zerodha", "bitcoin", "apple", "nvidia", "paypal"];
  brands.forEach((n, i) => { const x = 170 + i * 225; logo(g, n, x, 230, 150, K.ink); lab(n.toUpperCase(), x, 360); });
  piece(g, roughC("logoBand", () => rectP(0, 420, 1920, 300), 7, 2.4, 20), K.hot, { gap: 0 });
  withBg(g, K.hot, () => brands.slice(0, 6).forEach((n, i) => { const x = 220 + i * 300; logo(g, n, x, 570, 190, i % 2 ? K.warm : K.paper); }));
  const icons = ["mdi:bank", "mdi:piggy-bank", "mdi:home-city", "mdi:cash-multiple", "mdi:chart-line", "mdi:factory", "mdi:credit-card", "mdi:gold"];
  icons.forEach((n, i) => { const x = 170 + i * 225; logo(g, n, x, 880, 150, i === 0 ? K.hot : K.ink, { fit: "box" }); lab(n, x, 1010); });
  paperFinish(g);
}
const LogoSheet: React.FC = () => <SpyCanvas draw={drawLogos} />;

const PreviewRoot: React.FC = () => (
  <>
  <Composition id="LogoSheet" durationInFrames={1} fps={FPS} width={1920} height={1080} component={LogoSheet} />
  <Composition id="AgentSheet" durationInFrames={1} fps={FPS} width={1920} height={1080} component={AgentSheet} />
  <Composition id="SpyEndCard" durationInFrames={5 * FPS} fps={FPS} width={1920} height={1080} component={EndCard} />
  <Composition id="SpyWipes" durationInFrames={13 * FPS} fps={FPS} width={1920} height={1080} component={Wipes} />
  <Composition
    id="SpyDemo"
    durationInFrames={DUR * FPS}
    fps={FPS}
    width={1920}
    height={1080}
    component={() => (
      <SceneProvider value={{ id: "spy-demo", fps: FPS, width: 1920, height: 1080, durationFrames: DUR * FPS, words: synth }}>
        <Demo />
      </SceneProvider>
    )}
  />
  </>
);

registerRoot(PreviewRoot);
