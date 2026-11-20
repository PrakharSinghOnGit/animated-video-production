/**
 * Per-act renders (chunks.ts): which acts must render again after a change. A changed act re-renders itself; its
 * neighbour re-renders only once the seams run has re-probed the frame its transition shows; nothing else does.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { planChunks, probeKey, sharedKey, chunkDir } from "./chunks";

let out = "";
const scene = (id: string, from: number, to: number, seams?: any) => ({ id, windowStartFrame: from, windowEndFrame: to, durationFrames: to - from, words: [{ text: id, startFrame: from, endFrame: from + 5 }], ...(seams ? { seams } : {}) });
const timeline = () => ({
  fps: 30, width: 1920, height: 1080, durationFrames: 300, endHoldS: 5,
  scenes: [
    scene("A01", 0, 100, { out: { kind: "whip", img: "seams/A02_first.jpg" } }),
    scene("A02", 100, 200, { in: { kind: "whip", img: "seams/A01_last.jpg" } }),
    scene("A03", 200, 300, { in: { kind: "iris", img: "seams/A02_last.jpg" } }),
  ],
});
const write = (rel: string, text: string) => { const f = path.join(out, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
/** The seams run: probe frames + their keys in seams.json. */
const probe = (tl: any) => {
  for (const s of tl.scenes) for (const n of ["first", "last"]) write(`public/seams/${s.id}_${n}.jpg`, `${s.id}${n}${Math.random()}`);   // bytes differ every run, as on the GPU
  const shared = sharedKey(out);
  write("seams.json", JSON.stringify({ probeKeys: Object.fromEntries(tl.scenes.map((s: any) => [s.id, probeKey(out, s, shared)])) }));
};
/** Pretend every chunk of the plan was rendered (writes the key files). */
const rendered = (tl: any) => {
  for (const c of planChunks(out, tl, "1")) { write(path.relative(out, c.file), "mp4"); write(path.relative(out, c.file.replace(/\.mp4$/, ".json")), JSON.stringify({ key: c.key })); }
};
const stale = (tl: any) => planChunks(out, tl, "1").filter((c) => !c.fresh).map((c) => c.id);

beforeEach(() => {
  out = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "wg-chunks-"));
  for (const id of ["A01", "A02", "A03"]) write(`src/scenes/${id}_x.tsx`, `export const ${id} = 1;`);
  write("src/Main.tsx", "main"); write("src/Root.tsx", "root");
});

describe("per-act renders", () => {
  test("the pieces partition the video: back to back, the last one runs through the end hold", () => {
    const p = planChunks(out, timeline(), "1");
    expect(p.map((c) => [c.from, c.to])).toEqual([[0, 100], [100, 200], [200, 450]]);
    expect(p[0].file.startsWith(chunkDir(out, "1"))).toBe(true);
  });
  test("nothing changed: every act is reused, even after a re-probe with different bytes", () => {
    const tl = timeline(); probe(tl); rendered(tl);
    expect(stale(tl)).toEqual([]);
    probe(tl);
    expect(stale(tl)).toEqual([]);
  });
  test("a changed act renders again; its neighbours only once the seams run re-probed it", () => {
    const tl = timeline(); probe(tl); rendered(tl);
    write("src/scenes/A02_x.tsx", "export const A02 = 2;");
    expect(stale(tl)).toEqual(["A02"]);              // A01 and A03 still show the A02 frames they were rendered with
    probe(tl);
    expect(stale(tl)).toEqual(["A01", "A02", "A03"]); // the new A02 frames: A01's whip and A03's iris show them
  });
  test("a timing change in one act's words renders only that act (until it is re-probed)", () => {
    const tl = timeline(); probe(tl); rendered(tl);
    tl.scenes[2].words[0].endFrame += 3;
    expect(stale(tl)).toEqual(["A03"]);
  });
  test("other qualities have their own pieces", () => {
    const tl = timeline(); probe(tl); rendered(tl);
    expect(planChunks(out, tl, "0.5").every((c) => !c.fresh)).toBe(true);
  });
  test("the template changed: every act renders again", () => {
    const tl = timeline(); probe(tl); rendered(tl);
    write("src/Main.tsx", "main v2");
    expect(stale(tl)).toEqual(["A01", "A02", "A03"]);
  });
});
