import { describe, expect, test } from "bun:test";
import { parseScriptRaw } from "./format_sections";

const beat = (s: string) => `**VO:** \`[VO: calm]\` ${s}\n**[ON SCREEN]:** x\n`;

describe("format_sections: script parts", () => {
  test("parts are numbered by order, so a repeated header number can't overwrite a part", () => {
    const parts = parseScriptRaw(`### Part 1: Hook\n${beat("Hook line.")}\n### CHAPTER 1: Door One\n${beat("Chapter line.")}\n### CHAPTER 2: Next\n${beat("Next line.")}`);
    expect(parts.map((p) => p.partNum)).toEqual([1, 2, 3]);
    expect(parts[1].chapterTitle).toBe("Door One");
  });
  test("the usual numbering (hook 1, chapters from 2) is unchanged, and an empty header takes no number", () => {
    const parts = parseScriptRaw(`### Part 1: Hook\n${beat("a")}\n### CHAPTER 2: Empty\n\n### CHAPTER 3: Real\n${beat("b")}`);
    expect(parts.map((p) => [p.partNum, p.chapterTitle ?? null])).toEqual([[1, null], [2, "Real"]]);
  });
});
