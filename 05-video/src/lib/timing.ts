import type { NormalizedCaption } from "./schema";

/**
 * Converts milliseconds to frames for a given frame rate.
 * All timeline logic MUST call this helper; never hand-compute frames.
 */
export function msToFrames(ms: number, fps: number = 30): number {
  return Math.round((ms / 1000) * fps);
}

/**
 * Converts frames to milliseconds for a given frame rate.
 */
export function framesToMs(frames: number, fps: number = 30): number {
  return Math.round((frames / fps) * 1000);
}

/**
 * Cleans a word for matching: strips surrounding whitespace and punctuation, lowercase.
 */
export function cleanWord(word: string): string {
  return word.toLowerCase().replace(/^[^\w$€£₹]+|[^\w$€£₹]+$/g, "").trim();
}

/**
 * Resolves an anchor word timestamp (in ms) within a scene's time window.
 * Returns the timestampMs (or midpoint of start/end) of the matching word occurrence.
 * If word cannot be found within the scene, falls back to the scene midpoint.
 */
export function resolveAnchorMs(
  targetWord: string,
  occurrence: number = 1,
  captions: NormalizedCaption[],
  sceneStartMs: number,
  sceneEndMs: number
): { resolvedMs: number; found: boolean; warning?: string } {
  const cleanTarget = cleanWord(targetWord);
  
  // Filter captions in the scene's time window
  const sceneCaptions = captions.filter(
    (c) => c.startMs >= sceneStartMs - 200 && c.endMs <= sceneEndMs + 200
  );

  let matchCount = 0;
  for (const cap of sceneCaptions) {
    const cleanCurrent = cleanWord(cap.text);
    if (cleanCurrent === cleanTarget || cleanCurrent.includes(cleanTarget)) {
      matchCount++;
      if (matchCount === occurrence) {
        const targetMs = cap.timestampMs ?? Math.round((cap.startMs + cap.endMs) / 2);
        return { resolvedMs: targetMs, found: true };
      }
    }
  }

  // Fallback to scene midpoint
  const fallbackMs = Math.round((sceneStartMs + sceneEndMs) / 2);
  return {
    resolvedMs: fallbackMs,
    found: false,
    warning: `Anchor word "${targetWord}" (occurrence ${occurrence}) not found in scene [${sceneStartMs}ms, ${sceneEndMs}ms]. Using scene midpoint.`,
  };
}

/**
 * Formats a duration in seconds into a YouTube chapter timestamp (M:SS or H:MM:SS).
 * YouTube requires chapters to start with 0:00.
 */
export function formatTimestamp(seconds: number): string {
  const s = Math.floor(seconds);
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const secs = s % 60;

  const paddedSecs = secs.toString().padStart(2, "0");
  if (hours > 0) {
    const paddedMins = minutes.toString().padStart(2, "0");
    return `${hours}:${paddedMins}:${paddedSecs}`;
  }
  return `${minutes}:${paddedSecs}`;
}

/**
 * Minimum hold time to ensure on-screen text is readable:
 * 500 ms base + 280 ms per word.
 */
export function calculateReadingHoldMs(wordCount: number): number {
  return 500 + wordCount * 280;
}
