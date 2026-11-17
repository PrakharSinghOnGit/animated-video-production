/**
 * The swipe file: 1,031 finance outliers (titles + visual tags, no images) in swipe/outliers.json and the recipes drawn
 * from them in swipe/RECIPES.md. The packages-first step (concepts.ts) shows the editor the recipes and the outliers
 * closest to its topic, and rejects a title that copies one.
 *
 * No side effects at import; the data is read on first use.
 */
import fs from "node:fs";
import path from "node:path";

const DIR = path.join(import.meta.dir, "swipe");
export const RECIPES_FILE = path.join(DIR, "RECIPES.md");
export const OUTLIERS_FILE = path.join(DIR, "outliers.json");

export interface Outlier {
  id: string; title: string; channel: string; multiple: number; views: number; date: string;
  archetype: string; faces: string; facelessFit: number; layout: string; palette: string; emotion: string;
  devices: string[]; thumbText: string; idea: string;
}

let cache: Outlier[] | null = null;
export function readOutliers(file = OUTLIERS_FILE): Outlier[] {
  if (cache && file === OUTLIERS_FILE) return cache;
  let rows: Outlier[] = [];
  try { rows = JSON.parse(fs.readFileSync(file, "utf-8")).videos ?? []; } catch {}
  if (file === OUTLIERS_FILE) cache = rows;
  return rows;
}
export function readRecipes(): string { try { return fs.readFileSync(RECIPES_FILE, "utf-8"); } catch { return ""; } }

const STOP = new Set("the a an of to in is and for on how why what this with are it be your you i my that from will its at by can do as not we they has have was all about or our just most who into than".split(" "));
const words = (t: string) => t.toLowerCase().replace(/[’']/g, "").match(/[a-z0-9$]+/g) ?? [];
const keyWords = (t: string) => words(t).filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.replace(/s$/, ""));

/**
 * The outliers to show the editor for a topic: the closest by shared words (title, thumbnail words, idea), then the
 * strongest faceless ones so every prompt also sees structures the channel can draw. Deterministic.
 */
export function swipeExamples(topic: string, n = 12, faceless = 8, rows = readOutliers()): { related: Outlier[]; faceless: Outlier[] } {
  const q = new Set(keyWords(topic));
  const scored = rows.map((r) => {
    const own = new Set(keyWords(`${r.title} ${r.thumbText}`));
    let s = 0; for (const w of q) if (own.has(w)) s++;
    return { r, s };
  }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s || b.r.multiple - a.r.multiple);
  const related = scored.slice(0, n).map((x) => x.r);
  const seen = new Set(related.map((r) => r.id));
  const fl = rows.filter((r) => r.faces === "0" && r.facelessFit >= 4 && !seen.has(r.id)).sort((a, b) => b.multiple - a.multiple).slice(0, faceless);
  return { related, faceless: fl };
}

/** One row of the editor's evidence table. */
export function swipeRow(r: Outlier): string {
  const cell = (s: string) => s.replace(/\|/g, "/").replace(/\n/g, " ");
  return `| ${cell(r.title)} | ${r.multiple}x | ${cell(r.archetype)}, ${cell(r.layout)}${r.devices.length && r.devices[0] !== "none" ? `, ${r.devices.join("/")}` : ""} | ${cell(r.thumbText) || "(none)"} | ${cell(r.idea)} |`;
}

/** An outlier title this title copies: a shared run of `run` words (case and punctuation ignored), or null. */
export function copiedTitle(title: string, run = 5, rows = readOutliers()): string | null {
  const t = words(title);
  if (t.length < run) return rows.find((r) => words(r.title).join(" ") === t.join(" "))?.title ?? null;
  const grams = new Set<string>();
  for (let i = 0; i + run <= t.length; i++) grams.add(t.slice(i, i + run).join(" "));
  for (const r of rows) {
    const o = words(r.title);
    for (let i = 0; i + run <= o.length; i++) if (grams.has(o.slice(i, i + run).join(" "))) return r.title;
  }
  return null;
}
