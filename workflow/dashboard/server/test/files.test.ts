/** Serving workspace files: nothing outside the workspace, no dotfiles, ranges that media players need. */
import { ROOT, WS, put, reset, wsPath } from "./env";
import { beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { deliverInfo, safePath, serveFile, validSfxEdits } from "../files";

beforeAll(() => {
  reset();
  put("05-video/acts.json", "0123456789".repeat(10));
  put(".secret/key.txt", "no");
  put("05-video/node_modules/x/index.js", "no");
  fs.writeFileSync(path.join(ROOT, "outside.txt"), "outside the workspace");
  fs.symlinkSync(path.join(ROOT, "outside.txt"), wsPath("05-video/link.txt"));
  fs.symlinkSync(wsPath("05-video/acts.json"), wsPath("05-video/inside.json"));
});

describe("safePath", () => {
  test("a file inside the workspace resolves to its real path", () => expect(safePath(WS, "05-video/acts.json")).toBe(wsPath("05-video/acts.json")));
  test("a symlink that stays inside is followed", () => expect(safePath(WS, "05-video/inside.json")).toBe(wsPath("05-video/acts.json")));
  test.each([
    ["nothing", null], ["empty", ""], ["parent", "../outside.txt"], ["nested parent", "05-video/../../outside.txt"], ["absolute", "/etc/hosts"],
    ["backslash parent", "05-video\\..\\..\\outside.txt"], ["dot folder", ".secret/key.txt"], ["dot file", "05-video/.batch_stop"],
    ["node_modules", "05-video/node_modules/x/index.js"], ["NUL byte", "05-video/acts.json\0.png"], ["missing file", "05-video/nope.json"],
    ["symlink that leaves the workspace", "05-video/link.txt"],
  ])("refuses %s", (_name, rel) => expect(safePath(WS, rel as string | null)).toBeNull());
});

describe("serveFile", () => {
  const get = (range?: string) => serveFile(new Request("http://x/", range ? { headers: { range } } : {}), wsPath("05-video/acts.json"));

  test("the whole file, never as something a browser would run", async () => {
    const r = get();
    expect(r.status).toBe(200);
    expect(r.headers.get("content-length")).toBe("100");
    expect(r.headers.get("accept-ranges")).toBe("bytes");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("content-security-policy")).toBe("sandbox");
    expect((await r.text()).length).toBe(100);
  });

  test("html, svg and scripts are sent as plain text", () => {
    for (const name of ["a.html", "b.svg", "c.js"]) expect(serveFile(new Request("http://x/"), put(`out/${name}`, "<script>1</script>")).headers.get("content-type")).toBe("text/plain; charset=utf-8");
  });

  test("ranges: start-end, open end, last n bytes", async () => {
    const a = get("bytes=10-19");
    expect(a.status).toBe(206);
    expect(a.headers.get("content-range")).toBe("bytes 10-19/100");
    expect(await a.text()).toBe("0123456789");
    expect(get("bytes=90-").headers.get("content-range")).toBe("bytes 90-99/100");
    expect(get("bytes=-5").headers.get("content-range")).toBe("bytes 95-99/100");
    expect(get("bytes=50-999").headers.get("content-range")).toBe("bytes 50-99/100");
  });

  test("ranges that cannot be served answer 416 with the file's size", () => {
    for (const bad of ["bytes=100-", "bytes=20-10", "bytes=-", "bytes=a-b", "items=0-1"]) {
      const r = get(bad);
      expect(r.status, bad).toBe(416);
      expect(r.headers.get("content-range")).toBe("bytes */100");
    }
  });
});

describe("validSfxEdits", () => {
  test("a good edit list is cleaned: no duplicate keys, no 0 dB entries, one decimal", () => {
    expect(validSfxEdits({ off: ["A01@1.00:tick", "A01@1.00:tick"], gainDb: { "A02@3.50:boom": -3.14159, "A02@4.00:pop": 0 } }))
      .toEqual({ off: ["A01@1.00:tick"], gainDb: { "A02@3.50:boom": -3.1 }, keep: [] });
    expect(validSfxEdits({})).toEqual({ off: [], gainDb: {}, keep: [] });
    expect(validSfxEdits({ keep: ["A01@2.00:pop", "A01@2.00:pop"] })).toEqual({ off: [], gainDb: {}, keep: ["A01@2.00:pop"] });
  });
  test.each([
    ["an array", []], ["null", null], ["text", "off"], ["off that is not a list", { off: "A01" }], ["a key that is not text", { off: [1] }],
    ["a key with a line break", { off: ["a\nb"] }], ["gain as a list", { gainDb: [] }], ["gain above +6", { gainDb: { k: 7 } }],
    ["gain below −24", { gainDb: { k: -30 } }], ["gain that is not a number", { gainDb: { k: "3" } }], ["gain NaN", { gainDb: { k: NaN } }],
    ["keep that is not a list", { keep: "A01" }],
  ])("refuses %s", (_n, body) => expect(typeof validSfxEdits(body)).toBe("string"));
});

describe("deliverInfo", () => {
  test("no deliver.json: nothing built yet", () => expect(deliverInfo(wsPath())).toBeNull());
  test("items are checked against the disk; a path that leaves the folder is dropped", () => {
    put("08-deliver/video_full.mp4", "x".repeat(42));
    put("08-deliver/deliver.json", JSON.stringify({ builtAt: 123, items: [
      { key: "video_full", group: "video", label: "Full", file: "08-deliver/video_full.mp4" },
      { key: "audio_full", group: "audio", label: "Audio", file: "08-deliver/audio_full.wav" },
      { key: "evil", file: "../../outside.txt" }, { key: "abs", file: "/etc/hosts" }, { file: "08-deliver/video_full.mp4" }, null,
    ] }));
    expect(deliverInfo(wsPath())).toEqual({ builtAt: 123, items: [
      { key: "video_full", group: "video", label: "Full", file: "08-deliver/video_full.mp4", bytes: 42, present: true, note: undefined },
      { key: "audio_full", group: "audio", label: "Audio", file: "08-deliver/audio_full.wav", bytes: 0, present: false, note: undefined },
    ] });
  });
});
