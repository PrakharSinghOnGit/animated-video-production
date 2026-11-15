/** The action allowlist: what the page may ask the server to run, and how client options become argv. */
import { ROOT, WS, put, reset } from "./env";
import { beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { ACTIONS, args, commandFor, locksFor, schema } from "../actions";

const REPO = path.resolve(import.meta.dir, "../../../..");
const scripts = Object.keys(JSON.parse(fs.readFileSync(path.join(REPO, "package.json"), "utf-8")).scripts);

beforeAll(() => {
  reset();
  put("05-video/acts.json", JSON.stringify({ acts: [{ id: "A01", slug: "open" }, { id: "A02", slug: "turn" }, { id: "A03", slug: "end" }] }));
  put("05-video/src/scenes/A01_open.tsx", "export {};");
});

describe("registry", () => {
  test("the test server reads its workspaces from the temp folder", () => expect(fs.existsSync(path.join(ROOT, WS, "05-video/acts.json"))).toBe(true));

  test("every command is `bun run <a script in package.json>`: nothing else can be started from the page", () => {
    let built = 0;
    for (const [key, a] of Object.entries(ACTIONS)) {
      let cmds: string[][] | string;
      try { cmds = a.build(WS, {}, a.variant ? "A" : a.perShort ? "S1" : "A01"); } catch (e) { cmds = String(e); }
      if (typeof cmds === "string") continue;   // a refusal ("save notes first"), not a command
      built++;
      for (const c of cmds) {
        expect(c.slice(0, 2), key).toEqual(["bun", "run"]);
        expect(scripts, `${key} runs "${c[2]}"`).toContain(c[2]);
        for (const part of c) expect(typeof part, key).toBe("string");
      }
    }
    expect(built).toBeGreaterThan(50);
  });

  test("chains name real actions, and conditional options name a real option", () => {
    for (const [key, a] of Object.entries(ACTIONS)) {
      for (const c of a.chain ?? []) if (c.action) expect(Object.keys(ACTIONS), `${key} chain`).toContain(c.action);
      for (const o of a.opts ?? []) {
        if (o.when) expect((a.opts ?? []).map((x) => x.key), `${key}.${o.key} when`).toContain(o.when.key);
        if (o.type !== "bool" || !o.map) expect(o.flag ?? o.map, `${key}.${o.key} has no flag or map`).toBeDefined();
      }
    }
  });

  test("option keys are unique within an action", () => {
    for (const [key, a] of Object.entries(ACTIONS)) { const ks = (a.opts ?? []).map((o) => o.key); expect(new Set(ks).size, key).toBe(ks.length); }
  });

  test("the schema sent to the page has no argv mapping in it", () => {
    const s = schema();
    expect(Object.keys(s)).toEqual(Object.keys(ACTIONS));
    for (const a of Object.values<any>(s)) for (const o of a.opts) { expect(o.flag).toBeUndefined(); expect(o.map).toBeUndefined(); }
    expect(s["plan.run"].opts.find((o: any) => o.key === "model")?.choices).toEqual(["default", "claude:opus", "claude:sonnet", "claude:haiku", "agy:flash"]);
  });
});

describe("args: client options → argv", () => {
  test("defaults fill what was not sent, a field emptied on purpose stays empty, unknown keys are ignored", () => {
    expect(args({}, "acts.frames")).toEqual(["--every", "4", "--words", "--scale", "0.5"]);
    expect(args({ every: "", words: false, scale: null, rm: "-rf /" }, "acts.frames")).toEqual(["--scale", "0.5"]);
  });

  test("numbers must be numbers inside their range", () => {
    expect(() => args({ every: "fast" }, "acts.frames")).toThrow("Every (s): not a number");
    expect(() => args({ every: 99 }, "acts.frames")).toThrow("Every (s): 0.5–10");
    expect(args({ every: "2.5" }, "acts.frames")).toContain("2.5");
  });

  test("a select only takes an offered value", () => {
    expect(args({ res: "2160", audio: "voice" }, "render.final")).toEqual(["--res", "2160", "--audio", "voice"]);
    expect(() => args({ res: "8k" }, "render.final")).toThrow('Resolution: "8k" is not offered any more');
    expect(() => args({ concurrency: "64" }, "render.final")).toThrow("Parallel render tabs");
  });

  test("a model picker: default adds nothing, an old bare name means Claude's, an unknown model is refused", () => {
    expect(args({ model: "default" }, "plan.check")).toEqual([]);
    expect(args({ model: "claude:opus", style: "briefing" }, "plan.run")).toEqual(["--model", "claude:opus", "--style", "briefing"]);
    expect(args({ model: "sonnet", style: "briefing" }, "plan.run")).toEqual(["--model", "claude:sonnet", "--style", "briefing"]);
    expect(() => args({ model: "gpt-nope" }, "plan.run")).toThrow("Director model");
  });

  test("text can never become a flag or a second line", () => {
    expect(() => args({ focus: "--dangerous" }, "script.research")).toThrow("Focus: invalid text");
    expect(() => args({ focus: "a\nb" }, "script.research")).toThrow("Focus: invalid text");
    expect(() => args({ focus: "x".repeat(301) }, "script.research")).toThrow("Focus: invalid text");
    expect(args({ focus: "  Nvidia capex  ", model: "default" }, "script.research")).toEqual(["--focus", "Nvidia capex", "--max", "8"]);
  });

  test("text with a fixed shape is checked against it", () => {
    expect(() => args({ at: "12.3;rm" }, "acts.frames")).toThrow("Extra times");
    expect(() => args({ section: "part 2" }, "voice.run")).toThrow("Section id");
    expect(() => args({ only: "video_full stem" }, "deliver.build")).toThrow("Items");
    expect(() => args({ models: "A01=claude:sonnet;A02" }, "acts.all")).toThrow("Per-act models");
    expect(args({ only: "video_full,stem_voice" }, "deliver.build")).toEqual(["--only", "video_full,stem_voice"]);
  });

  test("Finish N acts names exactly those acts and never redoes the drawn ones, whatever the saved Redo option", () => {
    // the Acts step sends { acts: todo, force: false } over the saved options when nothing is ticked
    const cmd = (o: Record<string, unknown>) => (commandFor(WS, "acts.all", o) as { cmds: string[][] }).cmds[0].join(" ");
    const saved: Record<string, unknown> = { force: true, acts: [], parallel: 2 };
    const finish = cmd({ ...saved, acts: ["A02", "A03"], force: false });
    expect(finish).toContain("--act A02,A03");
    expect(finish).not.toContain("--force");
    // the old call (empty list + a saved force) meant: every act, redone
    const old = cmd({ acts: [], force: true });
    expect(old).not.toContain("--act");
    expect(old).toContain("--force");
  });

  test("an option that depends on another is only passed while that one has the right value", () => {
    const gemini = args({ engine: "gemini", voice: "Kore", temperature: 0.8, force: false }, "voice.run");
    expect(gemini).toContain("--voice");
    expect(gemini).not.toContain("--temperature");
    const qwen = args({ engine: "qwen", voice: "Kore", temperature: 0.8, force: false }, "voice.run");
    expect(qwen).not.toContain("--voice");
    expect(qwen).toEqual(["--engine", "qwen", "--temperature", "0.8"]);
  });

  test("a multi-pick only takes offered values", () => {
    expect(args({ give: ["plan", "code"] }, "acts.review")).toContain("plan,code");
    expect(args({ give: [] }, "acts.review").slice(0, 2)).toEqual(["--give", "none"]);
    expect(() => args({ give: ["plan", "secrets"] }, "acts.review")).toThrow("Give it: secrets is not offered any more");
  });
});

describe("commandFor", () => {
  test("unknown actions, acts, variants and shorts are refused before anything is built", () => {
    expect(commandFor(WS, "rm.everything", {})).toBe("unknown action");
    expect(commandFor(WS, "acts.act", {}, "A99")).toBe("unknown act");
    expect(commandFor(WS, "acts.act", {}, "../A01")).toBe("unknown act");
    expect(commandFor(WS, "acts.act", {})).toBe("unknown act");
    expect(commandFor(WS, "publish.fix", {}, "D")).toBe("unknown variant");
    expect(commandFor(WS, "shorts.run", {}, "S1")).toBe("unknown short");
  });

  test("a bad option is an error message, not a throw", () => expect(commandFor(WS, "render.final", { res: "8k" })).toContain("is not offered any more"));

  test("one act's job is labelled, keyed and locked by its act", () => {
    const c = commandFor(WS, "acts.frames", { every: 2 }, "A02");
    expect(c).toEqual({ key: "frames:A02", label: "Render frames A02", locks: ["act:A02"], cmds: [["bun", "run", "frames", "--video", WS, "--scene", "A02", "--every", "2", "--words", "--scale", "0.5"]] });
  });

  test("a whole-video job locks the video; a chain keeps its order", () => {
    const c = commandFor(WS, "sound.all", {}) as { cmds: string[][]; locks: string[]; key: string };
    expect(c.locks).toEqual(["*"]);
    expect(c.key).toBe("sound");
    expect(c.cmds.map((x) => x[2])).toEqual(["cues", "audio:music", "audio:mix"]);
  });

  test("a refusal from the action itself comes back as its message", () => {
    expect(commandFor(WS, "acts.fix", {}, "A02")).toBe("save review notes first");
    expect(commandFor(WS, "render.seamcheck", {}, "A03")).toBe("this act has no next act");
    expect((commandFor(WS, "render.seamcheck", {}, "A02") as { cmds: string[][] }).cmds[0].slice(-2)).toEqual(["--only", "A02-A03"]);
  });
});

describe("locksFor: which jobs may run side by side", () => {
  test("the author batch locks the acts it will write: the picked ones, else the ones without a file", () => {
    expect(locksFor(WS, "acts.all", { acts: ["A02"] })).toEqual(["act:A02"]);
    expect(locksFor(WS, "acts.all", {})).toEqual(["act:A02", "act:A03"]);
    expect(locksFor(WS, "acts.all", { force: true })).toEqual(["act:A01", "act:A02", "act:A03"]);
  });
  test("the review batch locks the acts that have a file", () => expect(locksFor(WS, "acts.reviewAll", {})).toEqual(["act:A01"]));
  test("everything else takes the whole video", () => expect(locksFor(WS, "render.final", {})).toEqual(["*"]));
});
