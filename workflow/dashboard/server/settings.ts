/** Settings: the prompt and style files the page may edit, the .env view (secrets masked) and Claude's plan limits. */
import fs from "node:fs";
import path from "node:path";
import { helpFor, parseEnv } from "../envfile";
import { ENV_FILE, LIMITS_FILE, REPO, exists, ls, readJson } from "./core";

// ───────────────────────────── settings + limits ─────────────────────────────

/** Files the Settings page may edit: exactly these globs, nothing else. */
export const SETTINGS_FILE = /^(workflow\/prompts\/[\w.-]+\.md|workflow\/styles\/[\w-]+\/(STYLE|ACT)\.md|workflow\/02-scripting\/voice\.md)$/;
export function settingsFiles(): string[] {
  const out: string[] = [];
  for (const f of ls(path.join(REPO, "workflow/prompts"), /\.md$/)) out.push(`workflow/prompts/${f}`);
  for (const d of ls(path.join(REPO, "workflow/styles"))) for (const f of ["STYLE.md", "ACT.md"]) if (exists(path.join(REPO, "workflow/styles", d, f))) out.push(`workflow/styles/${d}/${f}`);
  if (exists(path.join(REPO, "workflow/02-scripting/voice.md"))) out.push("workflow/02-scripting/voice.md");
  return out.filter((f) => SETTINGS_FILE.test(f));
}
export function settingsPath(rel: string | null): string | null {
  if (!rel || !SETTINGS_FILE.test(rel)) return null;
  const abs = path.join(REPO, rel);
  try { if (!fs.realpathSync(abs).startsWith(fs.realpathSync(REPO) + path.sep)) return null; } catch { return null; }
  return abs;
}

export const SECRET = /KEY|TOKEN|SECRET|PASS|API/i;
export function readEnvLines() { return parseEnv(exists(ENV_FILE) ? fs.readFileSync(ENV_FILE, "utf-8") : ""); }
export function envView() {
  const lines = readEnvLines();
  const have = new Set<string>();
  const entries = lines.flatMap((l, i) => {
    if (!l.key) return [];
    have.add(l.key);
    const secret = SECRET.test(l.key);
    return [{ key: l.key, secret, set: (l.value ?? "") !== "", value: secret ? null : l.value ?? "", help: helpFor(lines, i) }];
  });
  // keys the example file documents (active or commented out) that this file does not set yet
  const exFile = path.join(REPO, ".env.example");
  const suggested = exists(exFile)
    ? [...new Set([...fs.readFileSync(exFile, "utf-8").matchAll(/^\s*#?\s*([A-Z][A-Z0-9_]{2,})=/gm)].map((m) => m[1]))].filter((k) => !have.has(k))
    : [];
  return { entries, suggested };
}

/** Claude Code's status-line JSON (written by ~/.claude/wealthgap/statusline.sh): plan limits as % used + reset time. */
export function limits() {
  let st: fs.Stats;
  try { st = fs.statSync(LIMITS_FILE); } catch { return { five_hour: null, seven_day: null, updatedAt: null }; }
  const rl = readJson<any>(LIMITS_FILE)?.rate_limits ?? {};
  const pick = (x: any) => (x && typeof x.used_percentage === "number" ? { used_percentage: x.used_percentage, resets_at: typeof x.resets_at === "number" ? x.resets_at : null } : null);
  return { five_hour: pick(rl.five_hour), seven_day: pick(rl.seven_day), updatedAt: st.mtimeMs };
}
