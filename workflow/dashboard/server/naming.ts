/** Naming untitled projects (VID07_Untitled → VID07_Sticky_Prices) and manual renames; the server's state follows the new id. */
import { isUntitled, nameSource, renameWorkspace } from "../../lib/rename";
import { REPO } from "./core";
import { appendWsLog, childEnv, hooks, jobs, jobsByWs, runningJobs } from "./jobs";
import { currentStudio } from "./studio";
import { logCache } from "./status";
import { sizeCache } from "./files";

// ───────────────────────────── naming untitled projects ─────────────────────────────

/** old id → new id of projects renamed since the server started, so an open page follows its project. */
export const renames = new Map<string, string>();
export const naming = new Set<string>();

/** Why the project can't be renamed now, or null. */
export function renameBlocker(ws: string): string | null {
  if (runningJobs(ws).length) return "a job of this project is running";
  const studio = currentStudio();
  if (studio && studio.exited === null && studio.ws === ws) return "the studio is open for this project; stop it first";
  if (naming.has(ws)) return "already being named";
  return null;
}

/** Renames on disk (workflow/lib/rename.ts), then moves the server's state to the new id and relinks bun. */
export function doRename(ws: string, name: string): string {
  const { id } = renameWorkspace(ws, name);
  if (id === ws) return id;
  const list = jobsByWs.get(ws);
  if (list) { jobsByWs.delete(ws); jobsByWs.set(id, [...(jobsByWs.get(id) ?? []), ...list]); for (const j of list) { const job = jobs.get(j); if (job) job.ws = id; } }
  for (const [k, v] of renames) if (v === ws) renames.set(k, id);
  renames.set(ws, id);
  logCache.delete(ws); sizeCache.delete(ws);
  appendWsLog(id, `\n[dashboard] renamed ${ws} → ${id} ${new Date().toISOString()}\n`);
  // bun.lock lists each workspace's 05-video; relink in the background
  Bun.spawn(["bun", "install"], { cwd: REPO, env: childEnv(), stdin: "ignore", stdout: "ignore", stderr: "ignore" });
  console.log(`[dashboard] renamed ${ws} → ${id}`);
  return id;
}

/** Asks the naming model (bun run rename --suggest, role projectName) and renames, if nothing runs by then. */
export async function autoName(ws: string, force = false): Promise<{ id?: string; error?: string }> {
  if (!force && (!isUntitled(ws) || !nameSource(ws))) return {};
  if (renameBlocker(ws)) return { error: renameBlocker(ws)! };
  naming.add(ws);
  try {
    const proc = Bun.spawn(["bun", "run", "rename", "--video", ws, "--suggest"], { cwd: REPO, env: childEnv(), stdin: "ignore", stdout: "pipe", stderr: "pipe" });
    const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
    await proc.exited;
    const name = out.match(/^NAME: ([A-Za-z0-9_]+)\s*$/m)?.[1];
    if (!name) return { error: (err.trim().split("\n").pop() || "the naming model gave no name").replace(/^❌\s*/, "") };
    naming.delete(ws);
    const busy = renameBlocker(ws);   // a job may have started while the model thought
    if (busy) return { error: busy };
    return { id: doRename(ws, name) };
  } catch (e) { return { error: (e as Error).message }; }
  finally { naming.delete(ws); }
}

// an untitled project is named as soon as a finished job leaves something to name it from (idea, script, plan)
hooks.nameAfter = (ws) => { if (isUntitled(ws)) void autoName(ws); };
