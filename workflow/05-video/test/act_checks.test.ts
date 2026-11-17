// act_checks.py on a synthetic act with known faults (act_checks_fixture.py), and the critic helpers in src/lib/critic.ts.
// The Python part needs the repo's .venv (numpy, scipy, Pillow); without it (CI) that test is skipped.
import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { applyCaps, checksText, gateFindings, verdictNotes, type Checks } from "../src/lib/critic";

const REPO = path.resolve(import.meta.dir, "../../..");
const PY = process.env.WG_PYTHON ?? path.join(REPO, ".venv/bin/python");
const hasPy = fs.existsSync(PY) && spawnSync(PY, ["-c", "import numpy, scipy, PIL"]).status === 0;

describe("act_checks.py", () => {
  test.skipIf(!hasPy)("finds the planted faults and nothing else", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wg-checks-"));
    const dense = path.join(dir, "dense");
    const gen = spawnSync(PY, [path.join(import.meta.dir, "act_checks_fixture.py"), dense], { encoding: "utf-8" });
    expect(gen.status).toBe(0);
    const run = spawnSync(PY, [path.join(REPO, "workflow/05-video/scripts/act_checks.py"), "--dense", dense, "--fps", "30", "--nth", "3", "--dur", "24",
      "--out", dir, "--measure", path.join(dense, "measure.json"), "--words", path.join(dense, "words.json"), "--act", "A01"], { encoding: "utf-8" });
    expect(run.status).toBe(0);
    const c: Checks = JSON.parse(fs.readFileSync(path.join(dir, "checks.json"), "utf-8"));
    const at = (kind: string, t: number, tol = 0.25) => c.findings.filter((f) => f.kind === kind && Math.abs(f.t - t) <= tol);
    const pops = c.findings.filter((f) => f.kind === "pop" && f.severity !== "low");
    expect(at("pop", 6.0).length).toBe(1);                              // pops in while the camera pans
    expect(at("pop", 14.0).length).toBe(1);                             // vanishes in one step
    expect(pops.filter((f) => f.t < 18.9).length).toBe(2);              // the slide-in and the drop are not pops
    expect(c.findings.some((f) => f.kind === "pop" && f.t >= 7.9 && f.t <= 9.0)).toBe(false);
    expect(at("blank", 11.0, 0.15).length).toBe(1);
    expect(c.findings.filter((f) => f.kind === "frozen").length).toBe(1);
    expect(at("text-clipped", 19.0, 0.15).length).toBe(1);
    expect(c.findings.some((f) => f.kind === "contrast" && f.severity === "high" && (f as any).text === "FAINT")).toBe(true);
    expect(c.findings.some((f) => f.kind === "contrast" && (f as any).text === "CLIPPED")).toBe(false);
    expect(c.findings.some((f) => f.kind === "late-hit")).toBe(false);
    expect(c.findings.some((f) => f.kind === "cut" || f.kind === "camera-jump")).toBe(false);
    // the motion grids: 24 s at 0.5 s = 48 tiles = 4 images of 12
    expect(c.grids?.length).toBe(4);
    expect(fs.existsSync(path.join(dir, "grid_04.jpg"))).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  }, 120_000);
});

describe("critic helpers", () => {
  const checks: Checks = {
    dur: 30,
    findings: [
      { id: 1, kind: "pop", severity: "high", t: 6, msg: "something appears" },
      { id: 2, kind: "blank", severity: "high", t: 11, t1: 12, msg: "blank frame" },
      { id: 3, kind: "late-hit", severity: "medium", t: 14, msg: "late" },
      { id: 4, kind: "pop", severity: "low", t: 20, msg: "small change" },
    ],
  };
  test("caps: a confirmed high finding caps at 5; a dimension at 2 caps at 6; pass needs 7", () => {
    const base = { scores: { staging: 4, motion: 4, camera: 4, sync: 4, legibility: 4, colour: 4, data: 5 }, score: 8, pass: true, issues: [] };
    expect(applyCaps(base, checks)).toMatchObject({ score: 8, pass: true });
    expect(applyCaps({ ...base, findings: [{ id: 1, verdict: "real" }] }, checks)).toMatchObject({ score: 5, pass: false });
    expect(applyCaps({ ...base, findings: [{ id: 1, verdict: "false" }] }, checks)).toMatchObject({ score: 8, pass: true });
    expect(applyCaps({ ...base, scores: { ...base.scores, sync: 2 } }, checks)).toMatchObject({ score: 6, pass: false });
    expect(applyCaps({ ...base, issues: [{ severity: "high", problem: "x" }] }, checks).pass).toBe(false);
  });
  test("notes keep confirmed findings, drop false ones", () => {
    const n = verdictNotes({ findings: [{ id: 1, verdict: "false" }, { id: 3, verdict: "real" }], issues: [{ time: "2s", dimension: "staging", problem: "small", fix: "bigger" }] }, checks);
    expect(n).toContain("small → bigger");
    expect(n).toContain("[measured late-hit]");
    expect(n).not.toContain("something appears");
  });
  test("prompt text and gate", () => {
    const t = checksText(checks);
    expect(t).toContain("#1 [high] pop 6s");
    expect(t).toContain("#2 [high] blank 11s–12s");
    expect(t).toContain("low (glance at them; usually fine): #4 pop 20s");
    expect(gateFindings(checks).map((f) => f.id)).toEqual([2]);   // only precise kinds gate
  });
});
