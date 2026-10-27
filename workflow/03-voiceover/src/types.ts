export interface VOSection {
  id: string;
  part: number;
  partTitle: string;
  /** on the first section of a chapter: the title shown while the narration pauses */
  chapterTitle?: string;
  clips: string;
  rawInstruction: string;
  text: string;
  pace: number;          // 0.5 - 2.0 (Bulbul v4 Flash default: 1.0)
  pitch: number;         // -0.5 - 0.5 (Bulbul v4 Flash default: 0.0)
  loudness: number;      // 0.1 - 2.5 (Bulbul v4 Flash default: 1.0)
  speed?: number;        // Local F5-TTS speed multiplier (default: 1.0, range 0.7 - 1.5)
  outputFileName?: string;
  notes?: string;
}

export interface GenerationOptions {
  video?: string;           // Target video workspace (e.g. 'VID01_Currency_Market')
  part?: number;            // 1-7
  sectionId?: string;       // e.g. 'part1_01_shadow_market'
  dryRun?: boolean;
  forceOverwrite?: boolean;
  outputDir?: string;
  combinePart?: boolean;
  combineAll?: boolean;
  listOnly?: boolean;
  costOnly?: boolean;
  ttsModel?: "chatterbox" | "f5"; // Local model (default chatterbox)
  exaggeration?: number;    // Chatterbox: emotional intensity 0.25-2 (default 0.5; ~0.7 for punchy narration)
  cfgWeight?: number;       // Chatterbox: lower = slower, looser pacing (default 0.5)
  temperature?: number;     // Chatterbox: sampling temperature (default 0.8)
  pace?: number;            // Tempo applied to the chosen take, pitch preserved (default 0.9 Chatterbox, 1 F5)
  sentenceGap?: number;     // seconds between sentences (Chatterbox default 0.6)
  sectionGap?: number;      // seconds after each section (default 0.9)
  chapterGap?: number;      // seconds at a part/chapter change (default 0 = off)
  pauseMs?: number;         // Silence between sentence chunks (default 350 Chatterbox, 250 F5)
  voiceDir?: string;
  remakeVoice?: boolean;
  takes?: number;           // Local: takes per chunk, best scored by ASR (default 3, 1 = fast single take)
  acceptWer?: number;       // Local: stop taking new seeds once a take scores <= this (default 0.05)
  asrModel?: string;        // faster-whisper model used to score takes (default small.en)
  checkRef?: boolean;       // Transcribe the reference clip and compare with its configured text
  expressionScale?: number; // F5: scales per-section speed offsets (1.0 = as set)
}
