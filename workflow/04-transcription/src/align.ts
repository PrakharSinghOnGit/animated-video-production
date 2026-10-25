/**
 * Script-to-ASR alignment.
 *
 * Whisper hears TTS output imperfectly ("Appla", "10" for "ten", "Oswald" for "Wall"),
 * but the script text is known. We keep the ASR only for TIMING: the script's spoken
 * words are aligned to the ASR words (Needleman-Wunsch), timings are copied across, and
 * the result is reported per DISPLAY token (what captions show, punctuation attached).
 */
import { normalizeForSpeech } from "../../03-voiceover/src/normalize";

export interface AsrWord {
  word: string;
  start: number;
  end: number;
  probability?: number;
}

export interface AlignedWord {
  word: string; // display token as written (markdown stripped, punctuation kept)
  start: number;
  end: number;
  matched: boolean;
}

export interface AlignOptions {
  clipStart?: number; // default 0
  clipEnd?: number; // default: end of last ASR word
}

interface Timed {
  w: string; // comparable form: lowercase, punctuation stripped
  owner: number; // display token index (script side) or ASR word index (asr side)
  start: number;
  end: number;
}

const GAP = 1;
const SUB = 0.9;
const NEAR = 0.25;

/** Local markdown strip (the TTS normalizer's helper is private). */
export function stripMarkdownText(t: string): string {
  return t
    .replace(/^[ \t]{0,3}(?:#{1,6}|>|[-*+])[ \t]+/gm, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`+([^`]*)`+/g, "$1")
    .replace(/\*\*(.+?)\*\*/gs, "$1")
    .replace(/__(.+?)__/gs, "$1")
    .replace(/\*(.+?)\*/gs, "$1")
    .replace(/(?<![A-Za-z\d])_(.+?)_(?![A-Za-z\d])/gs, "$1")
    .replace(/\*+/g, "")
    .replace(/_+/g, " ");
}

export function displayTokens(displayText: string): string[] {
  // Whitespace split; em/en dashes joining two words ("market—yet") also split, dash kept on the left piece.
  return stripMarkdownText(displayText)
    .split(/\s+/)
    .flatMap((t) => t.split(/(?<=[A-Za-z0-9.,!?'’”"%)][—–])(?=[A-Za-z0-9$“"(])/))
    .filter(Boolean);
}

/** Spoken, comparable words for a chunk of text. */
export function spokenWords(text: string): string[] {
  return normalizeForSpeech(text)
    .toLowerCase()
    .replace(/[^a-z0-9'’\s]/g, " ")
    .replace(/['’]/g, "'")
    .split(/\s+/)
    .map((w) => w.replace(/^'+|'+$/g, ""))
    .filter(Boolean);
}

export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

function isNear(a: string, b: string): boolean {
  return a.length >= 5 && b.length >= 5 && editDistance(a, b) <= 1;
}

function pairCost(a: string, b: string): number {
  if (a === b) return 0;
  return isNear(a, b) ? NEAR : SUB;
}

export function alignScriptToAsr(displayText: string, asrWords: AsrWord[], opts: AlignOptions = {}): AlignedWord[] {
  const tokens = displayTokens(displayText);
  if (tokens.length === 0) return [];

  // Script side: flatten spoken expansion with back-pointers to display tokens.
  const script: Timed[] = [];
  tokens.forEach((tok, ti) => {
    for (const w of spokenWords(tok)) script.push({ w, owner: ti, start: NaN, end: NaN });
  });

  // ASR side: normalize each word the same way, splitting its timing evenly.
  const asr: Timed[] = [];
  asrWords.forEach((aw, ai) => {
    const parts = spokenWords(aw.word);
    const span = (aw.end - aw.start) / (parts.length || 1);
    parts.forEach((w, k) => asr.push({ w, owner: ai, start: aw.start + k * span, end: aw.start + (k + 1) * span }));
  });

  const clipStart = opts.clipStart ?? 0;
  const clipEnd = opts.clipEnd ?? asr.reduce((m, a) => Math.max(m, a.end), clipStart);

  // Needleman-Wunsch.
  const n = script.length;
  const m = asr.length;
  const dp: Float64Array[] = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  for (let i = 1; i <= n; i++) dp[i][0] = i * GAP;
  for (let j = 1; j <= m; j++) dp[0][j] = j * GAP;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j - 1] + pairCost(script[i - 1].w, asr[j - 1].w),
        dp[i - 1][j] + GAP,
        dp[i][j - 1] + GAP
      );
    }
  }

  // Traceback: pair[i] = asr index aligned to script word i (or -1); good[i] = exact/near match.
  const pair = new Array<number>(n).fill(-1);
  const good = new Array<boolean>(n).fill(false);
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && Math.abs(dp[i][j] - (dp[i - 1][j - 1] + pairCost(script[i - 1].w, asr[j - 1].w))) < 1e-9) {
      pair[i - 1] = j - 1;
      good[i - 1] = script[i - 1].w === asr[j - 1].w || isNear(script[i - 1].w, asr[j - 1].w);
      i--;
      j--;
    } else if (i > 0 && Math.abs(dp[i][j] - (dp[i - 1][j] + GAP)) < 1e-9) {
      i--;
    } else {
      j--;
    }
  }

  // Copy timings, then interpolate runs of unaligned words by character length.
  for (let k = 0; k < n; k++) {
    if (pair[k] >= 0) {
      script[k].start = asr[pair[k]].start;
      script[k].end = asr[pair[k]].end;
    }
  }
  for (let k = 0; k < n; ) {
    if (pair[k] >= 0) {
      k++;
      continue;
    }
    let e = k;
    while (e < n && pair[e] < 0) e++;
    const lo = k > 0 ? script[k - 1].end : clipStart;
    const hi = e < n ? script[e].start : clipEnd;
    const span = Math.max(0, hi - lo);
    const total = script.slice(k, e).reduce((s, w) => s + w.w.length, 0) || 1;
    let t = lo;
    for (let q = k; q < e; q++) {
      const d = (span * script[q].w.length) / total;
      script[q].start = t;
      script[q].end = t + d;
      t += d;
    }
    k = e;
  }

  // Clamp to clip bounds; enforce monotonic, non-overlapping times.
  let cursor = clipStart;
  for (const w of script) {
    const s = Math.min(Math.max(w.start, cursor, clipStart), Math.max(clipEnd, clipStart));
    const e = Math.min(Math.max(w.end, s), Math.max(clipEnd, s));
    w.start = s;
    w.end = e;
    cursor = e;
  }

  // Group back to display tokens.
  const out: AlignedWord[] = tokens.map((word) => ({ word, start: NaN, end: NaN, matched: false }));
  const counts = tokens.map(() => ({ total: 0, good: 0 }));
  script.forEach((w, k) => {
    const o = out[w.owner];
    if (Number.isNaN(o.start)) o.start = w.start;
    o.end = w.end;
    counts[w.owner].total++;
    if (good[k]) counts[w.owner].good++;
  });
  let prevEnd = clipStart;
  out.forEach((o, ti) => {
    if (Number.isNaN(o.start)) {
      // Token with no spoken form (e.g. a lone dash): collapse onto the previous boundary.
      o.start = prevEnd;
      o.end = prevEnd;
    }
    o.matched = counts[ti].total > 0 && counts[ti].good * 2 >= counts[ti].total;
    prevEnd = o.end;
  });
  return out;
}

/** Fraction (0..1) of display tokens that matched an ASR word. */
export function matchedFraction(aligned: AlignedWord[]): number {
  return aligned.length === 0 ? 0 : aligned.filter((a) => a.matched).length / aligned.length;
}
