import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const REPO_ROOT = path.resolve(import.meta.dir, "..", "..");

/** Same resolution order as workflow/03-voiceover/src/voice_profile.ts: WG_PYTHON, then repo .venv. */
export function findPython(): string {
  if (process.env.WG_PYTHON) return process.env.WG_PYTHON;
  const venv = path.join(REPO_ROOT, ".venv/bin/python");
  return fs.existsSync(venv) ? venv : "python3";
}

export function videoArg(tag: string): string {
  const a = process.argv.slice(2);
  const i = a.findIndex((x) => x === "--video" || x === "-v");
  if (i < 0 || !a[i + 1]) {
    console.error(`[${tag}] ERROR: missing --video <ID>`);
    process.exit(1);
  }
  return a[i + 1];
}

export function runPython(tag: string, script: string, args: string[]): void {
  const res = spawnSync(findPython(), [path.join(import.meta.dir, script), ...args], { stdio: "inherit", cwd: REPO_ROOT });
  if (res.status !== 0) {
    console.error(`[${tag}] ERROR: ${script} failed (exit ${res.status})`);
    process.exit(res.status ?? 1);
  }
}
