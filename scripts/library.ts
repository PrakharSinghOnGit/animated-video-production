#!/usr/bin/env bun
/**
 * Library: one place to see every exported video. Rebuilds symlinks (no copies) in
 *   library/videos/<VID>.<ext>     the best export of each long video:
 *                                   ~/Movies/*(<VID>).mov|mp4 (Final Cut export) > 08-deliver/video_full.mp4 > 05-video/final.mp4
 *   library/shorts/<VID>_<S>.mp4   every short in workspace/<VID>/shorts/export/
 * Only symlinks are removed on a rebuild, so anything you drop in there yourself stays.
 * Runs on its own after render, deliver and shorts:export; by hand: bun run library
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO = path.resolve(import.meta.dir, "..");
const WS = path.join(REPO, "workspace");
const MOVIES = path.join(os.homedir(), "Movies");

function mainExport(vid: string): string | undefined {
  const fcp = fs.existsSync(MOVIES)
    ? fs.readdirSync(MOVIES).filter((f) => /\.(mov|mp4)$/i.test(f) && f.includes(`(${vid})`))
      .map((f) => path.join(MOVIES, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
    : [];
  return [...fcp, path.join(WS, vid, "08-deliver", "video_full.mp4"), path.join(WS, vid, "05-video", "final.mp4")]
    .find((p) => fs.existsSync(p));
}

function reset(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.lstatSync(p).isSymbolicLink()) fs.unlinkSync(p);
  }
}

export function refreshLibrary(): { videos: number; shorts: number } {
  const vDir = path.join(REPO, "library", "videos"), sDir = path.join(REPO, "library", "shorts");
  reset(vDir); reset(sDir);
  let videos = 0, shorts = 0;
  const vids = fs.existsSync(WS) ? fs.readdirSync(WS).filter((d) => /^(VID|SH)\w*/.test(d) && fs.statSync(path.join(WS, d)).isDirectory()).sort() : [];
  for (const vid of vids) {
    const main = mainExport(vid);
    if (main) { fs.symlinkSync(main, path.join(vDir, `${vid}${path.extname(main).toLowerCase()}`)); videos++; }
    const exp = path.join(WS, vid, "shorts", "export");
    if (!fs.existsSync(exp)) continue;
    for (const f of fs.readdirSync(exp).filter((f) => /\.(mp4|mov)$/i.test(f)).sort()) {
      fs.symlinkSync(path.join(exp, f), path.join(sDir, `${vid}_${f}`)); shorts++;
    }
  }
  return { videos, shorts };
}

/** For pipeline steps: refresh quietly, never fail the step over it. */
export function tryRefreshLibrary() {
  try { const r = refreshLibrary(); console.log(`📚 library: ${r.videos} videos, ${r.shorts} shorts → library/`); }
  catch (e) { console.warn(`[library] not refreshed: ${(e as Error).message}`); }
}

if (import.meta.main) {
  const r = refreshLibrary();
  console.log(`📚 ${r.videos} videos → library/videos, ${r.shorts} shorts → library/shorts`);
}
