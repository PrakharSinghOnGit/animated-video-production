export interface WordTimestamp {
  word: string;
  start: number; // in seconds (2 decimals)
  end: number;   // in seconds (2 decimals)
  probability?: number;
  matched?: boolean; // script-aligned words: true when the ASR confirmed this word
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
  duration: number; // exact seconds (from the WAV header), not rounded
  durationMs?: number; // exact milliseconds; preferred by the video ingest
  text: string;
  words: WordTimestamp[];
  asr_words?: WordTimestamp[]; // raw ASR words, kept for debugging when `words` is script-aligned
  matchedPct?: number; // % of script display tokens confirmed by ASR (low = TTS babble)
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
  model?: string; // faster-whisper model name, e.g. small.en (default), base, medium.en
  part?: number;
  force?: boolean;
  pythonPath?: string;
}
