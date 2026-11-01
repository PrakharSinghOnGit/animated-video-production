/**
 * Shorts: 2–3 standalone 9:16 shorts (≤ 60 s) per long video. Each short is a nested workspace with the same layout as a video,
 * so every pipeline command runs on it with `--video <VID>/shorts/S1`:
 *
 *   workspace/<VID>/shorts/
 *     shorts.json                  index from shorts:write (kind, title, hook, payoff, loop, data, description, hashtags)
 *     feedback.md                  optional: the creator's notes on all shorts (a full rewrite reads it)
 *     export/                      shorts:export → S1.mp4 + S1.txt (title, description, hashtags), ready to upload
 *     S1/config.json               { format: "short", width: 1080, height: 1920, endHoldS: 0, fadeOutFrames: 0 }
 *     S1/02-scripting/             script_raw.md, short.json (its index entry + checks), approved.json, feedback.md
 *     S1/03-voiceover … 07-assembly the usual stages
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { SHORT_CONFIG } from "../05-video/src/lib/format";

export const REPO = path.resolve(import.meta.dir, "../..");
export const WS_ROOT = path.join(REPO, "workspace");
export const SHORT_ID = /^S\d{1,2}$/;
/** Spoken words per short: the voice runs ~130–155 wpm at pace 1.0, so 140 words stays under 60 s with the pauses. */
export const MIN_WORDS = 70, MAX_WORDS = 140;
/** Voice settings for shorts: quicker than the long video (pace 0.9, 0.9 s between beats) without sounding rushed. */
export const SHORT_TTS = ["--pace", "1.0", "--sentence-gap", "0.3", "--section-gap", "0.35"];

export const shortsDir = (vid: string) => path.join(WS_ROOT, vid, "shorts");
export const shortWs = (vid: string, sid: string) => path.join(shortsDir(vid), sid);
/** The --video id every pipeline command takes for a short. */
export const shortVideoId = (vid: string, sid: string) => `${vid}/shorts/${sid}`;
export const indexPath = (vid: string) => path.join(shortsDir(vid), "shorts.json");

export function readJson<T = any>(p: string): T | null {
  try { return JSON.parse(fs.readFileSync(p, "utf-8")); } catch { return null; }
}
export const exists = (p: string) => fs.existsSync(p);
export const mtime = (p: string) => { try { return fs.statSync(p).mtimeMs; } catch { return 0; } };

/** S1, S2, … that exist on disk, in order. */
export function listShorts(vid: string): string[] {
  const d = shortsDir(vid);
  if (!exists(d)) return [];
  return fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory() && SHORT_ID.test(e.name)).map((e) => e.name)
    .sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));
}

export interface ShortEntry {
  id: string; kind: string; title: string; hook: string; payoff: string; loop: string; why?: string; from?: string;
  words: number; data: { label: string; value: number | string; unit?: string; source: string }[];
  description: string; hashtags: string[];
  /** added by shorts:write */
  checks?: { errors: string[]; warnings: string[] };
}

/** Spoken words of a script (the **VO:** lines without their [VO: tone] notes). */
export function spokenWords(script: string): number {
  return script.split("\n").filter((l) => /^\*\*VO:\*\*/i.test(l.trim()))
    .join(" ").replace(/`\[[^\]]*\]`/g, "").replace(/\*\*VO:\*\*/gi, "").split(/\s+/).filter(Boolean).length;
}
export const spokenText = (script: string) => script.split("\n").filter((l) => /^\*\*VO:\*\*/i.test(l.trim()))
  .map((l) => l.replace(/`\[[^\]]*\]`/g, "").replace(/\*\*VO:\*\*/gi, "").trim()).join(" ");

const sha = (p: string) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
/** Same gate as the long video (write --approve): "approved" | "changed since approval" | "not approved" | "no script". */
export function approvalState(ws: string): string {
  const script = path.join(ws, "02-scripting", "script_raw.md"), ok = path.join(ws, "02-scripting", "approved.json");
  if (!exists(script)) return "no script";
  if (!exists(ok)) return "not approved";
  return readJson(ok)?.sha256 === sha(script) ? "approved" : "changed since approval";
}

function copyTemplate(src: string, dest: string, slug: string) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, e.name), to = path.join(dest, e.name);
    if (e.isDirectory()) copyTemplate(from, to, slug);
    else if (!exists(to)) fs.writeFileSync(to, fs.readFileSync(from, "utf-8").replace("{{VIDEO_ID}}", slug), "utf-8");
  }
}

/** Create a short's workspace (folders, 9:16 config.json, Remotion project). Returns true when it was new (bun install needed). */
export function scaffoldShort(vid: string, sid: string): boolean {
  const ws = shortWs(vid, sid), fresh = !exists(path.join(ws, "05-video", "package.json"));
  for (const sub of ["02-scripting", "03-voiceover/sections", "03-voiceover/audio", "04-transcription/words", "05-video/review",
    "05-video/src/scenes", "06-audio/sfx", "07-assembly/export"]) fs.mkdirSync(path.join(ws, sub), { recursive: true });
  const cfgPath = path.join(ws, "config.json");
  fs.writeFileSync(cfgPath, JSON.stringify({ ...SHORT_CONFIG, ...(readJson(cfgPath) ?? {}), format: "short", width: 1080, height: 1920 }, null, 2), "utf-8");
  copyTemplate(path.join(REPO, "workflow/05-video/template"), path.join(ws, "05-video"), `${vid}-shorts-${sid}`.toLowerCase().replace(/[^a-z0-9_-]/g, "-"));
  return fresh;
}

/** Link the new short projects into the bun workspace (root package.json lists workspace/<VID>/shorts/<S>/05-video). */
export function linkWorkspaces(): void {
  try { execSync("bun install", { cwd: REPO, stdio: "ignore" }); } catch (e: any) { console.warn(`⚠️  bun install: ${e.message}`); }
}

/** Where a short stands, from its files (newest-wins like the dashboard's derive): one flag per stage. */
export function shortProgress(vid: string, sid: string) {
  const ws = shortWs(vid, sid), f = (rel: string) => path.join(ws, rel);
  const scene = (() => { try { return fs.readdirSync(f("05-video/src/scenes")).find((n) => /^A01.*\.tsx$/.test(n)); } catch { return undefined; } })();
  const reportOk = mtime(f("05-video/review/qc-report.md")) >= mtime(f("05-video/final.mp4")) && exists(f("05-video/final.mp4"))
    && fs.readFileSync(f("05-video/review/qc-report.md"), "utf-8").includes("_No blocking errors._");
  const exportFile = path.join(shortsDir(vid), "export", `${sid}.mp4`);
  return {
    script: exists(f("02-scripting/script_raw.md")),
    approved: approvalState(ws) === "approved",
    voice: exists(f("03-voiceover/audio/combined/full_voiceover.wav")),
    align: exists(f("05-video/captions.json")),
    plan: exists(f("05-video/acts.json")),
    act: !!scene,
    sound: exists(f("06-audio/mix.wav")),
    render: exists(f("05-video/final.mp4")),
    // QC passed on the current final: its report is newer than final.mp4 and has no blocking errors
    qc: reportOk,
    // exported = the export copy is the current, QC-passed final (same size, not older)
    exported: reportOk && exists(exportFile) && mtime(exportFile) >= mtime(f("05-video/final.mp4"))
      && fs.statSync(exportFile).size === fs.statSync(f("05-video/final.mp4")).size,
  };
}
