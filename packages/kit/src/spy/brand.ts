/// <reference path="./assets.d.ts" />
// The channel's brand in the Briefing style: one end card, timed to the spoken "subscribe" line. Nowhere else in a video.
// Brand assets live in brand-assets/ at the repo root (Logo.png: off-white "W Gap" and three slanted bars on #101010).
import logoUrl from "../../../../brand-assets/Logo.png";
import { clamp, seg, outBack, outCubic, outExpo, lerp } from "../paper/lib";
import { W, H, piece, roughC, label, withBg, type G, type Pt } from "./engine";
import { SPY_FONT } from "./fonts";

/** Brand colours sampled from Logo.png. */
export const BRAND = { ground: "#101010", text: "#f2e9e4", green: "#60935d", orange: "#dc851f", red: "#bc4b51" } as const;
export const BRAND_TAGLINE = "Understanding the machine that creates it.";

let logo: HTMLImageElement | null = null, loading: Promise<void> | null = null;
/** Loads Logo.png once (SpyCanvas waits for it with the fonts). */
export function ensureBrand(): Promise<void> {
  if (loading) return loading;
  loading = new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => { logo = img; resolve(); };
    img.onerror = () => { console.warn("[spy] brand logo failed to load"); resolve(); };
    img.src = logoUrl;
  });
  return loading;
}

/**
 * Brand end card, drawn in screen space over the act (call it last in drawAct's overlay, or after drawAct).
 * `at` = act-relative second of the spoken word "subscribe" (ctx.word("subscribe").t0). Sequence (all complete on time):
 * at-1.2 a brand-black card slides in from the right over the scene (cut edge, paper shadow);
 * at-0.9 the three logo bars sweep in; at-0.7 the logo lands (paper drop + settle); at-0.4 the tagline slides in;
 * at the word, a red SUBSCRIBE tag stamps down. Holds to the end of the act. Foley: paper_slide at-1.2, card_slap at-0.7,
 * stamp_thud at `at`.
 */
export function brandEndCard(g: G, t: number, at: number, o: { tag?: string } = {}): void {
  const k = outExpo(seg(t, at - 1.2, at - 0.75));
  if (k <= 0) return;
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  // the card: a sheet of brand black sliding over the frame from the right, its leading edge scissor-cut and slanted
  const x0 = lerp(W + 160, -80, k);
  const card = roughC("brandCard", () => [[0, -40], [W + 400, -40], [W + 400, H + 40], [-110, H + 40]] as Pt[], 501, 2.4, 30).map(([x, y]) => [x + x0 + (y / H) * 110, y] as Pt);
  piece(g, card, BRAND.ground, { gap: 0, shA: 0.45, shB: 14, shX: -8, shY: 0 });
  if (k < 0.98) { g.restore(); return; }

  const cx = 600, cy = 470, size = 420;
  // three slanted bars sweeping in behind the logo, like the logo's own
  [BRAND.green, BRAND.orange, BRAND.red].forEach((c, i) => {
    const u = outCubic(seg(t, at - 0.95 + i * 0.07, at - 0.55 + i * 0.07));
    if (u <= 0) return;
    // continue the logo's own bars (Logo.png rows 175–232, 250–298, 318–375 of 800, scaled to `size`)
    const [r0, r1] = [[175, 232], [250, 298], [318, 375]][i].map((v) => (v / 800) * size - size / 2);
    const y = cy + r0, hh = r1 - r0, len = 1500 * u, x = cx + size / 2 - 4;
    piece(g, roughC(`brandBar${i}`, () => [[0, 0], [1500, 0], [1500, hh], [0, hh]] as Pt[], 510 + i, 0.8, 14).map(([px, py]) => [x + Math.min(px, len), y + py] as Pt), c, { gap: 0, shA: 0.3 });
  });
  // the logo: a cut card dropping onto the sheet, settling with a little rotation
  const d = seg(t, at - 0.7, at - 0.35);
  if (d > 0 && logo) {
    const s = lerp(1.25, 1, outBack(d, 2.2)), rot = (1 - outCubic(d)) * -0.08, a = clamp(d * 4);
    g.save(); g.translate(cx, cy); g.rotate(rot); g.scale(s, s);
    g.globalAlpha = a;
    g.shadowColor = "rgba(0,0,0,0.55)"; g.shadowBlur = 18 * s; g.shadowOffsetY = 10 * (s - 0.9) * 4;
    g.beginPath();
    roughC("brandLogo", () => [[-size / 2, -size / 2], [size / 2, -size / 2], [size / 2, size / 2], [-size / 2, size / 2]] as Pt[], 520, 1.6, 16).forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath(); g.fillStyle = BRAND.ground; g.fill();
    g.shadowColor = "transparent"; g.clip();
    g.drawImage(logo, -size / 2, -size / 2, size, size);
    g.restore();
  }
  // tagline
  const tl = outCubic(seg(t, at - 0.45, at - 0.05));
  if (tl > 0) {
    g.save(); g.globalAlpha = clamp(tl * 2);
    label(g, BRAND_TAGLINE, cx - size / 2 + (1 - tl) * -60, cy + size / 2 + 86, `600 46px "${SPY_FONT.sans}"`, BRAND.text, "left", 1);
    g.restore();
  }
  // SUBSCRIBE: a red cut tag stamped on the word
  const st = seg(t, at - 0.12, at + 0.08);
  if (st > 0) {
    const txt = (o.tag ?? "SUBSCRIBE").toUpperCase(), sc = lerp(1.6, 1, outCubic(st)), x = cx - size / 2, y = cy + size / 2 + 128;
    g.save(); g.translate(x, y); g.rotate(-0.05); g.scale(sc, sc); g.globalAlpha = clamp(st * 3);
    g.font = `700 64px "${SPY_FONT.sans}"`; (g as any).letterSpacing = "6px";
    const w = g.measureText(txt).width + 72;
    withBg(g, BRAND.ground, () => piece(g, roughC(`brandTag${Math.round(w)}`, () => [[0, 0], [w, -4], [w + 26, 50], [w, 104], [0, 100]] as Pt[], 530, 1.4, 12), BRAND.red, { shA: 0.4 }));
    label(g, txt, 38, 74, `700 64px "${SPY_FONT.sans}"`, BRAND.text, "left", 6);
    g.restore();
  }
  g.restore();
}
