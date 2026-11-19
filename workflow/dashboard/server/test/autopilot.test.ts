/**
 * Autopilot's next step, read from the files on disk: it must walk idea → script → [approval] → voice → align → plan →
 * acts → (review) in order, stop where you decide, and never start a step whose inputs are not there.
 */
import { WS, put, reset } from "./env";
import { beforeEach, describe, expect, test } from "bun:test";
import { nextStep } from "../autopilot";

const SCRIPT = "**VO:** hello there";
const sha = (s: string) => new Bun.CryptoHasher("sha256").update(s).digest("hex");
const cfg: { until: "acts" | "review"; planGate: boolean; reviewedAt: number } = { until: "acts", planGate: false, reviewedAt: 0 };
const step = (c = cfg) => nextStep(WS, c) as any;
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

describe("autopilot next step", () => {
  test("no idea: waits for it; an idea: writes the script", () => {
    expect(step().wait).toBe("idea");
    put("02-scripting/idea.md", "idea", 100);
    expect(step().run).toBe("script.write");
  });
  test("a script that is not approved (or changed since): waits for you", () => {
    put("02-scripting/idea.md", "idea", 100); put("02-scripting/script_raw.md", SCRIPT, 110);
    expect(step().wait).toBe("script");
    put("02-scripting/approved.json", JSON.stringify({ sha256: sha("an older script") }), 111);
    expect(step().wait).toBe("script");
  });
  test("approved → split → voice → align → plan → acts, one step at a time", () => {
    approved(); expect(step().run).toBe("script.format");
    split(); expect(step().run).toBe("voice.run");
    voiced(); expect(step().run).toBe("align.all");
    aligned(); expect(step().run).toBe("plan.run");
    planned(); expect(step().run).toBe("acts.all");
  });
  test("an approved script changed after voicing: voices only the changed lines", () => {
    voiced();
    put("02-scripting/script_raw.md", SCRIPT, 200); put("02-scripting/approved.json", JSON.stringify({ sha256: sha(SCRIPT) }), 201);   // re-approved, newer than the sections
    expect(step().run).toBe("script.apply");
  });
  test("plan gate: waits for your plan approval only when asked", () => {
    planned();
    expect(step({ ...cfg, planGate: true }).wait).toBe("plan");
    expect(step().run).toBe("acts.all");
  });
  test("every act drawn: done, or the free review first when asked", () => {
    planned();
    put("05-video/src/scenes/A01_open.tsx", "x", 160); put("05-video/src/scenes/A02_turn.tsx", "x", 160);
    expect(step().done).toBeTruthy();
    expect(step({ ...cfg, until: "review" }).run).toBe("acts.reviewAll");
    expect(step({ ...cfg, until: "review", reviewedAt: Date.now() + 1000 }).done).toBeTruthy();
  });
  test("a plan older than the voice with acts drawn: stops instead of re-planning over them", () => {
    planned();
    put("05-video/src/scenes/A01_open.tsx", "x", 160);
    put("05-video/captions.json", "x", 300);
    expect(step().stop).toBeTruthy();
  });
});
