/**
 * Step status from disk, and parity with the act author: the dashboard (status.ts) and the pipeline
 * (05-video/src/lib/scenes.ts) each decide which scene file belongs to an act and whether its plan changed.
 * They must agree, or the page shows an act as current while "author the missing acts" redraws it (or the reverse).
 */
import { WS, put, reset, touch, wsPath } from "./env";
import { beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import { actStale, approvalState, derive, planApproval, planHash, sceneFiles, sceneStatus } from "../status";
import { actPlanHash, planChanged, recordPlanHash, sceneFileFor } from "../../../05-video/src/lib/scenes";

const plan = (a2 = "turn the chart") => JSON.stringify({ acts: [{ id: "A01", slug: "open", idea: "open on the bill" }, { id: "A02", slug: "turn", idea: a2 }] });
const OUT = () => wsPath("05-video");
beforeEach(reset);

describe("derive", () => {
  test("none → partial → done → stale as files appear and inputs change", () => {
    expect(derive(WS, ["in.txt"], ["a.txt", "b.txt"])).toBe("none");
    put("in.txt", "i", 100); put("a.txt", "a", 200);
    expect(derive(WS, ["in.txt"], ["a.txt", "b.txt"])).toBe("partial");
    put("b.txt", "b", 200);
    expect(derive(WS, ["in.txt"], ["a.txt", "b.txt"])).toBe("done");
    touch("in.txt", 300);
    expect(derive(WS, ["in.txt"], ["a.txt", "b.txt"])).toBe("stale");
  });
  test("an input up to a second newer is not stale (files written together)", () => {
    put("a.txt", "a", 200); put("in.txt", "i", 200.9);
    expect(derive(WS, ["in.txt"], ["a.txt"])).toBe("done");
  });
  test("an extra input time (the newest scene) counts like a file", () => {
    put("a.txt", "a", 200);
    expect(derive(WS, [], ["a.txt"], 500_000)).toBe("stale");
  });
});

describe("script approval", () => {
  test("no script, legacy, not approved, approved, changed", () => {
    expect(approvalState(WS)).toBe("no script");
    put("02-scripting/script_raw.md", "**VO:** hello");
    expect(approvalState(WS)).toBe("legacy");                 // an older video: a script but no draft and no approval file
    put("02-scripting/idea.md", "idea");
    expect(approvalState(WS)).toBe("not approved");
    put("02-scripting/approved.json", JSON.stringify({ sha256: new Bun.CryptoHasher("sha256").update("**VO:** hello").digest("hex") }));
    expect(approvalState(WS)).toBe("approved");
    put("02-scripting/script_raw.md", "**VO:** hello there");
    expect(approvalState(WS)).toBe("changed since approval");
  });
  test("a plan approval holds only while acts.json is the file that was approved", () => {
    expect(planApproval(WS)).toBeNull();
    put("05-video/acts.json", plan());
    put("05-video/plan_approved.json", JSON.stringify({ at: "2026-01-01", sha256: new Bun.CryptoHasher("sha256").update(plan()).digest("hex") }));
    expect(planApproval(WS)).toEqual({ at: "2026-01-01", valid: true });
    put("05-video/acts.json", plan("something else"));
    expect(planApproval(WS)?.valid).toBe(false);
  });
});

describe("parity with the act author (05-video/src/lib/scenes.ts)", () => {
  test("which file is an act's scene: the plan's <id>_<slug>.tsx wins over an older plan's file", () => {
    put("05-video/acts.json", plan());
    put("05-video/src/scenes/A01_aaa_old_idea.tsx", "");
    put("05-video/src/scenes/A01_open.tsx", "");
    put("05-video/src/scenes/A02_zzz.tsx", "");
    put("05-video/src/scenes/notes.md", "");
    const dash = sceneFiles(WS);
    expect(dash).toEqual({ A01: "05-video/src/scenes/A01_open.tsx", A02: "05-video/src/scenes/A02_zzz.tsx" });
    for (const [id, slug] of [["A01", "open"], ["A02", "turn"]]) expect(dash[id]).toBe(`05-video/src/scenes/${sceneFileFor(wsPath("05-video/src/scenes"), id, slug)}`);
  });

  test("both hash an act's plan entry the same way", () => {
    put("05-video/acts.json", plan());
    for (const id of ["A01", "A02", "A99"]) expect(planHash(WS, id)).toBe(actPlanHash(wsPath("05-video/acts.json"), id));
    expect(planHash(WS, "A01")).not.toBe(planHash(WS, "A02"));
  });

  /** both answers for one act; the author's is read first because the dashboard may record a missing hash */
  const both = (id: string, scene: string) => {
    const author = planChanged(OUT(), id, wsPath(scene));
    return { author, dashboard: actStale(WS, id, fs.statSync(wsPath(scene)).mtimeMs) };
  };
  const scenes = (t: number) => { put("05-video/src/scenes/A01_open.tsx", "", t); put("05-video/src/scenes/A02_turn.tsx", "", t); };

  test("a scene written after the plan is current", () => {
    put("05-video/acts.json", plan(), 100); scenes(200);
    expect(both("A01", "05-video/src/scenes/A01_open.tsx")).toEqual({ author: false, dashboard: false });
    // the dashboard recorded the hash; both still agree afterwards
    expect(both("A01", "05-video/src/scenes/A01_open.tsx")).toEqual({ author: false, dashboard: false });
  });

  test("a plan newer than the scene, with no recorded hash, is a changed plan", () => {
    scenes(200); put("05-video/acts.json", plan(), 300);
    expect(both("A01", "05-video/src/scenes/A01_open.tsx")).toEqual({ author: true, dashboard: true });
  });

  test("editing another act's plan entry does not make this act stale", () => {
    put("05-video/acts.json", plan(), 100); scenes(200);
    for (const id of ["A01", "A02"]) { recordPlanHash(OUT(), id); touch(`05-video/review/${id}/plan.hash`, 210); }
    put("05-video/acts.json", plan("a different idea for act two"), 300);
    expect(both("A01", "05-video/src/scenes/A01_open.tsx")).toEqual({ author: false, dashboard: false });
    expect(both("A02", "05-video/src/scenes/A02_turn.tsx")).toEqual({ author: true, dashboard: true });
    expect(sceneStatus(WS, "A01", "05-video/src/scenes/A01_open.tsx")).toBe("done");
    expect(sceneStatus(WS, "A02", "05-video/src/scenes/A02_turn.tsx")).toBe("stale");
  });

  test("a hash stamped after a plan change the scene predates is not trusted", () => {
    scenes(200); put("05-video/acts.json", plan(), 300);
    recordPlanHash(OUT(), "A01"); touch("05-video/review/A01/plan.hash", 310);
    expect(both("A01", "05-video/src/scenes/A01_open.tsx")).toEqual({ author: true, dashboard: true });
  });

  test("…unless it is marked kept: the plan only moved this act's times (replan, a pause)", () => {
    scenes(200); put("05-video/acts.json", plan(), 300);
    recordPlanHash(OUT(), "A01", true); touch("05-video/review/A01/plan.hash", 310);
    expect(both("A01", "05-video/src/scenes/A01_open.tsx")).toEqual({ author: false, dashboard: false });
  });

  test("an approved act stays done while its scene is the approved one", () => {
    scenes(200); put("05-video/acts.json", plan(), 300);
    const ms = fs.statSync(wsPath("05-video/src/scenes/A01_open.tsx")).mtimeMs;
    put("05-video/review/A01/approved.json", JSON.stringify({ at: "2026-01-01", sceneMtime: ms }));
    expect(sceneStatus(WS, "A01", "05-video/src/scenes/A01_open.tsx")).toBe("done");
    touch("05-video/src/scenes/A01_open.tsx", 250);
    expect(sceneStatus(WS, "A01", "05-video/src/scenes/A01_open.tsx")).toBe("stale");
    expect(sceneStatus(WS, "A01", undefined)).toBe("none");
  });
});
