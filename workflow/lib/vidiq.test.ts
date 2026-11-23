import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// never the real login: a fresh, empty auth file for these tests
process.env.WG_VIDIQ_AUTH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "vidiq-")), "auth.json");
const { parseToolResult, withVidiq, isLoggedIn } = await import("./vidiq");
const { guidanceArgs, guidanceText, vidiqGuidance } = await import("../02-scripting/vidiq_guidance");
const { scoreOf, suggestionsOf, thumbQuery } = await import("../07-publish/vidiq");

test("not connected: every call is a skip with a reason, never a throw", async () => {
  expect(isLoggedIn()).toBe(false);
  const r = await withVidiq(async () => 1);
  expect(r).toEqual({ ok: false, reason: expect.stringContaining("vidiq:login") });
  process.env.WG_NO_VIDIQ = "1";
  expect(await withVidiq(async () => 1)).toEqual({ ok: false, reason: expect.stringContaining("WG_NO_VIDIQ") });
  delete process.env.WG_NO_VIDIQ;
});

test("the writer gets no guidance section when vidIQ is not there", async () => {
  const f = path.join(os.tmpdir(), `g-${Date.now()}.md`);
  expect(await vidiqGuidance(f, { request: "idea", minutes: 9, task: "full_script" })).toBe("");
  expect(fs.existsSync(f)).toBe(false);
});

test("tool results: structured content wins, then JSON text, then plain text; errors throw", () => {
  expect(parseToolResult({ structuredContent: { a: 1 }, content: [{ type: "text", text: "{\"a\":2}" }] })).toEqual({ a: 1 });
  expect(parseToolResult({ content: [{ type: "text", text: "{\"a\":2}" }] })).toEqual({ a: 2 });
  expect(parseToolResult({ content: [{ type: "text", text: "hello" }] })).toEqual({ text: "hello" });
  expect(() => parseToolResult({ isError: true, content: [{ type: "text", text: "nope" }] })).toThrow("nope");
});

test("guidance: arguments and the known reply shape as markdown", () => {
  const a = guidanceArgs({ request: "x".repeat(25_000), minutes: 8.5, task: "rewrite" });
  expect((a.request as string).length).toBe(20_000);
  expect(a).toMatchObject({ task: "rewrite", durationSeconds: 510, durationKind: "approximate" });
  const md = guidanceText({ writingGuidance: "Open inside the subject.", creatorContext: { data: "{\"kind\":\"x\"}" }, voiceSamples: { videos: [{ title: "T", publishedAt: "2026-11-20T00:00:00Z", excerpt: "Marcus is 29." }] }, lengthBudget: { wordBudget: 1350, wordsPerMinute: 150 } });
  expect(md).toContain("## Writing advice\nOpen inside the subject.");
  expect(md).toContain("### T (2026-11-20)\nMarcus is 29.");
  expect(md).toContain("About 1350 words");
  expect(guidanceText({ other: 1 })).toContain("```json");   // a changed shape is kept, not lost
});

test("scores and suggestions are read whatever the reply calls them", () => {
  expect(scoreOf({ score: 88 })).toBe(88);
  expect(scoreOf({ overallScore: { overall: 70 } })).toBe(70);
  expect(scoreOf({})).toBeNull();
  expect(suggestionsOf({ titles: [{ title: "A", score: 96 }, "B"] })).toEqual([{ title: "A", score: 96 }, { title: "B", score: null }]);
  expect(suggestionsOf({ suggestions: [{ text: "C" }] })).toEqual([{ title: "C", score: null }]);
});

test("thumbnail brief: exact words, style references only when there are some", () => {
  const q = thumbQuery({ title: "Who Owns the Debt?", thumbnail: "a long table", thumbText: "NOT CHINA" }, 3);
  expect(q).toContain('"NOT CHINA" (spelled exactly)');
  expect(q).toContain("reference thumbnails");
  expect(thumbQuery({ title: "T" }, 0)).not.toContain("reference");
  expect(thumbQuery({ title: "T" }, 0)).toContain("No text on the image.");
});
