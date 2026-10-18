import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface AudioProbeResult {
  durationSec: number;
  durationMs: number;
  sampleRate: number;
  channels: number;
  codec: string;
  sizeBytes: number;
  bitRate?: number;
}

/**
 * Probes an audio file using ffprobe.
 */
export async function probeAudio(filePath: string): Promise<AudioProbeResult> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration,size,bit_rate:stream=codec_name,sample_rate,channels",
      "-of",
      "json",
      filePath,
    ]);

    const data = JSON.parse(stdout);
    const format = data.format || {};
    const stream = (data.streams && data.streams[0]) || {};

    const durationSec = Number(format.duration || stream.duration || 0);
    const durationMs = Math.round(durationSec * 1000);
    const sampleRate = Number(stream.sample_rate || 44100);
    const channels = Number(stream.channels || 2);
    const codec = String(stream.codec_name || "unknown");
    const sizeBytes = Number(format.size || 0);
    const bitRate = format.bit_rate ? Number(format.bit_rate) : undefined;

    return {
      durationSec,
      durationMs,
      sampleRate,
      channels,
      codec,
      sizeBytes,
      bitRate,
    };
  } catch (error: any) {
    throw new Error(`Failed to probe audio file at "${filePath}": ${error.message}`);
  }
}
