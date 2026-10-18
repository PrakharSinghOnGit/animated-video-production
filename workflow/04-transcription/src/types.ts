export interface WordTimestamp {
  word: string;
  start: number; // in seconds (2 decimals)
  end: number;   // in seconds (2 decimals)
  probability?: number;
}

export interface SegmentTimestamp {
  id: number;
  start: number;
  end: number;
  text: string;
}

export interface ClipTranscript {
  file?: string;
  part: number;
  sectionId: string;
  duration: number;
  text: string;
  words: WordTimestamp[];
  segments?: SegmentTimestamp[];
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
