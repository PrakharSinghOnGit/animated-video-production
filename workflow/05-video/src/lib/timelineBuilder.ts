/**
 * Timeline Builder Engine
 * Converts word-level captions and storyboard definitions into frame-accurate scene windows.
 */

export interface WordCaption {
  text: string;
  startMs: number;
  endMs: number;
  confidence?: number;
}

export interface StoryboardSceneInput {
  id: string;
  slug: string;
  startMs: number;
  endMs: number;
  vo?: string;
  [key: string]: any;
}

export interface StoryboardInput {
  video?: {
    id: string;
    title?: string;
  };
  scenes: StoryboardSceneInput[];
  [key: string]: any;
}

export interface TimelineWord {
  text: string;
  startFrame: number;
  endFrame: number;
  startMs: number;
  endMs: number;
}

export interface TimelineScene {
  id: string;
  slug: string;
  windowStartFrame: number;
  windowEndFrame: number;
  durationFrames: number;
  leadFrames: number;
  voiceStartFrame: number;
  voiceEndFrame: number;
  words: TimelineWord[];
}

export interface TimelineData {
  fps: number;
  width: number;
  height: number;
  leadMs: number;
  durationFrames: number;
  totalDurationMs: number;
  scenes: TimelineScene[];
}

export interface TimelineOptions {
  fps?: number;
  width?: number;
  height?: number;
  leadMs?: number;
  totalAudioDurationMs?: number;
}

export function buildTimeline(
  captions: WordCaption[],
  storyboard: StoryboardInput,
  options: TimelineOptions = {}
): TimelineData {
  const fps = options.fps ?? 30;
  const width = options.width ?? 1920;
  const height = options.height ?? 1080;
  const leadMs = options.leadMs ?? 200;
  const leadFrames = Math.round((leadMs / 1000) * fps);

  if (!storyboard.scenes || storyboard.scenes.length === 0) {
    throw new Error("Storyboard contains no scenes.");
  }

  // Calculate total audio duration in ms
  const maxSceneEndMs = Math.max(...storyboard.scenes.map((s) => s.endMs));
  const maxCaptionEndMs = captions.length > 0 ? Math.max(...captions.map((c) => c.endMs)) : 0;
  const totalMs = options.totalAudioDurationMs ?? Math.max(maxSceneEndMs, maxCaptionEndMs);
  const totalDurationFrames = Math.max(1, Math.round((totalMs / 1000) * fps));

  const scenes: TimelineScene[] = [];

  for (let i = 0; i < storyboard.scenes.length; i++) {
    const s = storyboard.scenes[i];
    const isFirst = i === 0;
    const isLast = i === storyboard.scenes.length - 1;

    // Convert voice start and end ms to video-level frames
    const voiceStartVideoFrame = Math.round((s.startMs / 1000) * fps);
    const voiceEndVideoFrame = Math.round((s.endMs / 1000) * fps);

    // Scene window starts leadFrames before first spoken word (clamped at 0)
    const windowStartFrame = isFirst ? 0 : Math.max(0, voiceStartVideoFrame - leadFrames);

    // Window end calculation
    let windowEndFrame: number;
    if (isLast) {
      windowEndFrame = Math.max(voiceEndVideoFrame + leadFrames, totalDurationFrames);
    } else {
      // End when next scene voice begins + buffer, or tile to next scene window
      const nextScene = storyboard.scenes[i + 1];
      const nextVoiceStartVideoFrame = Math.round((nextScene.startMs / 1000) * fps);
      windowEndFrame = Math.max(voiceEndVideoFrame + leadFrames, nextVoiceStartVideoFrame);
    }

    const durationFrames = Math.max(1, windowEndFrame - windowStartFrame);

    // Relative voice start and end within this scene window
    const voiceStartFrame = Math.max(0, voiceStartVideoFrame - windowStartFrame);
    const voiceEndFrame = Math.min(durationFrames, voiceEndVideoFrame - windowStartFrame);

    // Filter captions belonging to this scene
    // A word belongs if its midpoint is within [startMs, endMs] (or within 100ms tolerance)
    const sceneWords = captions.filter((c) => {
      const mid = (c.startMs + c.endMs) / 2;
      return mid >= s.startMs - 50 && mid <= s.endMs + 50;
    });

    const words: TimelineWord[] = sceneWords.map((c) => {
      const wStartVideo = Math.round((c.startMs / 1000) * fps);
      const wEndVideo = Math.round((c.endMs / 1000) * fps);
      return {
        text: c.text,
        startFrame: wStartVideo - windowStartFrame,
        endFrame: wEndVideo - windowStartFrame,
        startMs: c.startMs,
        endMs: c.endMs,
      };
    });

    scenes.push({
      id: s.id,
      slug: s.slug,
      windowStartFrame,
      windowEndFrame,
      durationFrames,
      leadFrames,
      voiceStartFrame,
      voiceEndFrame,
      words,
    });
  }

  return {
    fps,
    width,
    height,
    leadMs,
    durationFrames: totalDurationFrames,
    totalDurationMs: totalMs,
    scenes,
  };
}
