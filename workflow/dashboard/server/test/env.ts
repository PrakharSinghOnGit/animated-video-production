/**
 * Test setup for the dashboard server: import this FIRST in a test file. It points the server at a temp folder of
 * workspaces (WG_WS_ROOT), a temp .env (WG_ENV_FILE) and a fixed model catalogue (WG_MODELS_CACHE), so the tests
 * never read the real workspace/, the real .env or the CLIs installed on this machine.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const ROOT = process.env.WG_WS_ROOT ?? fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "wg-dash-"));
process.env.WG_WS_ROOT = ROOT;
process.env.WG_ENV_FILE ??= path.join(ROOT, ".env.test");
if (!process.env.WG_MODELS_CACHE) {
  process.env.WG_MODELS_CACHE = path.join(ROOT, ".models_cache.json");
  const list = (ids: string[]) => ({ ok: true, models: ids.map((id) => ({ id, label: id })) });
  const none = { ok: false, error: "not installed", models: [] };
  // `at` far in the future: the 10 minute cache never expires during a run
  fs.writeFileSync(process.env.WG_MODELS_CACHE, JSON.stringify({ at: Date.now() + 86_400_000, catalog: { claude: list(["opus", "sonnet", "haiku"]), "claude-iit": none, codex: none, opencode: none, ollama: none, agy: list(["flash"]) } }));
}

export const WS = "VID90_Test";
export const wsPath = (...rel: string[]) => path.join(ROOT, WS, ...rel);

/** Write a file inside the test workspace (folders are made), optionally with a fixed mtime in seconds. */
export function put(rel: string, text: string, mtimeS?: number): string {
  const f = wsPath(rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
  if (mtimeS !== undefined) fs.utimesSync(f, mtimeS, mtimeS);
  return f;
}
export const touch = (rel: string, mtimeS: number) => fs.utimesSync(wsPath(rel), mtimeS, mtimeS);
/** Start from an empty test workspace. */
export function reset() {
  fs.rmSync(path.join(ROOT, WS), { recursive: true, force: true });
  fs.mkdirSync(path.join(ROOT, WS), { recursive: true });
}
