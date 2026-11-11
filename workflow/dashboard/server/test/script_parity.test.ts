/**
 * Three places count a script's spoken words: the dashboard (details.ts), the shorts writer (08-shorts/lib.ts, where
 * the count gates a short's length) and the script reader (02-scripting/script_lib.ts, where it gives the minutes).
 * On a script in the writer's format they must agree, or the page shows one length and the checks enforce another.
 */
import "./env";
import { expect, test } from "bun:test";
import { spokenWords as dashboardWords } from "../details";
import { spokenText, spokenWords as shortsWords } from "../../../08-shorts/lib";
import { parseScript } from "../../../02-scripting/script_lib";

const SCRIPT = [
  "### Part 1: Hook",
  "**VO:** `[VO: calm, close]` You earn more than your parents did. So why does it feel like less?",
  "**[ON SCREEN]:** a pay slip, the number growing",
  "",
  "### Chapter 1: The gap",
  "**VO:** `[VO: matter of fact]` In 1990 the median home cost 3.1 times the median income.",
  "**[ON SCREEN]:** 3.1x → 5.6x",
  "**VO:** `[VO: slower]` Today it is 5.6.",
  "Some writer's note that is not spoken.",
].join("\n");

test("the three word counters agree on a script in the writer's format", () => {
  const parsed = parseScript(SCRIPT);
  expect(dashboardWords(SCRIPT)).toBe(29);
  expect(shortsWords(SCRIPT)).toBe(29);
  expect(parsed.words).toBe(29);
});

test("they read the same words: tone notes, on-screen hints and notes are not spoken", () => {
  const parsed = parseScript(SCRIPT);
  expect(spokenText(SCRIPT)).toBe(parsed.spoken);
  expect(parsed.spoken).not.toContain("VO:");
  expect(parsed.spoken).not.toContain("pay slip");
  expect(parsed.spoken).not.toContain("writer's note");
  expect(parsed.beats.map((b) => b.tone)).toEqual(["calm, close", "matter of fact", "slower"]);
  expect(parsed.beats[1].onScreen).toBe("3.1x → 5.6x");
});
