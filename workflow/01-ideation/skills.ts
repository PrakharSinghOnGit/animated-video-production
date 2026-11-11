/**
 * TypeScript wrappers for the two vendored youtube-agent-skill tools (Python 3, no dependencies):
 *   yt-package/title.py  lints a title + thumbnail-text pairing (length, mobile cut, caps, vague words, a number, repeats)
 *   yt-viral/swipe.py    ranks videos by views ÷ their channel's median, and names the title's hook formula
 * Used by ideas.ts and the dashboard (no side effects at import).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const HERE = import.meta.dir;
const TITLE_PY = path.join(HERE, "yt-package/title.py");
const SWIPE_PY = path.join(HERE, "yt-viral/swipe.py");

export interface TitleLint { title: string; chars: number; score: number; issues: [string, string][]; good: string[] }

function py(args: string[]): any {
  const r = Bun.spawnSync(["python3", ...args], { stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) throw new Error(`python3 ${path.basename(args[0])}: ${r.stderr.toString().trim().split("\n").pop() || `exit ${r.exitCode}`}`);
  return JSON.parse(r.stdout.toString());
}

/** Lint one title (with the words on its thumbnail, if any). */
export function lintTitle(title: string, thumbText?: string): TitleLint {
  const a = [TITLE_PY, "--title", title, "--json"];
  if (thumbText?.trim()) a.push("--thumb", thumbText.trim());
  return py(a)[0];
}

export interface SwipeRow { channel: string; title: string; views: number; url: string; duration?: number }
export interface SwipeHit { channel: string; title: string; views: number; median: number; multiple: number; formula: string; url: string }

/** Every row scored against its channel's median (channels with under 4 rows are skipped and listed). */
export function swipe(rows: SwipeRow[]): { outliers: SwipeHit[]; skipped_thin_channels: [string, number][] } {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "wg-swipe-")), "collected.json");
  fs.writeFileSync(f, JSON.stringify(rows));
  try { return py([SWIPE_PY, f, "--min", "0", "--json"]); }
  finally { fs.rmSync(path.dirname(f), { recursive: true, force: true }); }
}

/** The hook formulas (workflow/02-scripting/yt-script/hooks.json), names only, for prompts. */
export function formulaNames(): string[] {
  try { return JSON.parse(fs.readFileSync(path.join(HERE, "../02-scripting/yt-script/hooks.json"), "utf-8")).hooks.map((h: any) => h.name); } catch { return []; }
}
