/**
 * Act scene files against the plan. A new plan can reuse act IDs with different content (A03 was "you were
 * liquidity", now it is "where stops pile up"), so:
 * - the file for an act is `<id>_<slug>.tsx`; another file with the same ID is from an older plan;
 * - `retireOldScenes` moves files whose ID left the plan, or whose slug changed, to 05-video/old_scenes/<time>/
 *   (moved, never deleted) so neither assemble nor the dashboard picks them up;
 * - `planChanged` says whether an act's plan entry changed since its file was written (review/<id>/plan.hash, the
 *   same hash the dashboard records), so "author the missing acts" also redoes acts whose plan changed.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const ID = /^([AS]\d+)_.*\.tsx$/i;

/** The scene file used for an act: the exact `<id>_<slug>.tsx`, else the first file with that ID (null if none). */
export function sceneFileFor(scenesDir: string, id: string, slug?: string): string | null {
  const files = fs.existsSync(scenesDir) ? fs.readdirSync(scenesDir).filter((f) => ID.test(f)).sort() : [];
  const exact = slug ? files.find((f) => f === `${id}_${slug}.tsx`) : undefined;
  const any = files.find((f) => f.match(ID)![1].toUpperCase() === id.toUpperCase());
  return exact ?? any ?? null;
}

/** Move scene files that don't belong to the current plan out of the scenes folder. Returns the moved names. */
export function retireOldScenes(outputDir: string, acts: { id: string; slug: string }[]): string[] {
  const scenesDir = path.join(outputDir, "src", "scenes");
  if (!fs.existsSync(scenesDir)) return [];
  const want = new Map(acts.map((a) => [a.id.toUpperCase(), `${a.id}_${a.slug}.tsx`]));
  const files = fs.readdirSync(scenesDir).filter((f) => ID.test(f));
  // not in the plan any more, or the same ID under another slug (an older plan's act)
  const old = files.filter((f) => f !== want.get(f.match(ID)![1].toUpperCase()));
  if (!old.length) return [];
  const to = path.join(outputDir, "old_scenes", new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19));
  fs.mkdirSync(to, { recursive: true });
  for (const f of old) fs.renameSync(path.join(scenesDir, f), path.join(to, f));
  return old.map((f) => `${f} → ${path.relative(outputDir, to)}/`);
}

/** Hash of one act's entry in acts.json, exactly as the dashboard computes it (so either side can record it). */
export function actPlanHash(actsFile: string, id: string): string {
  let entry: unknown = null;
  try { entry = (JSON.parse(fs.readFileSync(actsFile, "utf-8")).acts ?? []).find((a: any) => a.id === id) ?? null; } catch {}
  return createHash("sha256").update(JSON.stringify(entry)).digest("hex");
}

const hashFile = (outputDir: string, id: string) => path.join(outputDir, "review", id, "plan.hash");

const mt = (f: string) => { try { return fs.statSync(f).mtimeMs; } catch { return 0; } };

/**
 * True when the act's plan entry changed after its scene file was written. The recorded hash counts only if it was
 * recorded when the scene was written or later, and not after a plan change the scene predates (the dashboard
 * records a missing hash lazily, which after a re-plan would stamp an old act with the new plan). Without a hash that
 * counts: changed = acts.json is newer than the scene.
 */
export function planChanged(outputDir: string, id: string, sceneFile: string): boolean {
  const actsFile = path.join(outputDir, "acts.json"), f = hashFile(outputDir, id);
  const scene = mt(sceneFile), plan = mt(actsFile), h = mt(f);
  if (!scene) return false;
  const trusted = h >= scene && !(scene < plan && plan < h);
  if (!trusted) return plan > scene;
  return fs.readFileSync(f, "utf-8").trim() !== actPlanHash(actsFile, id);
}

/** Record the plan entry an act was just written (or fixed) against. */
export function recordPlanHash(outputDir: string, id: string): void {
  const f = hashFile(outputDir, id);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, actPlanHash(path.join(outputDir, "acts.json"), id));
}
