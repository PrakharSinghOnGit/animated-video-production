/**
 * Workspace format: a long-form video (default) or a 9:16 short. A short is a nested workspace
 * (workspace/<VID>/shorts/S1/) whose config.json says { "format": "short", "width": 1080, "height": 1920, ... }.
 */
import fs from "node:fs";
import path from "node:path";

export const SHORT_CONFIG = { format: "short", width: 1080, height: 1920, fps: 30, endHoldS: 0, fadeOutFrames: 0 } as const;
/** The creator's limit for a short. */
export const SHORT_MAX_S = 60;

export function workspaceConfig(wsDir: string): Record<string, any> {
  try { return JSON.parse(fs.readFileSync(path.join(wsDir, "config.json"), "utf-8")); } catch { return {}; }
}
export const isShortWorkspace = (wsDir: string): boolean => workspaceConfig(wsDir).format === "short";
