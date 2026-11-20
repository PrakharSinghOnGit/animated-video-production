/**
 * Final Cut Pro project (FCPXML 1.11) for a finished video: the silent picture on the primary storyline (one clip, or
 * one clip per act when `video.parts` is given: the act pieces from 05-video/chunks, so an act can be swapped or
 * trimmed on its own; each connected clip and marker then hangs on the act it starts in), and connected
 * below it the voice (role Dialogue), every SFX on its own clip (role Effects, subrole per type, the event's gain on the
 * clip's volume) and the music stem (role Music), plus a marker at every act. Lanes are packed so no clips overlap.
 * FCP 12.3 reads FCPXML up to 1.14; 1.11 also imports into DaVinci Resolve. Times are snapped to frames (n/fps s),
 * since FCP rejects connected clips off a frame boundary.
 */
import path from "node:path";

export interface FcpClip { file: string; t: number; dur: number; name: string; role: string; gainDb?: number; channels?: number }
export interface FcpProject {
  name: string; fps: number; width: number; height: number;
  video: { file: string; dur: number; parts?: { file: string; frames: number; name: string }[] };
  clips: FcpClip[];
  markers: { t: number; name: string }[];
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const url = (f: string) => "file://" + path.resolve(f).split("/").map(encodeURIComponent).join("/");

export function buildFcpxml(p: FcpProject): string {
  const fr = (s: number, up = false) => Math.max(0, up ? Math.ceil(s * p.fps - 1e-6) : Math.round(s * p.fps));
  const T = (frames: number) => `${frames}/${p.fps}s`;
  const parts = p.video.parts?.length ? p.video.parts : [{ file: p.video.file, frames: fr(p.video.dur, true), name: "Picture" }];
  const total = parts.reduce((n, x) => n + x.frames, 0);
  const starts = parts.map((_, i) => parts.slice(0, i).reduce((n, x) => n + x.frames, 0));
  const partAt = (f: number) => { let i = 0; while (i < parts.length - 1 && f >= starts[i + 1]) i++; return i; };

  // one asset per distinct file
  const assets = new Map<string, { id: string; dur: number; channels: number }>();
  const asset = (file: string, dur: number, channels = 1) => {
    const a = assets.get(file);
    if (a) { a.dur = Math.max(a.dur, dur); return a.id; }
    const id = `a${assets.size + 1}`;
    assets.set(file, { id, dur, channels });
    return id;
  };

  // lanes: dialogue -1, then effects packed into as few lanes as possible, then music
  const order = (r: string) => (r.startsWith("dialogue") ? 0 : r.startsWith("effects") ? 1 : 2);
  const clips = p.clips
    .map((c) => ({ ...c, f0: fr(c.t), f1: 0 }))
    .map((c) => ({ ...c, f1: Math.min(total, c.f0 + Math.max(1, fr(c.dur, true))) }))
    .filter((c) => c.f0 < total)
    .sort((a, b) => order(a.role) - order(b.role) || a.f0 - b.f0);
  const laneEnds: { group: number; end: number }[] = [];
  const placed = clips.map((c) => {
    const g = order(c.role);
    let li = laneEnds.findIndex((l) => l.group === g && l.end <= c.f0);
    if (li < 0) { laneEnds.push({ group: g, end: 0 }); li = laneEnds.length - 1; }
    laneEnds[li].end = c.f1;
    return { ...c, lane: -(li + 1), ref: asset(c.file, c.dur, c.channels) };
  });

  const res = [
    `    <format id="f1" frameDuration="1/${p.fps}s" width="${p.width}" height="${p.height}"/>`,
    ...parts.map((x, i) => [
      `    <asset id="v${i + 1}" name="${esc(path.basename(x.file))}" start="0s" duration="${T(x.frames)}" hasVideo="1" videoSources="1" format="f1">`,
      `      <media-rep kind="original-media" src="${esc(url(x.file))}"/>`,
      `    </asset>`,
    ].join("\n")),
    ...[...assets].map(([file, a]) => [
      `    <asset id="${a.id}" name="${esc(path.basename(file))}" start="0s" duration="${T(fr(a.dur, true))}" hasAudio="1" audioSources="1" audioChannels="${a.channels}" audioRate="48000">`,
      `      <media-rep kind="original-media" src="${esc(url(file))}"/>`,
      `    </asset>`,
    ].join("\n")),
  ];
  // DTD order inside a clip: connected clips first, then markers; times are local to the part (its media starts at 0)
  const inner = (pi: number) => [
    ...placed.filter((c) => partAt(c.f0) === pi).map((c) => {
      const vol = c.gainDb ? `\n              <adjust-volume amount="${c.gainDb.toFixed(1)}dB"/>\n            ` : "";
      return `            <asset-clip ref="${c.ref}" lane="${c.lane}" name="${esc(c.name)}" offset="${T(c.f0 - starts[pi])}" start="0s" duration="${T(c.f1 - c.f0)}" audioRole="${esc(c.role)}">${vol}</asset-clip>`;
    }),
    ...p.markers.filter((m) => fr(m.t) < total && partAt(fr(m.t)) === pi).map((m) => `            <marker start="${T(fr(m.t) - starts[pi])}" duration="1/${p.fps}s" value="${esc(m.name)}"/>`),
  ];
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!DOCTYPE fcpxml>`,
    `<fcpxml version="1.11">`,
    `  <resources>`,
    ...res,
    `  </resources>`,
    `  <library>`,
    `    <event name="${esc(p.name)}">`,
    `      <project name="${esc(p.name)}">`,
    `        <sequence format="f1" duration="${T(total)}" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k">`,
    `          <spine>`,
    ...parts.flatMap((x, i) => [
      `          <asset-clip ref="v${i + 1}" name="${esc(x.name)}" offset="${T(starts[i])}" start="0s" duration="${T(x.frames)}" format="f1" tcFormat="NDF">`,
      ...inner(i),
      `          </asset-clip>`,
    ]),
    `          </spine>`,
    `        </sequence>`,
    `      </project>`,
    `    </event>`,
    `  </library>`,
    `</fcpxml>`,
    ``,
  ].join("\n");
}
