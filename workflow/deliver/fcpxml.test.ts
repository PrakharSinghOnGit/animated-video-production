import { describe, expect, test } from "bun:test";
import { buildFcpxml, type FcpClip, type FcpProject } from "./fcpxml";

const project = (clips: FcpClip[], over: Partial<FcpProject> = {}): FcpProject => ({
  name: "Test", fps: 30, width: 1920, height: 1080, video: { file: "/tmp/v.mp4", dur: 10 }, clips, markers: [], ...over,
});
/** every connected clip as { name, lane, offset, duration } in frames */
const placed = (xml: string) => [...xml.matchAll(/<asset-clip ref="(a\d+)" lane="(-?\d+)" name="([^"]*)" offset="(\d+)\/30s" start="0s" duration="(\d+)\/30s" audioRole="([^"]*)"/g)]
  .map((m) => ({ ref: m[1], lane: Number(m[2]), name: m[3], offset: Number(m[4]), dur: Number(m[5]), role: m[6] }));

describe("buildFcpxml", () => {
  test("times are whole frames: starts round, lengths round up, nothing runs past the picture", () => {
    const xml = buildFcpxml(project([
      { file: "/a/voice.wav", t: 0, dur: 9.99, name: "Voice", role: "dialogue" },
      { file: "/a/tick.wav", t: 1.016, dur: 0.201, name: "tick", role: "effects.tick" },   // 30.48 f → 30, 6.03 f → 7
      { file: "/a/late.wav", t: 9.9, dur: 5, name: "late", role: "effects.boom" },         // cut at the picture's end
    ]));
    expect(xml).toContain('<sequence format="f1" duration="300/30s"');
    const c = placed(xml);
    expect(c.find((x) => x.name === "tick")).toMatchObject({ offset: 30, dur: 7 });
    expect(c.find((x) => x.name === "late")).toMatchObject({ offset: 297, dur: 3 });
    for (const x of c) expect(x.offset + x.dur).toBeLessThanOrEqual(300);
    expect(xml).not.toMatch(/="\d+\.\d+\/30s"/);   // FCP rejects times off a frame boundary
  });

  test("a clip that starts after the picture ends is dropped, with its marker", () => {
    const xml = buildFcpxml(project([{ file: "/a/x.wav", t: 12, dur: 1, name: "gone", role: "effects.x" }], { markers: [{ t: 1, name: "A01" }, { t: 11, name: "A99" }] }));
    expect(placed(xml)).toHaveLength(0);
    expect(xml).toContain('value="A01"');
    expect(xml).not.toContain("A99");
  });

  test("lanes: voice first, effects packed without overlap, music last", () => {
    const xml = buildFcpxml(project([
      { file: "/a/music.wav", t: 0, dur: 10, name: "Music", role: "music", channels: 2 },
      { file: "/a/s1.wav", t: 1, dur: 1, name: "s1", role: "effects.whoosh" },
      { file: "/a/s2.wav", t: 1.5, dur: 1, name: "s2", role: "effects.tick" },     // overlaps s1 → its own lane
      { file: "/a/s3.wav", t: 2, dur: 0.5, name: "s3", role: "effects.tick" },     // s1 is over → reuses s1's lane
      { file: "/a/voice.wav", t: 0, dur: 10, name: "Voice", role: "dialogue" },
    ]));
    const c = Object.fromEntries(placed(xml).map((x) => [x.name, x]));
    expect(c.Voice.lane).toBe(-1);
    expect(c.s1.lane).toBe(-2);
    expect(c.s2.lane).toBe(-3);
    expect(c.s3.lane).toBe(-2);
    expect(c.Music.lane).toBe(-4);
    // no two clips on one lane overlap
    const all = placed(xml);
    for (const a of all) for (const b of all) if (a !== b && a.lane === b.lane) expect(a.offset + a.dur <= b.offset || b.offset + b.dur <= a.offset).toBe(true);
  });

  test("one asset per file, long enough for its longest use", () => {
    const xml = buildFcpxml(project([
      { file: "/a/tick.wav", t: 1, dur: 0.2, name: "tick", role: "effects.tick" },
      { file: "/a/tick.wav", t: 3, dur: 0.5, name: "tick", role: "effects.tick" },
    ]));
    const assets = [...xml.matchAll(/<asset id="(a\d+)" name="tick\.wav" start="0s" duration="(\d+)\/30s"/g)];
    expect(assets).toHaveLength(1);
    expect(Number(assets[0][2])).toBe(15);
    expect(new Set(placed(xml).map((x) => x.ref))).toEqual(new Set(["a1"]));
  });

  test("gain goes on the clip only when it is not 0 dB; stereo is declared on the asset", () => {
    const xml = buildFcpxml(project([
      { file: "/a/q.wav", t: 1, dur: 1, name: "quiet", role: "effects.q", gainDb: -6.02 },
      { file: "/a/n.wav", t: 3, dur: 1, name: "plain", role: "effects.n", gainDb: 0, channels: 2 },
    ]));
    expect(xml).toContain('<adjust-volume amount="-6.0dB"/>');
    expect(xml.match(/adjust-volume/g)).toHaveLength(1);
    expect(xml).toMatch(/name="n\.wav"[^>]*audioChannels="2"/);
    expect(xml).toMatch(/name="q\.wav"[^>]*audioChannels="1"/);
  });

  test("names are escaped and file paths are file:// URLs", () => {
    const xml = buildFcpxml(project([{ file: "/a b/R&D <1>.wav", t: 0, dur: 1, name: 'A01 "pop" & <bang>', role: "effects.pop" }], { name: "Stocks & <Bonds>" }));
    expect(xml).toContain('name="A01 &quot;pop&quot; &amp; &lt;bang&gt;"');
    expect(xml).toContain('<event name="Stocks &amp; &lt;Bonds&gt;">');
    expect(xml).toContain('src="file:///a%20b/R%26D%20%3C1%3E.wav"');
    expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;)/);
  });

  test("the document is well formed: connected clips come before markers inside the picture clip", () => {
    const xml = buildFcpxml(project([{ file: "/a/voice.wav", t: 0, dur: 10, name: "Voice", role: "dialogue" }], { markers: [{ t: 0, name: "A01 open" }, { t: 4.5, name: "A02" }] }));
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE fcpxml>\n<fcpxml version="1.11">')).toBe(true);
    expect(xml.indexOf("<asset-clip ref=\"a1\"")).toBeLessThan(xml.indexOf("<marker"));
    expect(xml).toContain('<marker start="135/30s" duration="1/30s" value="A02"/>');
    const open = (xml.match(/<(?!\/|\?|!)[^>]*[^/]>/g) ?? []).length, close = (xml.match(/<\/[^>]+>/g) ?? []).length;
    expect(open).toBe(close);
  });
});
