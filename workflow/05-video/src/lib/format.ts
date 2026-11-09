/**
 * Workspace format: a long-form video (default) or a 9:16 short. A short is a nested workspace
 * (workspace/<VID>/shorts/S1/) whose config.json says { "format": "short", "width": 1080, "height": 1920, ... }.
 */
import fs from "node:fs";
import path from "node:path";

export const SHORT_CONFIG = { format: "short", width: 1080, height: 1920, fps: 30, endHoldS: 0, fadeOutFrames: 0 } as const;
/** The default length limit of a short; a short's config.json "maxS" can raise it (YouTube Shorts and Reels allow 3 min). */
export const SHORT_MAX_S = 60;
/** The lengths offered for a short (seconds): 60 s is the classic short, 160 s = 2:40, 180 s = the platforms' 3 min cap. */
/** The platforms' cap (YouTube Shorts and Reels): QC fails a short only past this. */
export const SHORT_CAP_S = 180;
export const SHORT_LENGTHS = [60, 90, 120, 160, 180] as const;

export function workspaceConfig(wsDir: string): Record<string, any> {
  try { return JSON.parse(fs.readFileSync(path.join(wsDir, "config.json"), "utf-8")); } catch { return {}; }
}
export const isShortWorkspace = (wsDir: string): boolean => workspaceConfig(wsDir).format === "short";
/** This short's length limit in seconds (config.json "maxS", 15–180; default 60). */
export function shortMaxS(wsDir: string): number {
  const v = Number(workspaceConfig(wsDir).maxS);
  return Number.isFinite(v) && v >= 15 && v <= 180 ? v : SHORT_MAX_S;
}
/** 2:40 style label for a length in seconds. */
export const lengthLabel = (s: number) => (s % 60 === 0 && s >= 60 ? `${s / 60} min` : s > 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : `${s} s`);
