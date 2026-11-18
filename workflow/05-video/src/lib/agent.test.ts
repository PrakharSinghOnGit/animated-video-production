import { expect, test } from "bun:test";
import { notStarted } from "./agent";

test("a CLI that is not on PATH is named, not reported as an empty reply", () => {
  expect(notStarted("claude", -2, "", "")).toContain("not found on PATH");
  expect(notStarted("claude", 0, "", "")).toBe("");
  expect(notStarted("claude", 1, "", "boom")).toBe("");
  expect(notStarted("claude", null, "", "")).toBe("");
});
