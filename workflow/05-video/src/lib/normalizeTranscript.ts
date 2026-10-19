import type { NormalizedCaption } from "./schema";

export interface NormalizationResult {
  captions: NormalizedCaption[];
  warnings: string[];
  formatDetected: string;
  stats: {
    wordCount: number;
    durationMs: number;
    gapCount: number;
  };
}

/**
 * Normalizes any supported transcript shape into Remotion Caption[] format.
 */
export function normalizeTranscript(
  rawInput: unknown,
  audioDurationSec?: number
): NormalizationResult {
  const warnings: string[] = [];
  let intermediateTokens: Array<{
    text: string;
    startMs: number;
    endMs: number;
    confidence: number | null;
  }> = [];

  let formatDetected = "unknown";

  // Case 1: Array of objects (could be Remotion Caption[] or array of words)
  if (Array.isArray(rawInput)) {
    if (rawInput.length > 0 && typeof rawInput[0].startMs === "number") {
      formatDetected = "remotion-caption-array";
      intermediateTokens = rawInput.map((c) => ({
        text: String(c.text || ""),
        startMs: Number(c.startMs),
        endMs: Number(c.endMs),
        confidence: c.confidence !== undefined ? c.confidence : null,
      }));
    } else if (rawInput.length > 0 && (rawInput[0].start !== undefined || rawInput[0].startMs !== undefined)) {
      formatDetected = "word-array";
      intermediateTokens = rawInput.map((w) => {
        const isMs = typeof w.startMs === "number";
        const startMs = isMs ? w.startMs : Math.round(Number(w.start) * 1000);
        const endMs = isMs ? w.endMs : Math.round(Number(w.end) * 1000);
        return {
          text: String(w.word || w.text || ""),
          startMs,
          endMs,
          confidence: w.confidence !== undefined ? Number(w.confidence) : null,
        };
      });
    }
  } else if (rawInput && typeof rawInput === "object") {
    const obj = rawInput as Record<string, any>;

    // Case 2: Whisper segments format { segments: [{ words: [...] }] }
    if (Array.isArray(obj.segments) && obj.segments.length > 0 && Array.isArray(obj.segments[0]?.words)) {
      formatDetected = "whisper-segments";
      for (const seg of obj.segments) {
        if (Array.isArray(seg.words)) {
          for (const w of seg.words) {
            intermediateTokens.push({
              text: String(w.word || w.text || ""),
              startMs: Math.round(Number(w.start) * 1000),
              endMs: Math.round(Number(w.end) * 1000),
              confidence: w.probability ?? w.confidence ?? null,
            });
          }
        }
      }
    }
    // Case 3: Plain or Whisper { words: [...] }
    else if (Array.isArray(obj.words)) {
      formatDetected = "whisper-words";
      for (const w of obj.words) {
        const isMs = typeof w.startMs === "number";
        const startMs = isMs ? w.startMs : Math.round(Number(w.start) * 1000);
        const endMs = isMs ? w.endMs : Math.round(Number(w.end) * 1000);
        intermediateTokens.push({
          text: String(w.word || w.text || ""),
          startMs,
          endMs,
          confidence: w.probability ?? w.confidence ?? null,
        });
      }
    }
    // Case 4: Studio Multi-Clip Transcription { clips: [{ duration, words: [...] }] }
    else if (Array.isArray(obj.clips) && obj.clips.length > 0) {
      formatDetected = "studio-clips";
      let clipOffsetMs = 0;
      for (const clip of obj.clips) {
        if (Array.isArray(clip.words)) {
          for (const w of clip.words) {
            const isMs = typeof w.startMs === "number";
            const startMs = clipOffsetMs + (isMs ? w.startMs : Math.round(Number(w.start) * 1000));
            const endMs = clipOffsetMs + (isMs ? w.endMs : Math.round(Number(w.end) * 1000));
            intermediateTokens.push({
              text: String(w.word || w.text || ""),
              startMs,
              endMs,
              confidence: w.probability ?? w.confidence ?? null,
            });
          }
        }
        const clipDurMs =
          typeof clip.durationMs === "number"
            ? clip.durationMs
            : Math.round((Number(clip.duration) || 0) * 1000);
        clipOffsetMs += clipDurMs;
      }
    }
    // Case 4: ElevenLabs character alignment { characters, character_start_times_seconds, character_end_times_seconds }
    else if (
      Array.isArray(obj.characters) &&
      Array.isArray(obj.character_start_times_seconds) &&
      Array.isArray(obj.character_end_times_seconds)
    ) {
      formatDetected = "elevenlabs-character-alignment";
      const chars = obj.characters as string[];
      const starts = obj.character_start_times_seconds as number[];
      const ends = obj.character_end_times_seconds as number[];

      let currentWord = "";
      let wordStartMs = -1;
      let wordEndMs = -1;

      for (let i = 0; i < chars.length; i++) {
        const ch = chars[i];
        const sMs = Math.round(starts[i] * 1000);
        const eMs = Math.round(ends[i] * 1000);

        if (ch.trim() === "") {
          if (currentWord.length > 0) {
            intermediateTokens.push({
              text: currentWord,
              startMs: wordStartMs,
              endMs: wordEndMs,
              confidence: null,
            });
            currentWord = "";
            wordStartMs = -1;
            wordEndMs = -1;
          }
        } else {
          if (wordStartMs === -1) wordStartMs = sMs;
          wordEndMs = eMs;
          currentWord += ch;
        }
      }

      if (currentWord.length > 0) {
        intermediateTokens.push({
          text: currentWord,
          startMs: wordStartMs,
          endMs: wordEndMs,
          confidence: null,
        });
      }
    }
  } else if (typeof rawInput === "string") {
    // Case 5: SRT or VTT string
    if (rawInput.includes("-->")) {
      formatDetected = "srt-or-vtt";
      warnings.push("WARN: approximate word timing (generated from cue character proportions)");
      intermediateTokens = parseSrtToWordTokens(rawInput);
    }
  }

  if (intermediateTokens.length === 0) {
    throw new Error(`Failed to parse transcript. Unrecognized format or empty input.`);
  }

  // --- Normalization Pass ---
  const cleaned: NormalizedCaption[] = [];
  let gapCount = 0;
  const punctuationRegex = /^[.,!?;:…—\-]+$/;

  for (let i = 0; i < intermediateTokens.length; i++) {
    const token = intermediateTokens[i];
    let rawText = token.text;

    // Skip completely empty whitespace tokens
    if (!rawText || rawText.trim() === "") {
      continue;
    }

    // Clamp negative timestamps
    let startMs = Math.max(0, token.startMs);
    let endMs = Math.max(startMs + 50, token.endMs);

    // If this token is standalone punctuation, merge into previous word
    if (punctuationRegex.test(rawText.trim()) && cleaned.length > 0) {
      const prev = cleaned[cleaned.length - 1];
      prev.text += rawText.trim();
      prev.endMs = Math.max(prev.endMs, endMs);
      continue;
    }

    // Standardize leading space:
    // Every word except the very first word in captions should have a leading space.
    const trimmed = rawText.trim();
    const formattedText = cleaned.length === 0 ? trimmed : ` ${trimmed}`;

    // Monotonicity & Overlap check with previous token
    if (cleaned.length > 0) {
      const prev = cleaned[cleaned.length - 1];

      // If overlap, trim previous endMs
      if (prev.endMs > startMs) {
        prev.endMs = startMs;
      }

      // Check for silence gap (> 1.5s)
      const silenceGap = startMs - prev.endMs;
      if (silenceGap > 1500) {
        gapCount++;
        warnings.push(
          `Gap of ${(silenceGap / 1000).toFixed(2)}s detected between "${prev.text.trim()}" (${(prev.endMs / 1000).toFixed(2)}s) and "${trimmed}" (${(startMs / 1000).toFixed(2)}s)`
        );
      }
    }

    cleaned.push({
      text: formattedText,
      startMs,
      endMs,
      timestampMs: Math.round((startMs + endMs) / 2),
      confidence: token.confidence,
    });
  }

  const durationMs = cleaned.length > 0 ? cleaned[cleaned.length - 1].endMs : 0;

  // Audio duration boundary checks
  if (audioDurationSec !== undefined) {
    const audioMs = Math.round(audioDurationSec * 1000);
    const diff = durationMs - audioMs;

    if (diff > 500) {
      warnings.push(
        `WARN: Last transcript word ends at ${(durationMs / 1000).toFixed(2)}s, which is ${(diff / 1000).toFixed(2)}s past audio duration (${audioDurationSec.toFixed(2)}s)`
      );
    } else if (audioMs - durationMs > 4000) {
      warnings.push(
        `WARN: Audio continues for ${((audioMs - durationMs) / 1000).toFixed(2)}s past the final spoken word`
      );
    }
  }

  return {
    captions: cleaned,
    warnings,
    formatDetected,
    stats: {
      wordCount: cleaned.length,
      durationMs,
      gapCount,
    },
  };
}

/**
 * Helper to parse SRT text and estimate word timings proportionally by character length.
 */
function parseSrtToWordTokens(srtText: string): Array<{
  text: string;
  startMs: number;
  endMs: number;
  confidence: number | null;
}> {
  const tokens: Array<{ text: string; startMs: number; endMs: number; confidence: number | null }> = [];
  const cueRegex = /(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*\r?\n([\s\S]*?)(?=\r?\n\r?\n|\r?\n\d+$|$)/g;

  function parseTime(timeStr: string): number {
    const [hms, ms] = timeStr.replace(".", ",").split(",");
    const [h, m, s] = hms.split(":").map(Number);
    return h * 3600000 + m * 60000 + s * 1000 + Number(ms);
  }

  let match: RegExpExecArray | null;
  while ((match = cueRegex.exec(srtText)) !== null) {
    const startMs = parseTime(match[1]);
    const endMs = parseTime(match[2]);
    const textContent = match[3].replace(/<[^>]*>/g, "").replace(/\r?\n/g, " ").trim();

    const words = textContent.split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;

    const cueDuration = Math.max(100, endMs - startMs);
    const totalChars = words.reduce((acc, w) => acc + w.length, 0);

    let currentStart = startMs;
    for (const w of words) {
      const proportion = totalChars > 0 ? w.length / totalChars : 1 / words.length;
      const wordDur = Math.max(50, Math.round(cueDuration * proportion));
      const wordEnd = Math.min(endMs, currentStart + wordDur);

      tokens.push({
        text: w,
        startMs: currentStart,
        endMs: wordEnd,
        confidence: null,
      });
      currentStart = wordEnd;
    }
  }

  return tokens;
}
