import { test, expect } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { atomicWrite, helpFor, parseEnv, removeEnv, serializeEnv, setEnv } from "./envfile";

const example = fs.readFileSync(path.join(import.meta.dir, "../../.env.example"), "utf-8");

test("round trip keeps every byte", () => {
  expect(serializeEnv(parseEnv(example))).toBe(example);
});

test("edit in place keeps comments and order; add appends before the final newline", () => {
  const lines = parseEnv(example);
  const keys = lines.filter((l) => l.key).map((l) => l.key!);
  expect(keys.length).toBeGreaterThan(3);
  const first = keys[0];
  let n = setEnv(lines, first, "changed value");
  n = setEnv(n, "WRITER_MODEL", "sonnet");
  const out = serializeEnv(n);
  expect(out).toContain(`${first}="changed value"`);
  expect(out.endsWith("WRITER_MODEL=sonnet\n")).toBe(true);
  expect(parseEnv(out).filter((l) => l.key).map((l) => l.key)).toEqual([...keys, "WRITER_MODEL"]);
  // untouched lines are byte-identical
  const a = out.split("\n").filter((l) => !l.startsWith(`${first}=`) && !l.startsWith("WRITER_MODEL="));
  const b = example.split("\n").filter((l) => !l.startsWith(`${first}=`));
  expect(a).toEqual(b);
  expect(parseEnv(out).find((l) => l.key === first)?.value).toBe("changed value");
});

test("remove, newline rejection, bad keys, help text, atomic write", () => {
  const lines = parseEnv(example);
  const k = lines.find((l) => l.key)!.key!;
  expect(removeEnv(lines, k).some((l) => l.key === k)).toBe(false);
  expect(() => setEnv(lines, k, "a\nb")).toThrow();
  expect(() => setEnv(lines, "1BAD", "x")).toThrow();
  const i = lines.findIndex((l) => l.key === "SARVAM_API_KEY");
  if (i >= 0) expect(helpFor(lines, i)).toContain("Sarvam");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wgenv-"));
  const f = path.join(dir, ".env");
  atomicWrite(f, serializeEnv(setEnv(lines, "WRITER_MODEL", "opus")));
  expect(fs.readFileSync(f, "utf-8")).toContain("WRITER_MODEL=opus");
  expect(fs.readdirSync(dir)).toEqual([".env"]);
  fs.rmSync(dir, { recursive: true });
});
