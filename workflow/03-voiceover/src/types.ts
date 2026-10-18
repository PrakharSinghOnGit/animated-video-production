export interface VOSection {
  id: string;
  part: number;
  partTitle: string;
  clips: string;
  rawInstruction: string;
  text: string;
  pace: number;          // 0.5 - 2.0 (Bulbul v4 Flash default: 1.0)
  pitch: number;         // -0.5 - 0.5 (Bulbul v4 Flash default: 0.0)
  loudness: number;      // 0.1 - 2.5 (Bulbul v4 Flash default: 1.0)
  speaker?: string;      // Persona ID, e.g., 'varun_en_suspense'
  speech_sample_rate?: 8000 | 16000 | 22050 | 24000 | 32000 | 44100 | 48000;
  output_audio_codec?: "wav" | "mp3" | "flac" | "aac";
  outputFileName?: string;
  notes?: string;
}

export interface SarvamTTSRequest {
  text: string;
  language_code: string;
  model: "bulbul:v4-flash";
  speaker: string;
  speech_sample_rate: number;
  output_audio_codec: "wav" | "mp3" | "flac" | "aac";
  pace: number;
  pitch: number;
  loudness: number;
  enable_preprocessing: boolean;
}

export interface SarvamTTSResponse {
  audios: string[]; // Base64 encoded audio clips
  request_id?: string;
}

export interface GenerationOptions {
  video?: string;           // Target video workspace (e.g. 'VID01_Currency_Market')
  part?: number;            // 1-7
  sectionId?: string;       // e.g. 'part1_01_shadow_market'
  speakerOverride?: string; // e.g. 'varun_en_suspense'
  dryRun?: boolean;
  forceOverwrite?: boolean;
  outputDir?: string;
  combinePart?: boolean;
  combineAll?: boolean;
  listOnly?: boolean;
  costOnly?: boolean;
  apiKey?: string;
  sampleRate?: number;
  codec?: "wav" | "mp3";
  expressionScale?: number; // Master multiplier: 0.0 = neutral, 1.0 = full set, 0.3 = 30%
  paceScale?: number;
  pitchScale?: number;
  loudnessScale?: number;
}
