/**
 * Projects without a name: a project can start as VID07_Untitled (or SH03_Untitled) and is renamed once its content
 * says what it is about (the idea, the script or the plan): VID07_Untitled → VID07_Sticky_Prices. The number never
 * changes. Used by scripts/rename_video.ts (CLI) and the dashboard (which renames automatically when a job of an
 * untitled project finishes). No side effects at import.
 *
 * A rename moves the folder and rewrites the old id in the project's text files (logs, plans, package.json, run
 * records) and in the shared stores that point at projects (workspace/_ideas, workspace/_analytics). Media and
 * node_modules are not touched. Run `bun install` afterwards (bun.lock lists every workspace's 05-video).
 */
import fs from "node:fs";
import path from "node:path";

export const REPO = path.resolve(import.meta.dir, "../..");
const WS_ROOT = path.join(REPO, "workspace");
export const UNTITLED = /^(VID|SH)(\d+)_Untitled$/;
export const isUntitled = (ws: string) => UNTITLED.test(ws);

/** The next free id of a kind, untitled: VID07_Untitled. */
export function nextUntitled(kind: "VID" | "SH"): string {
  const ids = fs.existsSync(WS_ROOT) ? fs.readdirSync(WS_ROOT) : [];
  const n = Math.max(0, ...ids.map((w) => Number(w.match(new RegExp(`^${kind}(\\d+)_`))?.[1] ?? 0))) + 1;
  return `${kind}${String(n).padStart(2, "0")}_Untitled`;
}

const read = (f: string) => { try { return fs.readFileSync(f, "utf-8"); } catch { return ""; } };
/** script_raw.md as new_video.ts writes it, before any script exists */
const PLACEHOLDER_SCRIPT = /^\*\(Write 02-scripting\/idea\.md, then run/m;
/** the headings and "(...)" instructions new_video.ts puts in a shorts brief, and the title it gives an untitled one */
const TEMPLATE_LINE = /^\s*(#+\s*(untitled|what happened|facts and sources|angle|shorts)\s*|\(.*\)\s*)$/i;
/** a written idea or brief: any text the creator wrote (a title heading counts), template lines excluded */
const realText = (s: string) => s.split("\n").filter((l) => l.trim() && !TEMPLATE_LINE.test(l)).join("\n").replace(/^#+\s*/gm, "").trim();

/** What the project is about, for naming it; "" while nothing is written yet. */
export function nameSource(ws: string): string {
  const d = path.join(WS_ROOT, ws);
  const parts: string[] = [];
  try { const t = JSON.parse(read(path.join(d, "05-video/acts.json")))?.video?.title; if (t) parts.push(`Video title: ${t}`); } catch {}
  const idea = read(path.join(d, "02-scripting/idea.md"));
  if (realText(idea).length >= 12) parts.push(`Idea:\n${idea.slice(0, 2500)}`);
  const script = read(path.join(d, "02-scripting/script_raw.md"));
  if (script.trim() && !PLACEHOLDER_SCRIPT.test(script)) parts.push(`Script (start):\n${script.slice(0, 2500)}`);
  return parts.join("\n\n");
}

/** "Why prices keep rising!" → "Why_Prices_Keep_Rising" (letters and digits, up to `words` words, title case). */
export function slugName(s: string, words = 4): string {
  return s.replace(/['’]/g, "").replace(/[^A-Za-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean).slice(0, words)
    .map((w) => (/^[A-Z0-9]+$/.test(w) && w.length <= 5 ? w : w[0].toUpperCase() + w.slice(1).toLowerCase())).join("_");
}

const TEXT = /\.(json|md|txt|log|ts|tsx|js|srt|vtt|fcpxml|xml|csv|html|yml|yaml)$/i;
const SKIP_DIRS = new Set(["node_modules", ".git", ".remotion", "out", "build", "dist"]);

function rewriteTree(dir: string, from: string[], to: string[], changed: string[]) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) rewriteTree(f, from, to, changed); continue; }
    if (!e.isFile() || !TEXT.test(e.name)) continue;
    rewriteFile(f, from, to, changed);
  }
}
function rewriteFile(f: string, from: string[], to: string[], changed: string[]) {
  try {
    if (fs.statSync(f).size > 20 * 1024 * 1024) return;
    const s = fs.readFileSync(f, "utf-8");
    let out = s;
    from.forEach((x, i) => { out = out.split(x).join(to[i]); });
    if (out !== s) { fs.writeFileSync(f, out, "utf-8"); changed.push(path.relative(REPO, f)); }
  } catch {}
}

/** Renames a project to `<prefix><n>_<name>`. `name` is the part after the number. Returns the new id and the files
 *  whose text changed. Throws when the name is invalid or the target exists. */
export function renameWorkspace(oldId: string, name: string): { id: string; changed: string[] } {
  const m = oldId.match(/^(VID|SH)(\d+)_/);
  if (!m) throw new Error(`${oldId} is not a VID<n>_ or SH<n>_ project`);
  const src = path.join(WS_ROOT, oldId);
  if (!fs.existsSync(src)) throw new Error(`no such workspace: ${oldId}`);
  const clean = name.trim().replace(/\s+/g, "_").replace(/^(VID|SH)\d+_/i, "");
  if (!/^[A-Za-z0-9_]{1,60}$/.test(clean)) throw new Error("name: letters, digits and underscores, e.g. Sticky_Prices");
  if (/^untitled$/i.test(clean)) throw new Error("pick a real name");
  let id = `${m[1]}${m[2]}_${clean}`;
  if (id === oldId) return { id, changed: [] };
  for (let k = 2; fs.existsSync(path.join(WS_ROOT, id)); k++) id = `${m[1]}${m[2]}_${clean}_${k}`;

  fs.renameSync(src, path.join(WS_ROOT, id));
  // old id → new id, in that spelling and in the lower-case package name of 05-video
  const from = [oldId, oldId.toLowerCase()], to = [id, id.toLowerCase()];
  const changed: string[] = [];
  rewriteTree(path.join(WS_ROOT, id), from, to, changed);
  for (const shared of ["_ideas", "_analytics"]) {
    const d = path.join(WS_ROOT, shared);
    if (!fs.existsSync(d)) continue;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) if (e.isFile() && /\.(json|md)$/.test(e.name)) rewriteFile(path.join(d, e.name), from, to, changed);
  }
  return { id, changed };
}
