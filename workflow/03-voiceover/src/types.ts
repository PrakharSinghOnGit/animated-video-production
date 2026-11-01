export type TtsModel = "qwen" | "gemini";
export const TTS_MODELS: TtsModel[] = ["qwen", "gemini"];

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
  ttsModel?: TtsModel;      // default TTS_ENGINE in .env, else gemini
  noMoods?: boolean;        // ignore tone notes: every section uses the main reference
  voiceProfile?: string;    // clone voices/<name> instead of the channel voice (voices/ACTIVE)
  voice?: string;           // Gemini: prebuilt voice name (default Algenib) or a replicated voice id
  style?: string;           // Gemini: delivery direction, e.g. "calm, authoritative documentary narrator"
  geminiModel?: string;     // Gemini: model id (default gemini-3.8-flash-tts)
  temperature?: number;     // Qwen sampling temperature (model default when unset)
  pace?: number;            // Tempo applied to the chosen take, pitch preserved (default 1)
  parallel?: number;        // Gemini requests in flight at once (default 4)
  sentenceGap?: number;     // seconds between passages of one block (default 0.45)
  sectionGap?: number;      // seconds after each section (default 0.9)
  chapterGap?: number;      // seconds at a part/chapter change (default 0 = off)
  pauseMs?: number;         // Silence between passages (default from sentenceGap)
  takes?: number;           // Local: takes per chunk, best scored by ASR (default 3, 1 = fast single take)
  acceptWer?: number;       // Local: stop taking new seeds once a take scores <= this (default 0.05)
  asrModel?: string;        // faster-whisper model used to score takes (default small.en)
  checkRef?: boolean;       // Transcribe the reference clip and compare with its configured text
}
