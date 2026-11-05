import React, { createContext, useContext, useMemo } from "react";
import { useVideoConfig } from "remotion";

export interface SpokenWord {
  text: string;
  startFrame: number;
  endFrame: number;
}

export interface SceneMeta {
  id: string;
  slug?: string;
  title?: string;
  numbers?: { value: number | string; label: string; source?: string }[];
  sfx?: { frame?: number; word?: string; sound: string }[];
  [key: string]: any;
}

export interface SceneContextData {
  id: string;
  fps?: number;
  width?: number;
  height?: number;
  durationFrames: number;
  leadFrames?: number;
  voiceStart?: number;
  voiceEnd?: number;
  words?: SpokenWord[];
  meta?: SceneMeta;
  /** seam plan from `bun run seams` (timeline.json scene.seams): image paths are relative to the public dir */
  seams?: SceneSeams;
  /** the music's beats in this scene's seconds (timeline.json scene.music, from bun run music:beat) */
  music?: SceneMusic;
}
export interface SceneMusic {
  bpm: number; title?: string;
  /** every beat, seconds from the scene start (may start slightly before 0) */
  beats: number[];
  /** the "one" of each bar */
  downbeats: number[];
  /** hits far above the track's usual level (drops, crashes), s = 0..1 relative strength */
  accents: { t: number; s: number }[];
  /** loudness per beat, 0..1 over the excerpt */
  energy: { t: number; e: number }[];
}
export interface SceneSeamSide { kind: string; share?: number; img?: string; ground?: string }
export interface SceneSeams { in?: SceneSeamSide; out?: SceneSeamSide }

export interface SceneContextValue {
  id: string;
  fps: number;
  width: number;
  height: number;
  durationFrames: number;
  leadFrames: number;
  voiceStart: number;
  voiceEnd: number;
  words: SpokenWord[];
  meta?: SceneMeta;
  seams?: SceneSeams;
  music?: SceneMusic;
  sec: (seconds: number) => number;
  ms: (milliseconds: number) => number;
  has: (text: string, occurrence?: number) => boolean;
  word: (text: string, occurrence?: number) => { start: number; end: number; mid: number };
  wordRange: (fromText: string, toText: string) => { start: number; end: number };
}

const SceneContext = createContext<SceneContextValue | null>(null);

function cleanWord(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export const SceneProvider: React.FC<{
  value: SceneContextData;
  children: React.ReactNode;
}> = ({ value, children }) => {
  const videoConfig = useVideoConfig();

  const fps = value.fps ?? videoConfig.fps ?? 30;
  const width = value.width ?? videoConfig.width ?? 1920;
  const height = value.height ?? videoConfig.height ?? 1080;
  const durationFrames = value.durationFrames;
  const leadFrames = value.leadFrames ?? Math.round(0.2 * fps); // 200ms default lead
  const words = useMemo(() => value.words ?? [], [value.words]);

  const voiceStart = value.voiceStart ?? (words.length > 0 ? words[0].startFrame : leadFrames);
  const voiceEnd = value.voiceEnd ?? (words.length > 0 ? words[words.length - 1].endFrame : durationFrames);

  const contextValue: SceneContextValue = useMemo(() => {
    const sec = (seconds: number) => Math.round(seconds * fps);
    const ms = (milliseconds: number) => Math.round((milliseconds / 1000) * fps);

    const findOccurrences = (target: string): SpokenWord[] => {
      const cleanTarget = cleanWord(target);
      return words.filter((w) => cleanWord(w.text) === cleanTarget);
    };

    const has = (text: string, occurrence: number = 1): boolean => {
      const matches = findOccurrences(text);
      return matches.length >= occurrence;
    };

    const word = (text: string, occurrence: number = 1): { start: number; end: number; mid: number } => {
      const matches = findOccurrences(text);
      if (matches.length >= occurrence) {
        const found = matches[occurrence - 1];
        return {
          start: found.startFrame,
          end: found.endFrame,
          mid: Math.round((found.startFrame + found.endFrame) / 2),
        };
      }

      // Fallback: log warning and return midpoint of scene
      console.warn(
        `[useScene] Word "${text}" (occurrence ${occurrence}) not found in scene ${value.id}. Falling back to scene midpoint.`
      );
      const sceneMid = Math.round(durationFrames / 2);
      return { start: sceneMid, end: sceneMid, mid: sceneMid };
    };

    const wordRange = (fromText: string, toText: string): { start: number; end: number } => {
      const fromWord = word(fromText, 1);
      const toWord = word(toText, 1);
      return {
        start: fromWord.start,
        end: Math.max(fromWord.end, toWord.end),
      };
    };

    return {
      id: value.id,
      fps,
      width,
      height,
      durationFrames,
      leadFrames,
      voiceStart,
      voiceEnd,
      words,
      meta: value.meta,
      seams: value.seams,
      music: value.music,
      sec,
      ms,
      has,
      word,
      wordRange,
    };
  }, [value.id, value.meta, value.seams, value.music, fps, width, height, durationFrames, leadFrames, voiceStart, voiceEnd, words]);

  return <SceneContext.Provider value={contextValue}>{children}</SceneContext.Provider>;
};

export function useScene(): SceneContextValue {
  const ctx = useContext(SceneContext);
  if (!ctx) {
    throw new Error("useScene() must be called inside a <SceneProvider>.");
  }
  return ctx;
}
