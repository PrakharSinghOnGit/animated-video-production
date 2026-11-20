/**
 * Autopilot's next step, read from the files on disk: it must walk the steps in order, do each the way its mode says
 * (auto / review / me / off), stop where you decide, and never start a step whose inputs are not there.
 */
import { WS, put, reset } from "./env";
import { beforeEach, describe, expect, test } from "bun:test";
import { defaultModes, nextStep, readAutopilot, autopilotFile, type Mode } from "../autopilot";
import fs from "node:fs";

const SCRIPT = "**VO:** hello there";
const sha = (s: string) => new Bun.CryptoHasher("sha256").update(s).digest("hex");
const cfg = (modes: Record<string, Mode> = {}, more: { reviewedAt?: number; oks?: Record<string, number> } = {}) =>
  ({ modes: { ...defaultModes(), ...modes }, opts: {}, reviewedAt: more.reviewedAt ?? 0, oks: more.oks ?? {} });
const step = (modes: Record<string, Mode> = {}, more = {}) => nextStep(WS, cfg(modes, more)) as any;
beforeEach(reset);

/** A video at each stage, with file times in order (seconds). */
const approved = () => { put("02-scripting/idea.md", "idea", 100); put("02-scripting/script_raw.md", SCRIPT, 110); put("02-scripting/approved.json", JSON.stringify({ sha256: sha(SCRIPT) }), 111); };
const split = () => { approved(); put("03-voiceover/sections/index.ts", "x", 120); };
const voiced = () => { split(); put("03-voiceover/audio/voice.json", "{}", 130); };
const aligned = () => {
  voiced();
  for (const f of ["03-voiceover/audio/combined/full_voiceover.wav", "04-transcription/full_transcript.json", "06-audio/voiceover_master.wav", "05-video/captions.json"]) put(f, "x", 140);
};
const planned = () => { aligned(); put("05-video/acts.json", JSON.stringify({ acts: [{ id: "A01", slug: "open" }, { id: "A02", slug: "turn" }] }), 150); };
const drawn = () => { planned(); put("05-video/src/scenes/A01_open.tsx", "x", 160); put("05-video/src/scenes/A02_turn.tsx", "x", 160); };
const sounded = () => { drawn(); for (const f of ["05-video/events.json", "06-audio/music_plan.json", "06-audio/music.wav", "06-audio/mix.wav"]) put(f, "x", 170); put("05-video/timeline.json", "{}", 170); };
const drafted = () => { sounded(); put("05-video/draft.mp4", "x", 180); };
const finished = () => { drafted(); put("05-video/final.mp4", "x", 190); };

describe("autopilot next step", () => {
  test("no idea: waits for it; an idea: writes the script", () => {
    expect(step().wait).toBe("idea");
    put("02-scripting/idea.md", "idea", 100);
    expect(step().run).toBe("script.write");
  });
  test("research on: researches the idea before the script", () => {
    put("02-scripting/idea.md", "idea", 100);
    expect(step({ research: "auto" }).run).toBe("script.research");
    put("02-scripting/research.md", "facts", 105);
    expect(step({ research: "auto" }).run).toBe("script.write");
  });
  test("a script that is not approved: review waits for your approval, auto approves it", () => {
    put("02-scripting/idea.md", "idea", 100); put("02-scripting/script_raw.md", SCRIPT, 110);
    expect(step().wait).toBe("script");
    expect(step({ script: "auto" }).run).toBe("script.approve");
    put("02-scripting/approved.json", JSON.stringify({ sha256: sha("an older script") }), 111);
    expect(step().wait).toBe("script");
  });
  test("approved → split → voice → align → plan → acts → sound → draft, one step at a time", () => {
    approved(); expect(step().run).toBe("script.format");
    split(); expect(step().run).toBe("voice.run");
    voiced(); expect(step().run).toBe("align.all");
    aligned(); expect(step().run).toBe("plan.run");
    planned(); expect(step().run).toBe("acts.all");
    drawn(); expect(step().run).toBe("sound.all");
    sounded(); expect(step().run).toBe("render.draft");
  });
  test("an approved script changed after voicing: voices only the changed lines", () => {
    voiced();
    put("02-scripting/script_raw.md", SCRIPT, 200); put("02-scripting/approved.json", JSON.stringify({ sha256: sha(SCRIPT) }), 201);   // re-approved, newer than the sections
    expect(step().run).toBe("script.apply");
  });
  test("plan on review: waits for your plan approval; on auto goes on", () => {
    planned();
    expect(step({ plan: "review" }).wait).toBe("plan");
    expect(step().run).toBe("acts.all");
  });
  test("me: never starts the step, waits until you have done it, then goes on", () => {
    aligned();
    const w = step({ plan: "me" });
    expect(w.wait).toBe("plan");
    expect(w.run).toBeUndefined();
    planned();
    expect(step({ plan: "me" }).run).toBe("acts.all");
  });
  test("a step on review without an approval of its own: waits for Continue on this output, a newer output asks again", () => {
    sounded();
    put("05-video/draft.mp4", "x", 180);
    const w = step();
    expect(w.wait).toBe("draft"); expect(w.review).toBe(true);
    const ok = fs.statSync(`${process.env.WG_WS_ROOT}/${WS}/05-video/draft.mp4`).mtimeMs;
    expect(step({}, { oks: { draft: ok } }).run).toBe("render.final");
    put("05-video/draft.mp4", "x", 185);
    expect(step({}, { oks: { draft: ok } }).wait).toBe("draft");
  });
  test("off: the run ends before it, and steps that need it are skipped", () => {
    drawn();
    const d = step({ sound: "off", deliver: "auto" });
    expect(d.done).toContain("Downloads");   // needs the final render, which needs sound
  });
  test("an off step that is already done still counts for the steps after it", () => {
    drafted();
    expect(step({ draft: "off" }).run).toBe("render.final");
  });
  test("act review on: previews + the free review after the acts, once per drawing", () => {
    drawn();
    expect(step({ actReview: "auto", sound: "off" }).run).toBe("acts.reviewAll");
    expect(step({ actReview: "auto", sound: "off" }, { reviewedAt: Date.now() + 1000 }).done).toBeTruthy();
  });
  test("after the final: packages, then the downloads", () => {
    finished();
    const oks = { draft: fs.statSync(`${process.env.WG_WS_ROOT}/${WS}/05-video/draft.mp4`).mtimeMs };
    expect(step({}, { oks }).done).toBeTruthy();
    expect(step({ publish: "auto" }, { oks }).run).toBe("publish.all");
    expect(step({ deliver: "auto" }, { oks }).run).toBe("deliver.build");
    put("08-deliver/deliver.json", "{}", 200);
    expect(step({ deliver: "auto" }, { oks }).done).toBeTruthy();
  });
  test("short scripts on: writes them once the plan exists", () => {
    planned();
    expect(step({ acts: "off", shortScripts: "auto" }).run).toBe("shorts.write");
  });
  test("a plan older than the voice with acts drawn: waits for you instead of re-planning over them", () => {
    drawn();
    put("05-video/captions.json", "x", 300);
    expect(step().wait).toBe("plan-stale");
  });
  test("a state file from the first autopilot (until + planGate) is read as modes", () => {
    put("autopilot.json", JSON.stringify({ on: false, until: "review", planGate: true, opts: {}, history: [] }));
    const s = readAutopilot(WS)!;
    expect(s.modes.plan).toBe("review");
    expect(s.modes.actReview).toBe("auto");
    expect(s.modes.sound).toBe("off");
    expect(autopilotFile(WS)).toContain(WS);
  });
});
