import { CONFIG } from "./config";
import type { SarvamTTSRequest, SarvamTTSResponse } from "./types";

export class SarvamClient {
  private apiKey: string;
  private apiUrl: string;

  constructor(apiKey?: string, apiUrl?: string) {
    this.apiKey = apiKey || CONFIG.apiKey;
    this.apiUrl = apiUrl || CONFIG.apiUrl;
  }

  /**
   * Synthesize speech using the Sarvam Bulbul v4 Flash model.
   * Includes exponential backoff retry for HTTP 429 and network glitches.
   */
  async synthesize(params: {
    text: string;
    speaker: string;
    pace?: number;
    pitch?: number;
    loudness?: number;
    speechSampleRate?: number;
    outputAudioCodec?: "wav" | "mp3" | "flac" | "aac";
    languageCode?: string;
  }): Promise<Buffer> {
    if (!this.apiKey) {
      throw new Error(
        "Missing SARVAM_API_KEY. Please set SARVAM_API_KEY in your .env file or pass via --api-key <key>."
      );
    }

    const payload: SarvamTTSRequest = {
      text: params.text,
      language_code: params.languageCode || CONFIG.languageCode,
      model: CONFIG.model,
      speaker: params.speaker || CONFIG.defaultSpeaker,
      speech_sample_rate: params.speechSampleRate || CONFIG.defaultSampleRate,
      output_audio_codec: params.outputAudioCodec || (CONFIG.defaultCodec as any),
      pace: params.pace !== undefined ? params.pace : 1.0,
      pitch: params.pitch !== undefined ? params.pitch : 0.0,
      loudness: params.loudness !== undefined ? params.loudness : 1.0,
      enable_preprocessing: CONFIG.enablePreprocessing,
    };

    // Range safety validations
    if (payload.pace < 0.5 || payload.pace > 2.0) {
      throw new Error(`Pace ${payload.pace} out of range [0.5, 2.0]`);
    }
    if (payload.pitch < -0.5 || payload.pitch > 0.5) {
      throw new Error(`Pitch ${payload.pitch} out of range [-0.5, 0.5]`);
    }
    if (payload.loudness < 0.1 || payload.loudness > 2.5) {
      throw new Error(`Loudness ${payload.loudness} out of range [0.1, 2.5]`);
    }

    const maxAttempts = 4;
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt < maxAttempts) {
      attempt++;
      try {
        const response = await fetch(this.apiUrl, {
          method: "POST",
          headers: {
            "api-subscription-key": this.apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorText = await response.text();
          if (response.status === 429 && attempt < maxAttempts) {
            const delayMs = Math.pow(2, attempt) * 1000 + Math.random() * 500;
            console.warn(
              `⚠️ Sarvam API rate limited (429). Retrying in ${(delayMs / 1000).toFixed(1)}s (attempt ${attempt}/${maxAttempts})...`
            );
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            continue;
          }

          let errorMessage = `Sarvam API error (${response.status} ${response.statusText}): ${errorText}`;
          if (response.status === 400) {
            errorMessage += "\nTip: Verify speaker ID and parameter ranges.";
          } else if (response.status === 403) {
            errorMessage += "\nTip: Verify your SARVAM_API_KEY in .env.";
          }
          throw new Error(errorMessage);
        }

        const data = (await response.json()) as SarvamTTSResponse;

        if (!data.audios || data.audios.length === 0) {
          throw new Error("Sarvam API returned no audio content in 'audios' array.");
        }

        // Decode base64 audio chunks to binary Buffer
        const combinedBase64 = data.audios.join("");
        return Buffer.from(combinedBase64, "base64");
      } catch (err: any) {
        lastError = err;
        if (err.message && err.message.includes("429") && attempt < maxAttempts) {
          continue;
        }
        if (attempt >= maxAttempts) break;
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }

    throw lastError || new Error("Failed to synthesize audio after multiple attempts.");
  }
}
