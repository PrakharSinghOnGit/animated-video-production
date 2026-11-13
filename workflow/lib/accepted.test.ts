import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyAccepted, readAccepted, setAccepted } from "./accepted";

test("accepted errors stop blocking, undo brings them back, a changed text blocks again", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "acc-"));
  const c = { errors: ["numbers not in the long video's sourced plan: 759", "no title"], warnings: ["w"] };
  expect(applyAccepted(dir, "script", c)).toEqual({ ...c, accepted: [] });
  setAccepted(dir, "script", c.errors[0], true);
  const a = applyAccepted(dir, "script", c);
  expect(a.errors).toEqual(["no title"]);
  expect(a.accepted).toEqual([c.errors[0]]);
  expect(applyAccepted(dir, "script", a)).toEqual(a);                    // applying twice is stable
  expect(applyAccepted(dir, "meta", c).errors.length).toBe(2);            // scopes are separate
  expect(applyAccepted(dir, "script", { errors: ["numbers not in the long video's sourced plan: 760"], warnings: [] }).errors.length).toBe(1);
  setAccepted(dir, "script", c.errors[0], false);
  expect(applyAccepted(dir, "script", c).errors.length).toBe(2);
  expect(readAccepted(dir)).toEqual({});
  expect(() => setAccepted(dir, "../x", "e", true)).toThrow();
  expect(applyAccepted(dir, "script", null)).toBeNull();
});
