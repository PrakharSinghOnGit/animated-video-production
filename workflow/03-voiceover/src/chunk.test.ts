import { test, expect } from "bun:test";
import { chunkText, splitSentences } from "./chunk";

test("keeps abbreviations inside a sentence", () => {
  expect(splitSentences("Use ratios, e.g. P/E. Then compare.")).toEqual(["Use ratios, e.g. P/E.", "Then compare."]);
});

test("groups sentences up to the limit and never splits mid-word", () => {
  const text = Array.from({ length: 12 }, (_, i) => `This is sentence number ${i} about money.`).join(" ");
  const chunks = chunkText(text, 100);
  expect(chunks.every((c) => c.length <= 100)).toBe(true);
  expect(chunks.join(" ")).toBe(text);
});

test("splits a long sentence near the middle at a comma", () => {
  const s = "Banks lend out money they do not have, and that simple trick is how nearly every dollar in the economy gets created from thin air.";
  const chunks = chunkText(s, 100);
  expect(chunks.length).toBe(2);
  expect(chunks[0].endsWith(",")).toBe(true);
});
