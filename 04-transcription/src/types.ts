export interface WordTimestamp {
  word: string;
  start: number; // in seconds
  end: number;   // in seconds
  probability: number;
}

export interface SegmentTimestamp {
  id: number;
  start: number;
  end: number;
  text: string;
  words: WordTimestamp[];
}

export interface ClipTranscript {
  file: string;
  part: number;
  sectionId: string;
  duration: number;
  text: string;
  words: WordTimestamp[];
  segments: SegmentTimestamp[];
}

export interface FullTranscript {
  videoId: string;
  generatedAt: string;
  model: string;
  totalDuration: number;
  clips: ClipTranscript[];
}

export interface TranscribeOptions {
  video?: string;
  model?: "tiny" | "base" | "small" | "medium" | "large-v3";
  part?: number;
  force?: boolean;
  pythonPath?: string;
}
