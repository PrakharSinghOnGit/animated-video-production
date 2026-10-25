import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/**
 * Scene coverage + render manifest.
 *
 * Render writes `<output>.manifest.json` describing exactly what went into the
 * video (which scenes were real vs placeholder, and a hash of every input).
 * QC verifies the video against that manifest instead of the current source tree,
 * so a stale or placeholder render can no longer pass.
 */

export interface SceneCoverage {
  total: number;
  authored: { id: string; slug: string; file: string }[];
  missing: { id: string; slug: string }[];
}

export interface RenderManifest {
  output: string;
  profile: "draft" | "final";
  renderedAt: string;
  sceneCount: number;
  missingScenes: string[];
  inputsHash: string;
  files: Record<string, string>;
}

function sha1(buf: Buffer | string): string {
  return crypto.createHash("sha1").update(buf).digest("hex");
}

function readTimeline(outputDir: string): any {
  const timelinePath = path.join(outputDir, "timeline.json");
  if (!fs.existsSync(timelinePath)) {
    throw new Error(`timeline.json not found at ${timelinePath}. Run "bun run assemble" first.`);
  }
  return JSON.parse(fs.readFileSync(timelinePath, "utf-8"));
}

export function checkSceneCoverage(outputDir: string): SceneCoverage {
  const timeline = readTimeline(outputDir);
  const scenesDir = path.join(outputDir, "src", "scenes");
  const files = fs.existsSync(scenesDir)
    ? fs.readdirSync(scenesDir).filter((f) => /^S\d+.*\.tsx$/i.test(f))
    : [];

  // Storyboard scenes with an `archetype` render from their spec and need no scene file.
  const storyboardPath = path.join(outputDir, "storyboard.json");
  const archetypeIds = new Set<string>(
    fs.existsSync(storyboardPath)
      ? JSON.parse(fs.readFileSync(storyboardPath, "utf-8"))
          .scenes.filter((sc: any) => sc.archetype)
          .map((sc: any) => String(sc.id).toUpperCase())
      : []
  );

  const coverage: SceneCoverage = { total: timeline.scenes.length, authored: [], missing: [] };
  for (const scene of timeline.scenes) {
    const file = files.find((f) => f.match(/^(S\d+)/i)?.[1].toUpperCase() === scene.id.toUpperCase());
    if (file) coverage.authored.push({ id: scene.id, slug: scene.slug, file });
    else if (archetypeIds.has(scene.id.toUpperCase()))
      coverage.authored.push({ id: scene.id, slug: scene.slug, file: "storyboard.json (archetype)" });
    else coverage.missing.push({ id: scene.id, slug: scene.slug });
  }
  return coverage;
}

/** Hash every input that affects the rendered pixels/audio. */
export function fingerprintInputs(outputDir: string): Record<string, string> {
  const files: Record<string, string> = {};
  const add = (rel: string) => {
    const abs = path.join(outputDir, rel);
    if (fs.existsSync(abs)) files[rel] = sha1(fs.readFileSync(abs));
  };

  add("timeline.json");
  add("storyboard.json");
  add("public/voiceover.wav");
  add("src/Main.tsx");
  add("src/Root.tsx");
  add("src/scenes/index.ts");
  const scenesDir = path.join(outputDir, "src", "scenes");
  if (fs.existsSync(scenesDir)) {
    for (const f of fs.readdirSync(scenesDir).filter((f) => f.endsWith(".tsx")).sort()) {
      add(path.join("src", "scenes", f));
    }
  }
  return files;
}

export function hashFingerprint(files: Record<string, string>): string {
  return sha1(Object.keys(files).sort().map((k) => `${k}:${files[k]}`).join("\n"));
}

export function manifestPathFor(videoPath: string): string {
  return videoPath.replace(/\.mp4$/i, ".manifest.json");
}

export function writeRenderManifest(outputDir: string, videoPath: string, profile: "draft" | "final"): RenderManifest {
  const coverage = checkSceneCoverage(outputDir);
  const files = fingerprintInputs(outputDir);
  const manifest: RenderManifest = {
    output: path.basename(videoPath),
    profile,
    renderedAt: new Date().toISOString(),
    sceneCount: coverage.total,
    missingScenes: coverage.missing.map((m) => m.id),
    inputsHash: hashFingerprint(files),
    files,
  };
  fs.writeFileSync(manifestPathFor(videoPath), JSON.stringify(manifest, null, 2), "utf-8");
  return manifest;
}

export function readRenderManifest(videoPath: string): RenderManifest | null {
  const p = manifestPathFor(videoPath);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

/** Files whose content changed since the render (i.e. the video is stale). */
export function staleInputs(outputDir: string, manifest: RenderManifest): string[] {
  const current = fingerprintInputs(outputDir);
  const keys = new Set([...Object.keys(current), ...Object.keys(manifest.files)]);
  return [...keys].filter((k) => current[k] !== manifest.files[k]).sort();
}
