import fs from "fs";
import path from "path";

export const CONFIG = {
  // Sarvam Bulbul v4 Flash API endpoint
  apiUrl: "https://api.sarvam.ai/text-to-speech",

  // API Key from process environment or .env
  apiKey: process.env.SARVAM_API_KEY || "",

  // Model parameters
  model: "bulbul:v4-flash" as const,
  languageCode: "en-IN",

  // Default persona for finance video voiceovers
  defaultSpeaker: process.env.SARVAM_DEFAULT_SPEAKER || "varun_en_suspense",

  // Default active video project in workspace/
  defaultVideo: process.env.ACTIVE_VIDEO || "VID01_Currency_Market",

  // Broadcast-grade audio output settings
  defaultSampleRate: parseInt(process.env.SARVAM_SAMPLE_RATE || "48000", 10),
  defaultCodec: (process.env.SARVAM_CODEC as "wav" | "mp3") || "wav",

  // Preprocessing normalises numbers, dates, currency
  enablePreprocessing: true,

  // Expression scaling multiplier (0.0 = neutral, 1.0 = 100% full, 0.3 = 30% subtle)
  // Neutral baselines: pace = 1.0, pitch = 0.0, loudness = 1.0
  expressionScale: parseFloat(process.env.SARVAM_EXPRESSION_SCALE || "0.3"),
  paceScale: process.env.SARVAM_PACE_SCALE ? parseFloat(process.env.SARVAM_PACE_SCALE) : undefined,
  pitchScale: process.env.SARVAM_PITCH_SCALE ? parseFloat(process.env.SARVAM_PITCH_SCALE) : undefined,
  loudnessScale: process.env.SARVAM_LOUDNESS_SCALE ? parseFloat(process.env.SARVAM_LOUDNESS_SCALE) : undefined,

  // Root workspace directory
  workspaceDir: fs.existsSync(path.resolve(process.cwd(), "workspace"))
    ? path.resolve(process.cwd(), "workspace")
    : path.resolve(__dirname, "../../../workspace"),
};
