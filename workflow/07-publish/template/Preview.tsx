/**
 * Preview sheets for the thumbnails: how the 3 packages look where viewers meet them.
 * Preview       every variant large (1280 px) with a duration badge, at 320 px and at 168 px, then a mock YouTube
 *               home-feed card (thumbnail, duration badge, title, channel) per package in the light and the dark theme.
 * PreviewSmall  the same at small sizes only, compact enough for a vision critic to see the 168 px versions.
 * Synced from workflow/07-publish/template/ by thumbs.ts; do not edit the copy in a workspace.
 */
import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { loadFont } from "@remotion/google-fonts/Roboto";

loadFont("normal", { weights: ["400", "500", "700"], subsets: ["latin"] });

export interface PreviewProps {
  /** A/B/C -> file name in the public dir (thumbnails/) and the paired title */
  packages: { id: string; file: string; title: string; type: string }[];
  /** m:ss, as in YouTube's duration badge */
  duration: string;
  channel: string;
}
export const PREVIEW_W = 1920;
const FONT = 'Roboto, "Helvetica Neue", Arial, sans-serif';
const THEME = {
  light: { bg: "#ffffff", fg: "#0f0f0f", sub: "#606060", page: "#f9f9f9" },
  dark: { bg: "#0f0f0f", fg: "#f1f1f1", sub: "#aaaaaa", page: "#0f0f0f" },
};

/** The duration badge YouTube draws over the corner, sized for a thumbnail `w` px wide (about 12 px type at 360 px). */
const Badge: React.FC<{ w: number; text: string }> = ({ w, text }) => (
  <div style={{ position: "absolute", right: w * 0.022, bottom: w * 0.022, background: "rgba(0,0,0,0.8)", color: "#fff", borderRadius: Math.max(2, w * 0.011), padding: `${w * 0.004}px ${w * 0.014}px`, fontSize: Math.max(9, w * 0.034), fontWeight: 500, fontFamily: FONT, lineHeight: 1.4 }}>{text}</div>
);

const Thumb: React.FC<{ file: string; w: number; badge?: string; radius?: number }> = ({ file, w, badge, radius }) => (
  <div style={{ position: "relative", width: w, height: (w * 9) / 16, borderRadius: radius ?? Math.min(12, w * 0.033), overflow: "hidden", flexShrink: 0, background: "#888" }}>
    <Img src={staticFile(file)} style={{ width: w, height: (w * 9) / 16, display: "block" }} />
    {badge && <Badge w={w} text={badge} />}
  </div>
);

/** A home-feed card: what a viewer sees before clicking. */
const Card: React.FC<{ p: PreviewProps["packages"][number]; theme: "light" | "dark"; w: number; duration: string; channel: string }> = ({ p, theme, w, duration, channel }) => {
  const t = THEME[theme];
  return (
    <div style={{ width: w, fontFamily: FONT, color: t.fg }}>
      <Thumb file={p.file} w={w} badge={duration} />
      <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 18, background: "#101010", color: "#f2e9e4", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>WG</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 500, lineHeight: "22px", maxHeight: 44, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{p.title || "(no title yet)"}</div>
          <div style={{ fontSize: 14, color: t.sub, marginTop: 4, lineHeight: "20px" }}>{channel}</div>
          <div style={{ fontSize: 14, color: t.sub, lineHeight: "20px" }}>12K views • 2 days ago</div>
        </div>
      </div>
    </div>
  );
};

const H: React.FC<{ children: React.ReactNode; dark?: boolean }> = ({ children, dark }) => (
  <div style={{ fontFamily: FONT, fontSize: 28, fontWeight: 700, color: dark ? "#f1f1f1" : "#0f0f0f", margin: "0 0 14px" }}>{children}</div>
);
const Label: React.FC<{ children: React.ReactNode; dark?: boolean }> = ({ children, dark }) => (
  <div style={{ fontFamily: FONT, fontSize: 18, color: dark ? "#aaa" : "#606060", margin: "6px 0 4px" }}>{children}</div>
);

const LARGE = 1280, ROW = 770;
export const PREVIEW_H = 40 + 3 * ROW + 90 + 3 * 360 + 60;

export const Preview: React.FC<PreviewProps> = ({ packages, duration, channel }) => (
  <AbsoluteFill style={{ background: "#e9e9e9", padding: 40, fontFamily: FONT }}>
    {packages.map((p) => (
      <div key={p.id} style={{ display: "flex", gap: 40, height: ROW, alignItems: "flex-start" }}>
        <div>
          <Label>{p.id} · large, with the duration badge</Label>
          <Thumb file={p.file} w={LARGE} badge={duration} radius={0} />
        </div>
        <div>
          <Label>{p.id} · 320 px</Label>
          <Thumb file={p.file} w={320} />
          <Label>{p.id} · 168 px, light page</Label>
          <div style={{ background: "#fff", padding: 12, width: 168 + 24 }}><Thumb file={p.file} w={168} badge={duration} /></div>
          <Label>{p.id} · 168 px, dark page</Label>
          <div style={{ background: "#0f0f0f", padding: 12, width: 168 + 24 }}><Thumb file={p.file} w={168} badge={duration} /></div>
        </div>
      </div>
    ))}
    <div style={{ height: 90, paddingTop: 20 }}><H>Home feed: each package with its title, light and dark theme</H></div>
    {packages.map((p) => (
      <div key={p.id} style={{ display: "flex", height: 360 }}>
        {(["light", "dark"] as const).map((th) => (
          <div key={th} style={{ width: 920, background: THEME[th].page, padding: 24, boxSizing: "border-box" }}>
            <div style={{ fontFamily: FONT, fontSize: 16, color: THEME[th].sub, marginBottom: 8 }}>{p.id} · {p.type} · {th}</div>
            <Card p={p} theme={th} w={360} duration={duration} channel={channel} />
          </div>
        ))}
      </div>
    ))}
  </AbsoluteFill>
);

export const PREVIEW_SMALL = { w: 1600, h: 800 };
/** Small sizes only: 320 px, 168 px light and dark, and the feed card, per package side by side. */
export const PreviewSmall: React.FC<PreviewProps> = ({ packages, duration, channel }) => (
  <AbsoluteFill style={{ background: "#e9e9e9", padding: 24, flexDirection: "row", gap: 24, fontFamily: FONT }}>
    {packages.map((p) => (
      <div key={p.id} style={{ width: 504 }}>
        <Label>{p.id} · 320 px</Label>
        <Thumb file={p.file} w={320} badge={duration} />
        <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
          <div><Label>168 px light</Label><div style={{ background: "#fff", padding: 10 }}><Thumb file={p.file} w={168} badge={duration} /></div></div>
          <div><Label>168 px dark</Label><div style={{ background: "#0f0f0f", padding: 10 }}><Thumb file={p.file} w={168} badge={duration} /></div></div>
        </div>
        <div style={{ background: "#fff", padding: 12, marginTop: 12, width: 360 + 24 }}><Card p={p} theme="light" w={360} duration={duration} channel={channel} /></div>
      </div>
    ))}
  </AbsoluteFill>
);
