/**
 * hookscore.py (yt-script) run by the pipeline, not only by the writer model: after a writer run the hooks file is
 * scored in code and the ranking is written into the notes, so the scores never depend on the model's shell call
 * being allowed. Also the tool rules that let a writer run the scorer itself, by relative or absolute path.
 * Used by write_script.ts and 08-shorts/write.ts. No side effects at import.
 */
import fs from "node:fs";
import path from "node:path";

const REPO = path.resolve(import.meta.dir, "../..");
export const HOOKSCORE = "workflow/02-scripting/yt-script/hookscore.py";

/** Bash rules for agent runs: the scorer by its repo-relative and absolute path (models use either). */
export const hookscoreTools = () => [`Bash(python3 ${HOOKSCORE}:*)`, `Bash(python3 ${path.join(REPO, HOOKSCORE)}:*)`];

interface Scored { hook: string; properties: Record<string, number>; verdict: number; band: string; formula: string }

export function scoreHooks(hooksFile: string): Scored[] {
  if (!fs.existsSync(hooksFile) || !fs.readFileSync(hooksFile, "utf-8").trim()) return [];
  const r = Bun.spawnSync(["python3", path.join(REPO, HOOKSCORE), "--json", hooksFile], { stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) throw new Error(r.stderr.toString().trim().split("\n").pop() || `hookscore exit ${r.exitCode}`);
  return JSON.parse(r.stdout.toString());
}

const HEAD = "## Hook scores (hookscore.py, run by the pipeline)";

/** Scores the hooks and writes the ranking into the notes file (replacing an earlier pipeline block). Returns the
 *  ranked hooks ([] when there is no hooks file). */
export function scoreHooksIntoNotes(hooksFile: string, notesFile: string): Scored[] {
  const rows = scoreHooks(hooksFile).sort((a, b) => b.verdict - a.verdict);
  if (!rows.length) return rows;
  const weakest = (p: Record<string, number>) => Object.entries(p).sort((a, b) => a[1] - b[1])[0]?.[0] ?? "";
  const block = `${HEAD}
| # | hook | score | formula | weakest |
|---|---|---|---|---|
${rows.map((h, i) => `| ${i + 1} | ${h.hook.replace(/\|/g, "/")} | ${h.verdict} ${h.band} | ${h.formula} | ${weakest(h.properties)} |`).join("\n")}`;
  let notes = fs.existsSync(notesFile) ? fs.readFileSync(notesFile, "utf-8") : "";
  // drop an earlier pipeline block and the writer's "did not run" note, if any
  notes = notes.replace(/<!-- hookscore:start -->[\s\S]*?<!-- hookscore:end -->\n?/, "")
    .replace(/^## Hook scores \(hookscore\.py, run by the pipeline\)\n(?:[^\n]*\|[^\n]*\n?)*/m, "")
    .replace(/^`?hookscore\.py`? did not run[^\n]*\n(?:[^\n#][^\n]*\n)*/im, "");
  fs.writeFileSync(notesFile, `${block}\n\n${notes.trimStart()}`, "utf-8");
  return rows;
}
