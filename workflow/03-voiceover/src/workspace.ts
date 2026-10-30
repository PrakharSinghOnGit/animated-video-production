import fs from "fs";
import path from "path";
import { CONFIG } from "./config";
import type { VOSection } from "./types";

export interface VideoWorkspacePaths {
  videoId: string;
  rootDir: string;
  scriptRawPath: string;
  sectionsDir: string;
  audioDir: string;
  sectionsIndexPath: string;
}

export function listAvailableVideos(): string[] {
  if (!fs.existsSync(CONFIG.workspaceDir)) return [];
  return fs
    .readdirSync(CONFIG.workspaceDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

export function resolveWorkspace(videoId?: string): VideoWorkspacePaths {
  const available = listAvailableVideos();
  let target = videoId || CONFIG.defaultVideo;

  // nested workspaces (shorts: "VID03_X/shorts/S1") are not in the top-level list
  if (!available.includes(target) && !fs.existsSync(path.join(CONFIG.workspaceDir, target))) {
    if (available.length === 1) {
      target = available[0];
    } else if (available.length > 0) {
      // Check for partial match (e.g. 'VID01' matching 'VID01_Currency_Market')
      const matched = available.find((v) =>
        v.toLowerCase().startsWith(target.toLowerCase())
      );
      if (matched) target = matched;
    }
  }

  const rootDir = path.join(CONFIG.workspaceDir, target);
  return {
    videoId: target,
    rootDir,
    scriptRawPath: path.join(rootDir, "02-scripting", "script_raw.md"),
    sectionsDir: path.join(rootDir, "03-voiceover", "sections"),
    audioDir: path.join(rootDir, "03-voiceover", "audio"),
    sectionsIndexPath: path.join(rootDir, "03-voiceover", "sections", "index.ts"),
  };
}

export async function loadSections(ws: VideoWorkspacePaths): Promise<VOSection[]> {
  if (!fs.existsSync(ws.sectionsIndexPath)) {
    throw new Error(
      `Sections file not found for video '${ws.videoId}' at: ${ws.sectionsIndexPath}\n` +
      `Ensure sections are placed in: workspace/${ws.videoId}/03-voiceover/sections/index.ts`
    );
  }

  const module = await import(ws.sectionsIndexPath);
  if (!module.allSections && !module.getAllSections) {
    throw new Error(
      `Export 'allSections' or 'getAllSections' missing in: ${ws.sectionsIndexPath}`
    );
  }

  return module.allSections || module.getAllSections();
}
